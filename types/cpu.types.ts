/**
 * @module cpu.types
 *
 * Core type definitions for the simulated CPU.
 * Covers opcodes, registers, instructions, pipeline stages, process control,
 * scheduling algorithms, and the per-tick clock event payload.
 */

// ─── Opcodes ────────────────────────────────────────────────────────────────

/**
 * The instruction set supported by the simulated CPU.
 *
 * Each opcode is encoded as a single byte (the first byte of a 4-byte
 * fixed-width instruction word).
 *
 * | Opcode | Mnemonic | Description                              |
 * |--------|----------|------------------------------------------|
 * | 0x00   | NOP      | No operation (uninitialized-memory guard) |
 * | 0x01   | LOAD     | Load value from memory into a register   |
 * | 0x02   | STORE    | Store register value into memory         |
 * | 0x03   | ADD      | Add two registers (Rd = Rd + Rs)         |
 * | 0x04   | SUB      | Subtract two registers (Rd = Rd − Rs)    |
 * | 0x05   | JMP      | Unconditional jump to address            |
 * | 0xFE   | IRET     | Return from interrupt service routine    |
 * | 0xFF   | HALT     | Stop core execution                      |
 */
export enum Opcode {
  NOP   = 0x00, // NOP             — No operation; halts (uninitialized memory guard)
  LOAD  = 0x01, // LOAD  Rd, addr  — Load value from memory[addr] into Rd
  STORE = 0x02, // STORE Rs, addr  — Store value from Rs into memory[addr]
  ADD   = 0x03, // ADD   Rd, Rs    — Rd = Rd + Rs
  SUB   = 0x04, // SUB   Rd, Rs    — Rd = Rd - Rs
  JMP   = 0x05, // JMP   addr      — Set PC to addr
  IRET  = 0xFE, // IRET            — Return from interrupt service routine
  HALT  = 0xFF, // HALT            — Stop execution
}

// ─── Registers ──────────────────────────────────────────────────────────────

/** Union of the four general-purpose register names. */
export type RegisterName = "R0" | "R1" | "R2" | "R3";

/** A record mapping each register name to its 8-bit unsigned value (0–255). */
export type Registers = Record<RegisterName, number>;

// ─── Instructions ───────────────────────────────────────────────────────────

/**
 * Fixed-width instruction: 4 bytes
 *   Byte 0: opcode
 *   Byte 1: register operand (index 0–3, or 0x00 if unused)
 *   Byte 2–3: address / immediate (big-endian 16-bit, or second register in byte 2)
 *
 * Encoding per opcode:
 *   LOAD  Rd, addr  → [0x01, Rd,  addrHi, addrLo]
 *   STORE Rs, addr  → [0x02, Rs,  addrHi, addrLo]
 *   ADD   Rd, Rs    → [0x03, Rd,  Rs,     0x00  ]
 *   SUB   Rd, Rs    → [0x04, Rd,  Rs,     0x00  ]
 *   JMP   addr      → [0x05, 0x00, addrHi, addrLo]
 *   IRET            → [0xFE, 0x00, 0x00,   0x00  ]
 *   HALT            → [0xFF, 0x00, 0x00,   0x00  ]
 */
export interface Instruction {
  opcode: Opcode;
  reg1: number;      // destination or source register index (0–3)
  reg2: number;      // second register index (ADD/SUB) — 0 if unused
  address: number;   // 16-bit address/immediate (LOAD/STORE/JMP) — 0 if unused
  raw: Uint8Array;   // the original 4 bytes
}

// ─── Instruction Width ──────────────────────────────────────────────────────

/** Number of bytes per instruction (fixed-width encoding). */
export const INSTRUCTION_WIDTH = 4;

// ─── Status Flags ───────────────────────────────────────────────────────────

/**
 * CPU status flags set by ALU operations and control instructions.
 *
 * @property zero   - `true` when the last ALU result was 0.
 * @property carry  - `true` when the last ALU result overflowed 8 bits.
 * @property halted - `true` when the core has executed a HALT instruction.
 */
export interface StatusFlags {
  zero: boolean;
  carry: boolean;
  halted: boolean;
}

// ─── Pipeline Stage ─────────────────────────────────────────────────────────

/**
 * The stage a CPU core is in during its instruction pipeline.
 *
 * - **IDLE** — Core has no assigned work.
 * - **FETCH** — Reading the next 4-byte instruction from memory.
 * - **DECODE** — Parsing the raw bytes into an {@link Instruction}.
 * - **EXECUTE** — Performing the decoded operation (ALU / memory / jump).
 */
