/**
 * test-persistence.ts
 * ====================
 * Validates the Persistence service: save → load round-trip, schema
 * validation, and CPU restoreFromSnapshot correctness.
 *
 * Run:  npx tsx scripts/test-persistence.ts
 */

import { unlinkSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryService } from "@/services/Memory.service";
import { CPUService } from "@/services/cpu/CPU.service";
import { PersistenceService } from "@/services/Persistence.service";
import { Opcode } from "@/types/cpu.types";
import Button from "@/peripherals/Button.peripheral";
import Timer from "@/peripherals/Timer.peripheral";
import { PotentiometerPeripheral } from "@/peripherals/Potentiometer.peripheral";
import { LEDPeripheral } from "@/peripherals/LED.peripheral";

// ── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function section(title: string, num: number): void {
  console.log();
  console.log("═".repeat(60));
  console.log(`  ${num}. ${title}`);
  console.log("═".repeat(60));
}

/** Generate a unique temp path for a save file. */
function tempSavePath(name: string): string {
  return join(tmpdir(), `simcpu-test-${name}-${Date.now()}.json`);
}

/** Clean up a temp file if it exists. */
function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

// ── Build a small program ───────────────────────────────────────────────────

/**
 * Program: LOAD R0, 0x0100 → ADD R0, R1 → STORE R0, 0x0200 → HALT
 * We'll also pre-set memory[0x0100] = 42 and R1 will default to 0.
 */
