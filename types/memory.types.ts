/**
 * @module memory.types
 *
 * Type definitions for the simulated main memory.
 * Covers configuration constants, cell / dump structures,
 * address ranges, and memory-access events.
 */

// ─── Memory Configuration ───────────────────────────────────────────────────

/** Total addressable memory in bytes (addresses 0x000–0x3FF). */
export const MEMORY_SIZE = 1024;
/** Number of bits per memory cell. */
export const WORD_SIZE = 8;

// ─── Memory Cell ────────────────────────────────────────────────────────────

/** A single addressable byte in memory. */
export interface MemoryCell {
  /** Byte address (0–{@link MEMORY_SIZE}-1). */
  address: number;
  /** Stored value (0–255). */
  value: number;
}

// ─── Memory Dump ────────────────────────────────────────────────────────────

/** A contiguous slice of memory cells. */
export interface MemoryDump {
  /** First address in the dump (inclusive). */
  startAddress: number;
  /** Last address in the dump (inclusive). */
  endAddress: number;
  /** Ordered cells from `startAddress` to `endAddress`. */
  cells: MemoryCell[];
}

// ─── Address Range ──────────────────────────────────────────────────────────

/** An inclusive range of memory addresses. */
export interface AddressRange {
  /** First address (inclusive). */
  start: number;
  /** Last address (inclusive). */
  end: number;
}

// ─── Memory Access Event ────────────────────────────────────────────────────

/** Direction of a memory access ("read" or "write"). */
export type MemoryAccessType = "read" | "write";

/**
 * Recorded whenever the CPU reads from or writes to memory.
 * Used by the UI to highlight recently accessed cells.
 */
export interface MemoryAccessEvent {
  /** Whether this was a read or a write. */
  type: MemoryAccessType;
  /** Byte address that was accessed. */
  address: number;
  /** The value that was read or written. */
  value: number;
  /** Unix timestamp (ms) of the access. */
  timestamp: number;
}
