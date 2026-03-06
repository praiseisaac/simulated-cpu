/**
 * @module Core.service
 *
 * A single CPU core with a three-stage pipeline (FETCH → DECODE → EXECUTE),
 * four general-purpose 8-bit registers (R0–R3), a program counter,
 * status flags, and hardware interrupt support with context save/restore.
 */

import {
  Opcode,
  INSTRUCTION_WIDTH,
  PipelineStage,
  type CoreState,
  type Instruction,
  type Registers,
  type RegisterName,
  type StatusFlags,
} from "@/types/cpu.types";
import type { CoreSnapshot } from "@/types/persistence.types";
import { decode, disassemble } from "@/services/cpu/InstructionDecoder.service";
import type { MemoryService } from "@/services/Memory.service";
import { MEMORY_SIZE } from "@/types/memory.types";

// ─── Callback Types ─────────────────────────────────────────────────────────

/** Saved register/PC/flags frame pushed on interrupt entry, popped on IRET. */
interface InterruptFrame {
  registers: Registers;
  pc: number;
  flags: StatusFlags;
}

/**
 * Optional lifecycle callbacks that the CPU/tests can attach to a core
 * to observe pipeline stages and interrupt transitions.
 */
export interface CoreCallbacks {
  onFetch?: (coreId: number, pc: number, raw: Uint8Array) => void;
  onDecode?: (coreId: number, instruction: Instruction) => void;
  onExecute?: (coreId: number, instruction: Instruction, state: CoreState) => void;
  onInterruptBegin?: (coreId: number, handlerAddress: number) => void;
  onInterruptReturn?: (coreId: number) => void;
}

// ─── Register Helpers ───────────────────────────────────────────────────────

const REG_NAMES: RegisterName[] = ["R0", "R1", "R2", "R3"];

function regName(index: number): RegisterName {
  return REG_NAMES[index];
}

function createEmptyRegisters(): Registers {
  return { R0: 0, R1: 0, R2: 0, R3: 0 };
}

function createEmptyFlags(): StatusFlags {
  return { zero: false, carry: false, halted: false };
}

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * A single CPU core with a three-stage pipeline and interrupt support.
 *
 * Each call to {@link tick} advances the pipeline by one stage:
 * `FETCH → DECODE → EXECUTE → (back to FETCH)`.
 *
 * Interrupt handling pushes the current register/PC/flags context onto
 * an internal stack and jumps to the ISR.  `IRET` pops and restores context.
 *
 * The core wraps its PC at `MEMORY_SIZE` to prevent out-of-bounds fetches.
 */
export class Core {
  readonly coreId: number;

  private registers: Registers;
  private pc: number;
  private ir: Uint8Array;
  private currentInstruction: Instruction | null;
  private flags: StatusFlags;
  private pipelineStage: PipelineStage;
  private callbacks: CoreCallbacks;
  private interruptStack: InterruptFrame[];

  constructor(coreId: number, callbacks: CoreCallbacks = {}) {
    this.coreId = coreId;
    this.registers = createEmptyRegisters();
    this.pc = 0;
    this.ir = new Uint8Array(INSTRUCTION_WIDTH);
    this.currentInstruction = null;
    this.flags = createEmptyFlags();
    this.pipelineStage = PipelineStage.IDLE;
    this.callbacks = callbacks;
    this.interruptStack = [];
  }

  // ── Pipeline Stages ───────────────────────────────────────────────────

  /**
   * FETCH: Read 4 bytes from memory at the current PC.
   */
  private fetch(memory: MemoryService): Uint8Array {
    this.pipelineStage = PipelineStage.FETCH;
    const raw = memory.readBytes(this.pc, INSTRUCTION_WIDTH);
    this.ir = raw.slice();
    this.callbacks.onFetch?.(this.coreId, this.pc, raw);
    return raw;
  }