function buildProgram(): number[] {
  return [
    // LOAD R0, 0x0100
    Opcode.LOAD, 0x00, 0x01, 0x00,
    // ADD R0, R1
    Opcode.ADD, 0x00, 0x01, 0x00,
    // STORE R0, 0x0200
    Opcode.STORE, 0x00, 0x02, 0x00,
    // HALT
    Opcode.HALT, 0x00, 0x00, 0x00,
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

console.log();
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║            Persistence Service — Test Suite             ║");
console.log("╚══════════════════════════════════════════════════════════╝");

// ── 1. PersistenceService.save creates a file ─────────────────────────────

section("PersistenceService.save creates a JSON file", 1);

const savePath1 = tempSavePath("save-basic");
try {
  const mem = new MemoryService();
  const cpu = new CPUService(mem);

  mem.loadProgram(0, buildProgram());
  mem.write(0x0100, 42);

  PersistenceService.save(cpu, savePath1);

  assert(existsSync(savePath1), "file was created on disk");

  const raw = readFileSync(savePath1, "utf-8");
  const json = JSON.parse(raw);

  assert(json.version === 1, `version is 1 (got ${json.version})`);
  assert(typeof json.timestamp === "number", "timestamp is a number");
  assert(json.cycle === 0, `cycle is 0 (got ${json.cycle})`);
  assert(Array.isArray(json.memory), "memory is an array");
  assert(json.memory.length === 1024, `memory has 1024 entries (got ${json.memory.length})`);
  assert(json.memory[0x0100] === 42, "memory[0x0100] = 42");
  assert(json.cores.length === 2, `2 core snapshots (got ${json.cores.length})`);
  assert(Array.isArray(json.peripherals), "peripherals is an array");
  assert(Array.isArray(json.pendingInterrupts), "pendingInterrupts is an array");
} finally {
  cleanup(savePath1);
}

// ── 2. PersistenceService.load reads back a valid state ───────────────────

section("PersistenceService.load round-trip", 2);

const savePath2 = tempSavePath("roundtrip");
try {
  const mem = new MemoryService();
  const cpu = new CPUService(mem);
  mem.loadProgram(0, buildProgram());
  mem.write(0x0100, 42);

  // Run 2 steps so cycle > 0 and core state advances
  cpu.step();
  cpu.step();

  PersistenceService.save(cpu, savePath2);
  const loaded = PersistenceService.load(savePath2);

  assert(loaded.version === 1, "loaded version is 1");
  assert(loaded.cycle === 2, `loaded cycle is 2 (got ${loaded.cycle})`);
  assert(loaded.memory[0x0100] === 42, "loaded memory[0x0100] = 42");
  assert(loaded.cores.length === 2, "loaded has 2 core snapshots");
  assert(loaded.cores[0].pc > 0, `core0 pc advanced (got ${loaded.cores[0].pc})`);
} finally {
  cleanup(savePath2);
}

// ── 3. PersistenceService.exists ──────────────────────────────────────────

section("PersistenceService.exists", 3);

const savePath3 = tempSavePath("exists-check");
try {
  assert(!PersistenceService.exists(savePath3), "returns false when file doesn't exist");

  const mem = new MemoryService();
  const cpu = new CPUService(mem);
  PersistenceService.save(cpu, savePath3);

  assert(PersistenceService.exists(savePath3), "returns true after save");
} finally {
  cleanup(savePath3);
}

// ── 4. PersistenceService.load — missing file throws ──────────────────────

section("load throws on missing file", 4);

let threw = false;
try {
  PersistenceService.load("/tmp/nonexistent-simcpu-file-xyz.json");
} catch (e: unknown) {
  threw = true;
  assert(
    (e as Error).message.includes("not found"),
    `error message mentions "not found"`
  );
}
assert(threw, "load() threw for missing file");

// ── 5. PersistenceService.load — invalid JSON structure throws ────────────

section("load throws on invalid schema", 5);

const savePath5 = tempSavePath("bad-schema");
try {
  writeFileSync(savePath5, JSON.stringify({ foo: "bar" }), "utf-8");

  let threwBad = false;
  try {
    PersistenceService.load(savePath5);
  } catch (e: unknown) {
    threwBad = true;
    assert(
      (e as Error).message.includes("Invalid"),
      `error mentions "Invalid"`
    );
  }
  assert(threwBad, "load() threw for invalid schema");
} finally {
  cleanup(savePath5);
}

// ── 6. PersistenceService.load — future version throws ────────────────────

section("load throws on newer schema version", 6);

const savePath6 = tempSavePath("future-version");
try {
  // Build a structurally valid state with version = 999
  const mem = new MemoryService();
  const cpu = new CPUService(mem);
  PersistenceService.save(cpu, savePath6);

  const raw = JSON.parse(readFileSync(savePath6, "utf-8"));
  raw.version = 999;
  writeFileSync(savePath6, JSON.stringify(raw), "utf-8");

  let threwVersion = false;
  try {
    PersistenceService.load(savePath6);
  } catch (e: unknown) {
    threwVersion = true;
    assert(
      (e as Error).message.includes("newer"),
      `error mentions "newer"`
    );
  }
  assert(threwVersion, "load() threw for future version");
} finally {
  cleanup(savePath6);
}

// ── 7. Full round-trip: save → load → restore → verify state ─────────────

section("Full save → load → restore round-trip", 7);

const savePath7 = tempSavePath("full-roundtrip");
try {
  // --- Original CPU ---
  const mem1 = new MemoryService();
  const cpu1 = new CPUService(mem1);

  mem1.loadProgram(0, buildProgram());
  mem1.write(0x0100, 42);

  // Add a process so scheduler has state
  cpu1.addProcess("test-proc", 0, 16);

  // Run 3 steps
  cpu1.step();
  cpu1.step();
  cpu1.step();

  // Capture state before save
  const snap1 = cpu1.toJSON();

  PersistenceService.save(cpu1, savePath7);
  const loaded = PersistenceService.load(savePath7);

  // --- Fresh CPU ---
  const mem2 = new MemoryService();
  const cpu2 = new CPUService(mem2);
  cpu2.restoreFromSnapshot(loaded);

  const snap2 = cpu2.toJSON();

  // Compare key fields (timestamps will differ, so skip that)
  assert(snap2.cycle === snap1.cycle, `cycle matches (${snap1.cycle})`);
  assert(snap2.clockSpeed === snap1.clockSpeed, `clockSpeed matches (${snap1.clockSpeed})`);

  // Memory contents
  assert(snap2.memory[0x0100] === 42, "restored memory[0x0100] = 42");
  assert(
    snap2.memory[0] === snap1.memory[0],
    `restored memory[0] matches (opcode ${snap1.memory[0]})`
  );

  // Check a range of memory bytes
  let memMatch = true;
  for (let i = 0; i < 1024; i++) {
    if (snap2.memory[i] !== snap1.memory[i]) {
      memMatch = false;
      console.log(`    memory mismatch at ${i}: ${snap1.memory[i]} vs ${snap2.memory[i]}`);
      break;
    }
  }
  assert(memMatch, "all 1024 memory bytes match");

  // Core state
  assert(snap2.cores.length === snap1.cores.length, "same number of cores");
  assert(snap2.cores[0].pc === snap1.cores[0].pc, `core0 pc matches (${snap1.cores[0].pc})`);
  assert(
    JSON.stringify(snap2.cores[0].registers) === JSON.stringify(snap1.cores[0].registers),
    "core0 registers match"
  );

  // Scheduler
  assert(
    snap2.scheduler.nextPid === snap1.scheduler.nextPid,
    `scheduler nextPid matches (${snap1.scheduler.nextPid})`
  );
  assert(
    snap2.scheduler.quantum === snap1.scheduler.quantum,
    `scheduler quantum matches (${snap1.scheduler.quantum})`
  );
  assert(
    snap2.scheduler.processes.length === snap1.scheduler.processes.length,
    `scheduler process count matches (${snap1.scheduler.processes.length})`
  );
} finally {
  cleanup(savePath7);
}

// ── 8. Peripheral snapshots are included in save file ─────────────────────

section("Peripheral snapshots in save file", 8);

const savePath8 = tempSavePath("peripheral-snap");
try {
  const mem = new MemoryService();
  const cpu = new CPUService(mem);

  const btn = new Button("btn-1", "Button 1", 0x0400, 1);
  const tmr = new Timer("tmr-1", "Timer 1", 0x0500, 10, 2);
  const pot = new PotentiometerPeripheral("pot-1", "Dial 1", 0x0600, 200, 2, mem, 0x003A, 2);
  const led = new LEDPeripheral("led-1", "LED 1", 0, "#22c55e", mem, 0x003A);

  cpu.registerPeripheral(btn);
  cpu.registerPeripheral(tmr);
  cpu.registerPeripheral(pot);
  cpu.registerPeripheral(led);
  cpu.connectPeripheral("btn-1");
  cpu.connectPeripheral("tmr-1");
  cpu.connectPeripheral("pot-1");
  cpu.connectPeripheral("led-1");

  pot.setResistance(100);
  mem.write(0x003A, 180);
  cpu.step();
  cpu.step();

  PersistenceService.save(cpu, savePath8);
  const loaded = PersistenceService.load(savePath8);

  assert(loaded.peripherals.length === 4, `4 peripheral snapshots (got ${loaded.peripherals.length})`);

  const btnSnap = loaded.peripherals.find((p) => p.id === "btn-1");
  const tmrSnap = loaded.peripherals.find((p) => p.id === "tmr-1");
  const potSnap = loaded.peripherals.find((p) => p.id === "pot-1");
  const ledSnap = loaded.peripherals.find((p) => p.id === "led-1");

  assert(btnSnap !== undefined, "button snapshot found");
  assert(tmrSnap !== undefined, "timer snapshot found");
  assert(potSnap !== undefined, "potentiometer snapshot found");
  assert(ledSnap !== undefined, "LED snapshot found");
  assert(btnSnap?.status === "IDLE", `button status is IDLE (got ${btnSnap?.status})`);
  assert(tmrSnap?.priority === 2, `timer priority is 2 (got ${tmrSnap?.priority})`);
  assert(potSnap?.meta.type === "potentiometer", `potentiometer meta.type saved (got ${potSnap?.meta.type})`);
  assert((potSnap?.meta.normalizedValue as number) === 128, `potentiometer normalized value saved (got ${potSnap?.meta.normalizedValue})`);
  assert(ledSnap?.meta.type === "led", `LED meta.type saved (got ${ledSnap?.meta.type})`);
  assert((ledSnap?.meta.color as string) === "#22c55e", `LED color saved (got ${ledSnap?.meta.color})`);
} finally {
  cleanup(savePath8);
}

// ── 9. Restore after running to HALT ──────────────────────────────────────

section("Save/restore after program runs to HALT", 9);

const savePath9 = tempSavePath("halt-roundtrip");
try {
  const mem1 = new MemoryService();
  const cpu1 = new CPUService(mem1);

  mem1.loadProgram(0, buildProgram());
  mem1.write(0x0100, 42);
  cpu1.addProcess("halt-test", 0, 16);

  // Run enough steps for HALT (program is 4 instructions)
  for (let i = 0; i < 10; i++) {
    cpu1.step();
  }

  const snap1 = cpu1.toJSON();

  // The STORE should have written 42 to address 0x0200
  assert(snap1.memory[0x0200] === 42, `memory[0x0200] = 42 after execution (got ${snap1.memory[0x0200]})`);

  PersistenceService.save(cpu1, savePath9);
  const loaded = PersistenceService.load(savePath9);

  const mem2 = new MemoryService();
  const cpu2 = new CPUService(mem2);
  cpu2.restoreFromSnapshot(loaded);

  const snap2 = cpu2.toJSON();

  assert(snap2.memory[0x0200] === 42, "restored memory[0x0200] = 42");
  assert(snap2.cycle === snap1.cycle, `cycle matches (${snap1.cycle})`);
  assert(snap2.cores[0].pc === snap1.cores[0].pc, `core0 pc matches after HALT (${snap1.cores[0].pc})`);
} finally {
  cleanup(savePath9);
}

// ── 10. Multiple save/load cycles ─────────────────────────────────────────

section("Multiple sequential save/load cycles", 10);

const savePath10 = tempSavePath("multi-save");
try {
  const mem = new MemoryService();
  const cpu = new CPUService(mem);

  mem.loadProgram(0, buildProgram());
  mem.write(0x0100, 42);
  cpu.addProcess("multi-test", 0, 16);

  // Save at cycle 0
  PersistenceService.save(cpu, savePath10);
  const state0 = PersistenceService.load(savePath10);
  assert(state0.cycle === 0, "first save at cycle 0");

  // Run 3 steps, save again
  cpu.step();
  cpu.step();
  cpu.step();
  PersistenceService.save(cpu, savePath10);
  const state3 = PersistenceService.load(savePath10);
  assert(state3.cycle === 3, `second save at cycle 3 (got ${state3.cycle})`);

  // Run 2 more, save again
  cpu.step();
  cpu.step();
  PersistenceService.save(cpu, savePath10);
  const state5 = PersistenceService.load(savePath10);
  assert(state5.cycle === 5, `third save at cycle 5 (got ${state5.cycle})`);

  // Restore from cycle-3 snapshot into a fresh CPU
  const mem2 = new MemoryService();
  const cpu2 = new CPUService(mem2);
  cpu2.restoreFromSnapshot(state3);
  assert(cpu2.toJSON().cycle === 3, "restored to cycle 3 from middle snapshot");
} finally {
  cleanup(savePath10);
}

// ════════════════════════════════════════════════════════════════════════════
//  Summary
// ════════════════════════════════════════════════════════════════════════════

console.log();
console.log("═".repeat(60));
if (failed === 0) {
  console.log(`  All Persistence tests complete ✓  (${passed} passed)`);
} else {
  console.log(`  ${passed} passed, ${failed} FAILED`);
}
console.log("═".repeat(60));
console.log();

process.exit(failed > 0 ? 1 : 0);
