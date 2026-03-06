/**
 * Phase 3 verification — CPU Service (single core, manual stepping)
 * Run: npx tsx scripts/test-cpu.ts
 */
import { MemoryService } from "@/services/Memory.service";
import { CPUService } from "@/services/cpu/CPU.service";
import { decode, disassemble } from "@/services/cpu/InstructionDecoder.service";
import { Opcode } from "@/types/cpu.types";

function header(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

function assert(condition: boolean, label: string) {
  console.log(condition ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!condition) process.exitCode = 1;
}

// ─── 1. InstructionDecoder ──────────────────────────────────────────────────

header("1. InstructionDecoder — decode & disassemble");

const loadInstr = decode(new Uint8Array([0x01, 0x00, 0x00, 0x10]));
assert(loadInstr.opcode === Opcode.LOAD, "LOAD opcode decoded");
assert(loadInstr.reg1 === 0, "LOAD Rd = R0");
assert(loadInstr.address === 0x10, "LOAD address = 0x010");
assert(disassemble(loadInstr) === "LOAD  R0, 0x010", `disasm: "${disassemble(loadInstr)}"`);

const addInstr = decode(new Uint8Array([0x03, 0x00, 0x01, 0x00]));
assert(addInstr.opcode === Opcode.ADD, "ADD opcode decoded");
assert(addInstr.reg1 === 0, "ADD Rd = R0");
assert(addInstr.reg2 === 1, "ADD Rs = R1");
assert(disassemble(addInstr) === "ADD   R0, R1", `disasm: "${disassemble(addInstr)}"`);

const storeInstr = decode(new Uint8Array([0x02, 0x00, 0x00, 0x11]));
assert(storeInstr.opcode === Opcode.STORE, "STORE opcode decoded");
assert(disassemble(storeInstr) === "STORE R0, 0x011", `disasm: "${disassemble(storeInstr)}"`);

const jmpInstr = decode(new Uint8Array([0x05, 0x00, 0x01, 0x00]));
assert(jmpInstr.opcode === Opcode.JMP, "JMP opcode decoded");
assert(jmpInstr.address === 0x100, "JMP address = 0x100");

const haltInstr = decode(new Uint8Array([0xff, 0x00, 0x00, 0x00]));
assert(haltInstr.opcode === Opcode.HALT, "HALT opcode decoded");

const subInstr = decode(new Uint8Array([0x04, 0x02, 0x03, 0x00]));
assert(subInstr.opcode === Opcode.SUB, "SUB opcode decoded");
assert(disassemble(subInstr) === "SUB   R2, R3", `disasm: "${disassemble(subInstr)}"`);

// Invalid opcode
let caught = false;
try { decode(new Uint8Array([0xAB, 0x00, 0x00, 0x00])); } catch { caught = true; }
assert(caught, "unknown opcode throws");

// Invalid register
caught = false;
try { decode(new Uint8Array([0x01, 0x05, 0x00, 0x00])); } catch { caught = true; }
assert(caught, "register index > 3 throws");

// ─── 2. Core — simple program ──────────────────────────────────────────────

header("2. Core — LOAD, ADD, STORE, HALT");

/**
 * Program: (loaded at address 0x000)
 *   0x000: LOAD  R0, 0x080   — R0 = mem[0x080] (will be 7)
 *   0x004: LOAD  R1, 0x081   — R1 = mem[0x081] (will be 3)
 *   0x008: ADD   R0, R1      — R0 = R0 + R1 = 10
 *   0x00C: STORE R0, 0x082   — mem[0x082] = 10
 *   0x010: HALT
 *
 * Data:
 *   0x080: 7
 *   0x081: 3
 */
const mem = new MemoryService();

// Data
mem.write(0x080, 7);
mem.write(0x081, 3);

// Program bytes
const program = [
  0x01, 0x00, 0x00, 0x80, // LOAD  R0, 0x080
  0x01, 0x01, 0x00, 0x81, // LOAD  R1, 0x081
  0x03, 0x00, 0x01, 0x00, // ADD   R0, R1
  0x02, 0x00, 0x00, 0x82, // STORE R0, 0x082
  0xff, 0x00, 0x00, 0x00, // HALT
];
mem.loadProgram(0x000, program);

const cpu = new CPUService(mem);
const core0 = cpu.getCore(0);

// Step through one instruction at a time
console.log("\n  Step-by-step execution (Core 0):\n");

let stepCount = 0;
while (!core0.isHalted() && stepCount < 10) {
  const event = cpu.step();
  const cs = event.coreStates[0];
  stepCount++;
  const instrText = cs.currentInstruction
    ? disassemble(cs.currentInstruction)
    : "—";
  console.log(
    `  Cycle ${event.cycle}: ${instrText.padEnd(20)} ` +
    `PC=0x${cs.pc.toString(16).padStart(3, "0")}  ` +
    `R0=${cs.registers.R0} R1=${cs.registers.R1} R2=${cs.registers.R2} R3=${cs.registers.R3}  ` +
    `Z=${cs.flags.zero ? 1 : 0} C=${cs.flags.carry ? 1 : 0} H=${cs.flags.halted ? 1 : 0}`
  );
}

console.log();
assert(stepCount === 5, `executed in 5 cycles (got ${stepCount})`);
assert(core0.getRegisters().R0 === 10, "R0 = 10  (7 + 3)");
assert(core0.getRegisters().R1 === 3, "R1 = 3");
assert(mem.read(0x082) === 10, "mem[0x082] = 10  (stored result)");
assert(core0.isHalted(), "core halted");

// ─── 3. SUB with underflow ─────────────────────────────────────────────────

header("3. SUB with underflow (borrow flag)");

const mem2 = new MemoryService();
mem2.write(0x080, 2);
mem2.write(0x081, 5);
const subProg = [
  0x01, 0x00, 0x00, 0x80, // LOAD R0, 0x080  → R0=2
  0x01, 0x01, 0x00, 0x81, // LOAD R1, 0x081  → R1=5
  0x04, 0x00, 0x01, 0x00, // SUB  R0, R1     → R0=2-5=253 (wraps), carry=true
  0xff, 0x00, 0x00, 0x00, // HALT
];
mem2.loadProgram(0x000, subProg);

const cpu2 = new CPUService(mem2);
const c0 = cpu2.getCore(0);
while (!c0.isHalted()) cpu2.step();

assert(c0.getRegisters().R0 === 253, `R0 = 253  (2 - 5 wraps to 253, got ${c0.getRegisters().R0})`);
assert(c0.getFlags().carry === true, "carry (borrow) flag set");

// ─── 4. JMP (loop) ─────────────────────────────────────────────────────────

header("4. JMP — loop counter");

/**
 * Program: count down R0 from 3 to 0 using SUB + JMP
 *
 *   0x000: LOAD  R0, 0x080   — R0 = 3
 *   0x004: LOAD  R1, 0x081   — R1 = 1 (decrement amount)
 *   0x008: SUB   R0, R1      — R0 = R0 - 1
 *   0x00C: JMP   0x008       — loop back to SUB (will keep going until we stop)
 *
 * We'll run a fixed number of cycles and check that R0 decrements.
 */
const mem3 = new MemoryService();
mem3.write(0x080, 3);
mem3.write(0x081, 1);
const loopProg = [
  0x01, 0x00, 0x00, 0x80, // LOAD R0, 0x080
  0x01, 0x01, 0x00, 0x81, // LOAD R1, 0x081
  0x04, 0x00, 0x01, 0x00, // SUB  R0, R1
  0x05, 0x00, 0x00, 0x08, // JMP  0x008
];
mem3.loadProgram(0x000, loopProg);

const cpu3 = new CPUService(mem3);
const loop0 = cpu3.getCore(0);

// Run 5 cycles: LOAD R0, LOAD R1, SUB(3→2), JMP, SUB(2→1)
for (let i = 0; i < 5; i++) cpu3.step();
assert(loop0.getRegisters().R0 === 1, `R0 = 1 after 5 cycles (got ${loop0.getRegisters().R0})`);
assert(loop0.getPC() === 0x00c, `PC = 0x00C (at JMP, got 0x${loop0.getPC().toString(16)})`);

// 2 more cycles: JMP, SUB(1→0)
cpu3.step(); // JMP
cpu3.step(); // SUB → R0=0, zero=true
assert(loop0.getRegisters().R0 === 0, `R0 = 0 after 7 cycles (got ${loop0.getRegisters().R0})`);
assert(loop0.getFlags().zero === true, "zero flag set when R0 reaches 0");

// ─── 5. Callbacks ───────────────────────────────────────────────────────────

header("5. Pipeline callbacks");

const mem4 = new MemoryService();
const simpleProg = [0xff, 0x00, 0x00, 0x00]; // HALT
mem4.loadProgram(0x000, simpleProg);

let fetchFired = false;
let decodeFired = false;
let executeFired = false;

const cpu4 = new CPUService(mem4, {
  onFetch: () => { fetchFired = true; },
  onDecode: () => { decodeFired = true; },
  onExecute: () => { executeFired = true; },
});
cpu4.step();

assert(fetchFired, "onFetch callback fired");
assert(decodeFired, "onDecode callback fired");
assert(executeFired, "onExecute callback fired");

// ─── 6. Reset ───────────────────────────────────────────────────────────────

header("6. CPU reset");

cpu.reset();
const afterReset = cpu.getCore(0).getState();
assert(afterReset.pc === 0, "PC = 0 after reset");
assert(afterReset.registers.R0 === 0, "R0 = 0 after reset");
assert(afterReset.flags.halted === false, "halted = false after reset");
assert(cpu.getCycle() === 0, "cycle counter = 0 after reset");

// ─── 7. Dual-core ──────────────────────────────────────────────────────────

header("7. Dual-core execution");

const mem5 = new MemoryService();
// Both cores start at PC=0, so they both execute the same program for now.
// In Phase 4, the scheduler will assign different programs to different cores.
const dualProg = [
  0x01, 0x00, 0x00, 0x80, // LOAD R0, 0x080
  0xff, 0x00, 0x00, 0x00, // HALT
];
mem5.write(0x080, 42);
mem5.loadProgram(0x000, dualProg);

const cpu5 = new CPUService(mem5);
const event = cpu5.step();

assert(event.coreStates.length === 2, "tick returns states for both cores");
// After 1 tick: both cores executed LOAD R0, 0x080
assert(event.coreStates[0].registers.R0 === 42, "Core 0 R0 = 42");
assert(event.coreStates[1].registers.R0 === 42, "Core 1 R0 = 42");

cpu5.step(); // both HALT

// ── Done ────────────────────────────────────────────────────────────────────

header("All CPU Service tests complete ✓");
