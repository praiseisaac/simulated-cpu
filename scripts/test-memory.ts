/**
 * Phase 2 verification — Memory Service
 * Run: npx tsx scripts/test-memory.ts
 */
import { MemoryService } from "@/services/Memory.service";
import { MEMORY_SIZE } from "@/types/memory.types";

function header(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

function assert(condition: boolean, label: string) {
  console.log(condition ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!condition) process.exitCode = 1;
}

// ── Instantiate ─────────────────────────────────────────────────────────────

const mem = new MemoryService();

// ── 1. Basic read/write ─────────────────────────────────────────────────────

header("1. Basic read / write");

mem.write(0x00, 42);
assert(mem.read(0x00) === 42, "write 42 → read 42");

mem.write(0x3ff, 255);
assert(mem.read(0x3ff) === 255, "write 255 at last address → read 255");

assert(mem.read(0x01) === 0, "uninitialized cell reads 0");

// ── 2. Bounds checking ─────────────────────────────────────────────────────

header("2. Bounds checking");

let caught = false;
try { mem.read(-1); } catch { caught = true; }
assert(caught, "read(-1) throws RangeError");

caught = false;
try { mem.read(MEMORY_SIZE); } catch { caught = true; }
assert(caught, `read(${MEMORY_SIZE}) throws RangeError`);

caught = false;
try { mem.write(0x00, 256); } catch { caught = true; }
assert(caught, "write(_, 256) throws RangeError");

caught = false;
try { mem.write(0x00, -1); } catch { caught = true; }
assert(caught, "write(_, -1) throws RangeError");

// ── 3. Load program ────────────────────────────────────────────────────────

header("3. Load program");

const program = [0x01, 0x00, 0x00, 0x10, 0x03, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x11, 0xff, 0x00, 0x00, 0x00];
// LOAD R0, 0x010 | ADD R0, R1 | STORE R0, 0x011 | HALT

mem.loadProgram(0x100, program);
assert(mem.read(0x100) === 0x01, "program byte 0 = LOAD opcode (0x01)");
assert(mem.read(0x103) === 0x10, "program byte 3 = addr low (0x10)");
assert(mem.read(0x10c) === 0xff, "program byte 12 = HALT opcode (0xFF)");

caught = false;
try { mem.loadProgram(0x3f8, new Array(16).fill(0)); } catch { caught = true; }
assert(caught, "loadProgram overflowing memory throws");

caught = false;
try { mem.loadProgram(0x00, []); } catch { caught = true; }
assert(caught, "loadProgram with empty array throws");

// ── 4. Dump ─────────────────────────────────────────────────────────────────

header("4. Memory dump");

const dump = mem.dump(0x100, 0x10f);
assert(dump.startAddress === 0x100, "dump startAddress correct");
assert(dump.endAddress === 0x10f, "dump endAddress correct");
assert(dump.cells.length === 16, "dump contains 16 cells");
assert(dump.cells[0].value === 0x01, "first cell value matches LOAD opcode");

console.log("  Dumped cells:");
dump.cells.forEach((c) => {
  console.log(`    0x${c.address.toString(16).padStart(3, "0")}: 0x${c.value.toString(16).padStart(2, "0")}`);
});

// ── 5. ReadBytes ────────────────────────────────────────────────────────────

header("5. readBytes (bulk)");

const bytes = mem.readBytes(0x100, 4);
assert(bytes[0] === 0x01 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x10,
  "readBytes returns correct 4-byte slice");

// ── 6. Event listeners ─────────────────────────────────────────────────────

header("6. Event listeners");

let writeEvents = 0;
let readEvents = 0;
const unsubWrite = mem.on("write", () => { writeEvents++; });
const unsubRead = mem.on("read", () => { readEvents++; });

mem.write(0x50, 77);
mem.write(0x51, 78);
mem.read(0x50);

assert(writeEvents === 2, "2 write events fired");
assert(readEvents === 1, "1 read event fired");

unsubWrite();
unsubRead();

mem.write(0x52, 79);
mem.read(0x52);

assert(writeEvents === 2, "no write events after unsubscribe");
assert(readEvents === 1, "no read events after unsubscribe");

// ── 7. Access log ───────────────────────────────────────────────────────────

header("7. Access log");

const log = mem.getAccessLog();
assert(log.length > 0, "access log is non-empty");
console.log(`  Total logged events: ${log.length}`);

const recent = mem.getRecentAccesses(3);
assert(recent.length === 3, "getRecentAccesses(3) returns 3 entries");
console.log("  Last 3 accesses:");
recent.forEach((e) => {
  console.log(`    ${e.type.toUpperCase()} 0x${e.address.toString(16).padStart(3, "0")} = 0x${e.value.toString(16).padStart(2, "0")}`);
});

// ── 8. Reset ────────────────────────────────────────────────────────────────

header("8. Reset");

mem.reset();
assert(mem.read(0x00) === 0, "after reset, address 0x00 = 0");
assert(mem.read(0x100) === 0, "after reset, program area cleared");
assert(mem.getAccessLog().length === 2, "access log only has the two reads above after reset");

// ── 9. Restore ──────────────────────────────────────────────────────────────

header("9. Restore from buffer");

const buffer = new Array(MEMORY_SIZE).fill(0);
buffer[0] = 0xAA;
buffer[1023] = 0xBB;
mem.restore(buffer);
assert(mem.read(0x00) === 0xAA, "restored byte at 0x00");
assert(mem.read(0x3ff) === 0xBB, "restored byte at 0x3FF");

caught = false;
try { mem.restore(new Array(512).fill(0)); } catch { caught = true; }
assert(caught, "restore with wrong-size buffer throws");

// ── Done ────────────────────────────────────────────────────────────────────

header("All Memory Service tests complete");
