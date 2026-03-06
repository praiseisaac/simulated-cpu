/**
 * Phase 4a verification — Interrupts (IRET, Core interrupt stack, InterruptController)
 * Run: npx tsx scripts/test-interrupts.ts
 */
import { MemoryService } from "@/services/Memory.service";
import { CPUService } from "@/services/cpu/CPU.service";
import { Core } from "@/services/cpu/Core.service";
import { InterruptController } from "@/services/cpu/InterruptController.service";
import { decode, disassemble } from "@/services/cpu/InstructionDecoder.service";
import { Opcode } from "@/types/cpu.types";
import type { Interrupt } from "@/types/peripheral.types";

function header(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

function assert(condition: boolean, label: string) {
  console.log(condition ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!condition) process.exitCode = 1;
}

// ─── 1. IRET Decode & Disassemble ──────────────────────────────────────────

header("1. IRET — decode & disassemble");

const iretInstr = decode(new Uint8Array([0xfe, 0x00, 0x00, 0x00]));
assert(iretInstr.opcode === Opcode.IRET, "IRET opcode decoded (0xFE)");
assert(iretInstr.reg1 === 0, "IRET reg1 = 0");
assert(iretInstr.reg2 === 0, "IRET reg2 = 0");
assert(iretInstr.address === 0, "IRET address = 0");
assert(disassemble(iretInstr) === "IRET", `disasm: "${disassemble(iretInstr)}"`);

// ─── 2. Core Interrupt Stack — handleInterrupt + IRET ───────────────────────

header("2. Core — handleInterrupt + IRET execution");

/**
 * Setup:
 *   Main program at 0x000: LOAD R0, 0x080 (R0=7), HALT
 *   ISR at 0x100: LOAD R1, 0x081 (R1=99), IRET
 *   Data: mem[0x080]=7, mem[0x081]=99
 *
 * Steps:
 *   1. Core executes LOAD R0, 0x080 → R0=7, PC=0x004
 *   2. Interrupt arrives → push context, jump to 0x100
 *   3. Core executes LOAD R1, 0x081 → R1=99, PC=0x104
 *   4. Core executes IRET → restore context (R0=7, R1=0, PC=0x004)
 *   5. Core executes HALT
 */
const mem = new MemoryService();

// Data
mem.write(0x080, 7);
mem.write(0x081, 99);

// Main program at 0x000
mem.loadProgram(0x000, [
  0x01, 0x00, 0x00, 0x80, // LOAD  R0, 0x080
  0xff, 0x00, 0x00, 0x00, // HALT
]);

// ISR at 0x100
mem.loadProgram(0x100, [
  0x01, 0x01, 0x00, 0x81, // LOAD  R1, 0x081
  0xfe, 0x00, 0x00, 0x00, // IRET
]);

const core = new Core(0);

// Step 1: Execute LOAD R0 (manually ticking the core)
let state = core.tick(mem);
assert(state.registers.R0 === 7, "After LOAD: R0 = 7");
assert(state.pc === 0x004, "After LOAD: PC = 0x004");
assert(!core.isServicingInterrupt(), "Not in ISR before interrupt");
assert(core.getInterruptDepth() === 0, "Interrupt depth = 0");

// Step 2: Interrupt arrives
core.handleInterrupt(0x100);
assert(core.isServicingInterrupt(), "In ISR after handleInterrupt");
assert(core.getInterruptDepth() === 1, "Interrupt depth = 1");
assert(core.getPC() === 0x100, "PC jumped to ISR at 0x100");
assert(!core.isHalted(), "Core un-halted for ISR");

// Step 3: Execute ISR's LOAD R1
state = core.tick(mem);
assert(state.registers.R1 === 99, "ISR: R1 = 99");
assert(state.pc === 0x104, "ISR: PC = 0x104");

// Step 4: Execute IRET → restores pre-interrupt context
state = core.tick(mem);
assert(state.registers.R0 === 7, "After IRET: R0 = 7 (restored)");
assert(state.registers.R1 === 0, "After IRET: R1 = 0 (restored — ISR changes discarded)");
assert(state.pc === 0x004, "After IRET: PC = 0x004 (restored)");
assert(!core.isServicingInterrupt(), "Not in ISR after IRET");
assert(core.getInterruptDepth() === 0, "Interrupt depth = 0 after IRET");

// Step 5: Continue main program → HALT
state = core.tick(mem);
assert(core.isHalted(), "Core halted after resuming from ISR");

// ─── 3. Nested Interrupts ──────────────────────────────────────────────────

header("3. Nested interrupts");

/**
 * Main at 0x000: LOAD R0, 0x080 (=7), LOAD R1, 0x081 (=3), HALT
 * ISR1 at 0x100: LOAD R2, 0x082 (=50), IRET
 * ISR2 at 0x200: LOAD R3, 0x083 (=77), IRET
 */
const mem2 = new MemoryService();
mem2.write(0x080, 7);
mem2.write(0x081, 3);
mem2.write(0x082, 50);
mem2.write(0x083, 77);

mem2.loadProgram(0x000, [
  0x01, 0x00, 0x00, 0x80, // LOAD R0, 0x080
  0x01, 0x01, 0x00, 0x81, // LOAD R1, 0x081
  0xff, 0x00, 0x00, 0x00, // HALT
]);
mem2.loadProgram(0x100, [
  0x01, 0x02, 0x00, 0x82, // LOAD R2, 0x082
  0xfe, 0x00, 0x00, 0x00, // IRET
]);
mem2.loadProgram(0x200, [
  0x01, 0x03, 0x00, 0x83, // LOAD R3, 0x083
  0xfe, 0x00, 0x00, 0x00, // IRET
]);

const core2 = new Core(0);

// Execute main LOAD R0
core2.tick(mem2);
assert(core2.getRegisters().R0 === 7, "Nested: R0 = 7 after first LOAD");

// First interrupt → ISR1
core2.handleInterrupt(0x100);
assert(core2.getInterruptDepth() === 1, "Nested: depth = 1");

// Execute ISR1 LOAD R2
core2.tick(mem2);
assert(core2.getRegisters().R2 === 50, "Nested: R2 = 50 in ISR1");

// Second interrupt while in ISR1 → ISR2
core2.handleInterrupt(0x200);
assert(core2.getInterruptDepth() === 2, "Nested: depth = 2");

// Execute ISR2 LOAD R3
core2.tick(mem2);
assert(core2.getRegisters().R3 === 77, "Nested: R3 = 77 in ISR2");

// IRET from ISR2 → back to ISR1
core2.tick(mem2);
assert(core2.getInterruptDepth() === 1, "Nested: depth = 1 after first IRET");
assert(core2.getPC() === 0x104, "Nested: PC = 0x104 (back in ISR1 after LOAD R2)");

// IRET from ISR1 → back to main
core2.tick(mem2);
assert(core2.getInterruptDepth() === 0, "Nested: depth = 0 after second IRET");
assert(core2.getPC() === 0x004, "Nested: PC = 0x004 (back in main)");

// Continue main: LOAD R1, HALT
core2.tick(mem2); // LOAD R1
assert(core2.getRegisters().R1 === 3, "Nested: R1 = 3 from main program");
core2.tick(mem2); // HALT
assert(core2.isHalted(), "Nested: core halted");

// ─── 4. InterruptController — priority queue ────────────────────────────────

header("4. InterruptController — priority queue ordering");

const ic = new InterruptController();

const intA: Interrupt = { source: "timer", priority: 3, handlerAddress: 0x100, timestamp: 1000 };
const intB: Interrupt = { source: "button", priority: 0, handlerAddress: 0x200, timestamp: 1001 };
const intC: Interrupt = { source: "sensor", priority: 3, handlerAddress: 0x300, timestamp: 999 };

ic.enqueue(intA);
ic.enqueue(intB);
ic.enqueue(intC);

assert(ic.size === 3, "3 interrupts queued");
assert(ic.hasPending(), "hasPending = true");

const first = ic.dequeueHighest()!;
assert(first.source === "button", "highest priority = button (priority 0)");

const second = ic.dequeueHighest()!;
assert(second.source === "sensor", "next = sensor (priority 3, earlier timestamp)");

const third = ic.dequeueHighest()!;
assert(third.source === "timer", "last = timer (priority 3, later timestamp)");

assert(!ic.hasPending(), "queue empty after 3 dequeues");
assert(ic.dequeueHighest() === null, "dequeue on empty returns null");

// ─── 5. InterruptController — peek & enqueueAll ────────────────────────────

header("5. InterruptController — peek, enqueueAll, clear");

const ic2 = new InterruptController();
assert(ic2.peek() === null, "peek on empty returns null");

ic2.enqueueAll([intA, intB]);
assert(ic2.size === 2, "enqueueAll added 2");
assert(ic2.peek()!.source === "button", "peek returns highest priority without removing");
assert(ic2.size === 2, "size unchanged after peek");

ic2.clear();
assert(ic2.size === 0, "clear empties the queue");
assert(!ic2.hasPending(), "hasPending = false after clear");

// ─── 6. InterruptController — listener ──────────────────────────────────────

header("6. InterruptController — event listener");

const ic3 = new InterruptController();
let listenerCount = 0;
const unsub = ic3.onInterrupt(() => { listenerCount++; });

ic3.enqueue(intA);
ic3.enqueue(intB);
assert(listenerCount === 2, "listener fired twice");

unsub();
ic3.enqueue(intC);
assert(listenerCount === 2, "listener not fired after unsubscribe");

// ─── Done ───────────────────────────────────────────────────────────────────

header("All Interrupt tests complete ✓");