export enum PipelineStage {
  IDLE    = "IDLE",
  FETCH   = "FETCH",
  DECODE  = "DECODE",
  EXECUTE = "EXECUTE",
}

// ─── Core State ─────────────────────────────────────────────────────────────

/**
 * Observable snapshot of a single CPU core's internal state.
 * Broadcast to the UI on every clock cycle.
 */
export interface CoreState {
  /** Numeric core identifier (0-based). */
  coreId: number;
  /** Current register values. */
  registers: Registers;
  /** Program counter — address of the next instruction to fetch. */
  pc: number;
  /** Instruction register — raw 4 bytes of the current instruction. */
  ir: Uint8Array;
  /** Decoded instruction, or `null` if nothing has been decoded yet. */
  currentInstruction: Instruction | null;
  /** ALU / control status flags. */
  flags: StatusFlags;
  /** Current pipeline stage. */
  pipelineStage: PipelineStage;
  /** PID of the process assigned to this core, or `null` if idle. */
  assignedProcess: number | null;
  /** `true` when the core is executing an interrupt service routine. */
  servicingInterrupt: boolean;
}

// ─── Process Control Block ──────────────────────────────────────────────────

/**
 * Lifecycle state of a process managed by the scheduler.
 *
 * - **READY** — Waiting in the ready queue for a core.
 * - **RUNNING** — Currently executing on a core.
 * - **BLOCKED** — Waiting for an I/O or event (not yet used).
 * - **FINISHED** — Execution complete (halted or removed).
 */
export enum ProcessStatus {
  READY    = "READY",
  RUNNING  = "RUNNING",
  BLOCKED  = "BLOCKED",
  FINISHED = "FINISHED",
}

/**
 * Process Control Block (PCB) — represents a scheduled program.
 *
 * The scheduler saves/restores register context via `savedRegisters`,
 * `savedPC`, and `savedFlags` when context-switching between processes.
 */
export interface ProcessState {
  /** Unique process identifier. */
  pid: number;
  /** Human-readable process name. */
  name: string;
  /** Priority level — lower number = higher priority (0 is highest). */
  priority: number;
  /** Current lifecycle status. */
  status: ProcessStatus;
  /** Start address of the program in memory. */
  programStart: number;
  /** Byte length of the program. */
  programLength: number;
  /** Saved register state (written on preemption / interrupt). */
  savedRegisters: Registers;
  /** Saved program counter. */
  savedPC: number;
  /** Saved status flags. */
  savedFlags: StatusFlags;
  /** Core ID the process is currently running on, or `null` if not running. */
  assignedCore: number | null;
  /** Total CPU cycles consumed by this process. */
  cyclesUsed: number;
  /** Cycles remaining in the current time slice (round-robin). */
  quantumRemaining: number;
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

/**
 * Available CPU scheduling algorithms.
 *
 * - **ROUND_ROBIN** — Each process gets a fixed time quantum, then rotates.
 * - **PREEMPTIVE_PRIORITY** — Higher-priority processes can preempt running ones.
 * - **NON_PREEMPTIVE** — Once running, a process keeps the core until it halts.
 */
export enum SchedulerType {
  ROUND_ROBIN           = "ROUND_ROBIN",
  PREEMPTIVE_PRIORITY   = "PREEMPTIVE_PRIORITY",
  NON_PREEMPTIVE        = "NON_PREEMPTIVE",
}

/** Default number of clock cycles each process receives per time slice. */
export const DEFAULT_QUANTUM = 4;
/** Default interval between clock ticks in milliseconds. */
export const CLOCK_CYCLE_MS = 1000;
/** Number of CPU cores in the simulation. */
export const NUM_CORES = 2;

// ─── Clock Event ────────────────────────────────────────────────────────────

/**
 * Payload emitted on every clock tick.
 *
 * Contains the full observable state of the CPU after executing one cycle,
 * including core snapshots, the process queue, interrupt activity, and
 * the active scheduling algorithm.
 */
export interface ClockEvent {
  /** Monotonically increasing cycle counter. */
  cycle: number;
  /** Snapshot of each core's state after this tick. */
  coreStates: CoreState[];
  /** Non-finished processes sorted by priority. */
  processQueue: ProcessState[];
  /** The scheduling algorithm currently in use. */
  schedulerType: SchedulerType;
  /** Number of interrupts dispatched to cores during this cycle. */
  interruptsFired: number;
  /** IDs of peripherals that generated interrupts this cycle. */
  interruptSources: string[];
  /** Number of interrupts still queued after dispatch. */
  pendingInterrupts: number;
  /** Unix timestamp (ms) when this event was created. */
  timestamp: number;
}
