/**
 * @module Memory.service
 *
 * Simulated 1 KB byte-addressable main memory.
 * Supports read/write with bounds checking, bulk program loading,
 * contiguous dumps, an access log, and a pub/sub event system
 * for monitoring reads and writes.
 */

import {
  MEMORY_SIZE,
  type MemoryCell,
  type MemoryDump,
  type MemoryAccessEvent,
  type MemoryAccessType,
} from "@/types/memory.types";

// ─── Listener Types ─────────────────────────────────────────────────────────

/** Callback invoked on every memory read or write. */
type MemoryListener = (event: MemoryAccessEvent) => void;

// ─── Memory Service ─────────────────────────────────────────────────────────

/**
 * 1024-byte main memory service.
 *
 * Provides:
 * - Single-byte `read` / `write` with bounds checking.
 * - Multi-byte `readBytes` for fetching instructions.
 * - `loadProgram` for bulk-loading byte arrays at arbitrary addresses.
 * - `dump` for extracting contiguous slices.
 * - An event system (`on`) that notifies listeners of every access.
 * - A rolling access log (`getRecentAccesses`).
 * - `reset` / `restore` for lifecycle management and persistence.
 */
export class MemoryService {
  private data: Uint8Array;
  private listeners: Map<MemoryAccessType, Set<MemoryListener>>;
  private accessLog: MemoryAccessEvent[];
  private readonly maxLogSize: number;

  constructor(maxLogSize = 256) {
    this.data = new Uint8Array(MEMORY_SIZE);
    this.listeners = new Map([
      ["read", new Set<MemoryListener>()],
      ["write", new Set<MemoryListener>()],
    ]);
    this.accessLog = [];
    this.maxLogSize = maxLogSize;
  }

  // ── Core Operations ─────────────────────────────────────────────────────

  /**
   * Read a single byte from the given address.
   * Fires a "read" event and logs the access.
   *
   * @param address - Byte address (0–1023).
   * @returns The 8-bit value at that address.
   * @throws {RangeError} If `address` is out of bounds.
   */
  read(address: number): number {
    this.validateAddress(address);
    const value = this.data[address];
    this.emitEvent("read", address, value);
    return value;
  }

  /**
   * Write a single byte to the given address.
   * The value is clamped to 8 bits. Fires a "write" event.
   *
   * @param address - Byte address (0–1023).
   * @param value   - Value to write (0–255).
   * @throws {RangeError} If `address` or `value` is out of bounds.
   */
  write(address: number, value: number): void {
    this.validateAddress(address);
    this.validateValue(value);
    this.data[address] = value & 0xff; // clamp to 8 bits
    this.emitEvent("write", address, this.data[address]);
  }

  /**
   * Read multiple consecutive bytes starting at `address`.
   * Does NOT fire individual read events — use for bulk inspection.
   */
  readBytes(address: number, count: number): Uint8Array {
    this.validateAddress(address);
    this.validateAddress(address + count - 1);
    return this.data.slice(address, address + count);
  }

  // ── Program Loading ─────────────────────────────────────────────────────

  /**
   * Bulk-write a program (array of bytes) starting at `startAddress`.
   * Fires a single "write" event per byte.
   */
  loadProgram(startAddress: number, bytes: number[]): void {
    if (bytes.length === 0) {
      throw new RangeError("Cannot load an empty program");
    }
    const endAddress = startAddress + bytes.length - 1;
    this.validateAddress(startAddress);
    this.validateAddress(endAddress);

    for (let i = 0; i < bytes.length; i++) {
      this.validateValue(bytes[i]);
      this.data[startAddress + i] = bytes[i] & 0xff;
      this.emitEvent("write", startAddress + i, this.data[startAddress + i]);
    }
  }

  // ── Dump / Inspect ──────────────────────────────────────────────────────

  /**
   * Return a contiguous slice of memory as a {@link MemoryDump}.
   *
   * @param start - First address (inclusive, default 0).
   * @param end   - Last address (inclusive, default MEMORY_SIZE − 1).
   */
  dump(start = 0, end: number = MEMORY_SIZE - 1): MemoryDump {
    this.validateAddress(start);
    this.validateAddress(end);
    if (start > end) {
      throw new RangeError(`start (${start}) must be <= end (${end})`);
    }

    const cells: MemoryCell[] = [];
    for (let addr = start; addr <= end; addr++) {
      cells.push({ address: addr, value: this.data[addr] });
    }

    return { startAddress: start, endAddress: end, cells };
  }

  /**
   * Return raw backing buffer (read-only view for serialisation).
   */
  getRawBuffer(): Readonly<Uint8Array> {
    return this.data;
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  /** Zero-fill all memory and clear the access log. */
  reset(): void {
    this.data.fill(0);
    this.accessLog = [];
  }

  // ── Restore (for persistence) ───────────────────────────────────────────

  /**
   * Replace the entire memory buffer from a saved state.
   *
   * @param buffer - A 1024-element number array.
   * @throws {RangeError} If the array length doesn't match MEMORY_SIZE.
   */
  restore(buffer: number[]): void {
    if (buffer.length !== MEMORY_SIZE) {
      throw new RangeError(
        `Buffer size ${buffer.length} does not match MEMORY_SIZE ${MEMORY_SIZE}`
      );
    }
    for (let i = 0; i < buffer.length; i++) {
      this.data[i] = buffer[i] & 0xff;
    }
    this.accessLog = [];
  }

  // ── Access Log ──────────────────────────────────────────────────────────

  /** Return the full access log (read-only). */
  getAccessLog(): ReadonlyArray<MemoryAccessEvent> {
    return this.accessLog;
  }

  /**
   * Return the last `count` access events (most recent last).
   *
   * @param count - Maximum number of events to return.
   */
  getRecentAccesses(count: number): MemoryAccessEvent[] {
    return this.accessLog.slice(-count);
  }

  // ── Event Subscription ─────────────────────────────────────────────────

  /**
   * Subscribe to memory access events.
   *
   * @param type     - "read" or "write".
   * @param listener - Callback that receives the access event.
   * @returns An unsubscribe function.
   */
  on(type: MemoryAccessType, listener: MemoryListener): () => void {
    const set = this.listeners.get(type);
    if (!set) throw new Error(`Unknown event type: ${type}`);
    set.add(listener);
    return () => set.delete(listener); // unsubscribe function
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private validateAddress(address: number): void {
    if (!Number.isInteger(address) || address < 0 || address >= MEMORY_SIZE) {
      throw new RangeError(
        `Address 0x${address.toString(16).padStart(3, "0")} is out of bounds (0x000–0x${(MEMORY_SIZE - 1).toString(16)})`
      );
    }
  }

  private validateValue(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError(
        `Value ${value} is out of range for an 8-bit cell (0x00–0xFF)`
      );
    }
  }

  private emitEvent(
    type: MemoryAccessType,
    address: number,
    value: number
  ): void {
    const event: MemoryAccessEvent = {
      type,
      address,
      value,
      timestamp: Date.now(),
    };

    // Maintain bounded log
    if (this.accessLog.length >= this.maxLogSize) {
      this.accessLog.shift();
    }
    this.accessLog.push(event);

    // Notify listeners
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
  }
}