  /**
   * DECODE: Parse raw bytes into a structured instruction.
   */
  private decodeInstruction(raw: Uint8Array): Instruction {
    this.pipelineStage = PipelineStage.DECODE;
    const instruction = decode(raw);
    this.currentInstruction = instruction;
    this.callbacks.onDecode?.(this.coreId, instruction);
    return instruction;
  }

  /**
   * EXECUTE: Perform the operation, update registers / flags / PC.
   */
  private execute(instruction: Instruction, memory: MemoryService): void {
    this.pipelineStage = PipelineStage.EXECUTE;

    switch (instruction.opcode) {
      case Opcode.NOP: {
        // No operation — just advance the program counter
        this.pc += INSTRUCTION_WIDTH;
        break;
      }

      case Opcode.LOAD: {
        const value = memory.read(instruction.address);
        this.registers[regName(instruction.reg1)] = value;
        this.pc += INSTRUCTION_WIDTH;
        this.updateFlags(value);
        break;
      }

      case Opcode.STORE: {
        const value = this.registers[regName(instruction.reg1)];
        memory.write(instruction.address, value);
        this.pc += INSTRUCTION_WIDTH;
        // STORE doesn't update ALU flags
        break;
      }

      case Opcode.ADD: {
        const a = this.registers[regName(instruction.reg1)];
        const b = this.registers[regName(instruction.reg2)];
        const result = a + b;
        this.registers[regName(instruction.reg1)] = result & 0xff;
        this.flags.carry = result > 0xff;
        this.flags.zero = (result & 0xff) === 0;
        this.pc += INSTRUCTION_WIDTH;
        break;
      }

      case Opcode.SUB: {
        const a = this.registers[regName(instruction.reg1)];
        const b = this.registers[regName(instruction.reg2)];
        const result = a - b;
        this.registers[regName(instruction.reg1)] = result & 0xff; // wraps unsigned
        this.flags.carry = result < 0; // borrow
        this.flags.zero = (result & 0xff) === 0;
        this.pc += INSTRUCTION_WIDTH;
        break;
      }

      case Opcode.JMP: {
        this.pc = instruction.address;
        break;
      }

      case Opcode.IRET: {
        const frame = this.interruptStack.pop();
        if (frame) {
          this.registers = { ...frame.registers };
          this.pc = frame.pc;
          this.flags = { ...frame.flags };
          this.callbacks.onInterruptReturn?.(this.coreId);
        } else {
          // No ISR frame — not in an interrupt context, just skip
          this.pc += INSTRUCTION_WIDTH;
        }
        break;
      }

      case Opcode.HALT: {
        this.flags.halted = true;
        this.pipelineStage = PipelineStage.IDLE;
        break;
      }
    }

    this.callbacks.onExecute?.(this.coreId, instruction, this.getState());
  }

  // ── Tick (one full clock cycle) ───────────────────────────────────────

  /**
   * Perform one clock cycle: fetch → decode → execute.
   * Returns the core state after execution. No-ops if halted.
   */
  tick(memory: MemoryService): CoreState {
    if (this.flags.halted) {
      this.pipelineStage = PipelineStage.IDLE;
      return this.getState();
    }

    // Wrap PC if it would read past memory boundary
    if (this.pc + INSTRUCTION_WIDTH > MEMORY_SIZE) {
      this.pc = 0;
    }

    const raw = this.fetch(memory);
    const instruction = this.decodeInstruction(raw);
    this.execute(instruction, memory);

    return this.getState();
  }

  // ── State Access ──────────────────────────────────────────────────────
  /** Return a snapshot of the core's current internal state. */  getState(): CoreState {
    return {
      coreId: this.coreId,
      registers: { ...this.registers },
      pc: this.pc,
      ir: this.ir.slice(),
      currentInstruction: this.currentInstruction,
      flags: { ...this.flags },
      pipelineStage: this.pipelineStage,
      assignedProcess: null, // managed by scheduler later
      servicingInterrupt: this.interruptStack.length > 0,
    };
  }

  /** Whether the core's halted flag is set. */
  isHalted(): boolean {
    return this.flags.halted;
  }

  /** Current program counter value. */
  getPC(): number {
    return this.pc;
  }

  /** Copy of the current register file. */
  getRegisters(): Registers {
    return { ...this.registers };
  }

  /** Copy of the current status flags. */
  getFlags(): StatusFlags {
    return { ...this.flags };
  }

  // ── Interrupt Handling ─────────────────────────────────────────────────

  /**
   * Push the current context onto the interrupt stack and jump to the
   * given handler address. If the core was halted, it is un-halted so
   * the ISR can execute.
   */
  handleInterrupt(handlerAddress: number): void {
    // Save current state
    this.interruptStack.push({
      registers: { ...this.registers },
      pc: this.pc,
      flags: { ...this.flags },
    });

    // Jump to ISR
    this.pc = handlerAddress;
    this.flags.halted = false;
    this.pipelineStage = PipelineStage.IDLE;
    this.callbacks.onInterruptBegin?.(this.coreId, handlerAddress);
  }

  /**
   * Whether the core is currently inside an interrupt service routine
   * (i.e. has at least one saved frame on the interrupt stack).
   */
  isServicingInterrupt(): boolean {
    return this.interruptStack.length > 0;
  }

  /**
   * Depth of the interrupt stack (0 = normal execution).
   */
  getInterruptDepth(): number {
    return this.interruptStack.length;
  }

  // ── Context Save / Restore (for scheduler) ────────────────────────────

  /**
   * Save the core's register/PC/flags triplet (used by the scheduler
   * when context-switching away from a process).
   */
  saveContext(): { registers: Registers; pc: number; flags: StatusFlags } {
    return {
      registers: { ...this.registers },
      pc: this.pc,
      flags: { ...this.flags },
    };
  }

  /**
   * Load a previously saved register/PC/flags triplet into the core
   * (used by the scheduler when dispatching a process to this core).
   */
  restoreContext(ctx: { registers: Registers; pc: number; flags: StatusFlags }): void {
    this.registers = { ...ctx.registers };
    this.pc = ctx.pc;
    this.flags = { ...ctx.flags };
    this.currentInstruction = null;
    this.pipelineStage = PipelineStage.IDLE;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /** Reset the core to a blank state (all zeros, IDLE, empty interrupt stack). */
  reset(): void {
    this.registers = createEmptyRegisters();
    this.pc = 0;
    this.ir = new Uint8Array(INSTRUCTION_WIDTH);
    this.currentInstruction = null;
    this.flags = createEmptyFlags();
    this.pipelineStage = PipelineStage.IDLE;
    this.interruptStack = [];
  }

  // ── Serialisation ───────────────────────────────────────────────────

  /** Serialise the core's full state to a JSON-safe snapshot. */
  toJSON(): CoreSnapshot {
    return {
      coreId: this.coreId,
      registers: { ...this.registers },
      pc: this.pc,
      ir: Array.from(this.ir),
      flags: { ...this.flags },
      pipelineStage: this.pipelineStage,
      interruptStack: this.interruptStack.map((frame) => ({
        registers: { ...frame.registers },
        pc: frame.pc,
        flags: { ...frame.flags },
      })),
    };
  }

  /** Restore the core from a previously serialised snapshot. */
  restoreFromSnapshot(snapshot: CoreSnapshot): void {
    this.registers = { ...snapshot.registers };
    this.pc = snapshot.pc;
    this.ir = new Uint8Array(snapshot.ir);
    this.flags = { ...snapshot.flags };
    this.pipelineStage = snapshot.pipelineStage as PipelineStage;
    this.currentInstruction = null;
    this.interruptStack = snapshot.interruptStack.map((frame) => ({
      registers: { ...frame.registers },
      pc: frame.pc,
      flags: { ...frame.flags },
    }));
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private updateFlags(value: number): void {
    this.flags.zero = value === 0;
    // carry not affected by LOAD
  }
}

export { disassemble };
