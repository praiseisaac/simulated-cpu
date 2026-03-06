/**
 * @module ScreenPeripheral
 *
 * Concrete {@link Peripheral} implementation: a memory-mapped scrolling
 * grid display that visualises data over time.
 *
 * **Default behaviour (auto-scroll mode):**
 * Each tick the screen reads a single byte from a configurable
 * `sourceAddress` in memory (e.g. the proximity sensor's hardware
 * register at 0x0038). It then shifts every column of the internal
 * pixel buffer one step to the **left** and draws a new column on the
 * right whose filled height is proportional to the sampled value.
 * The result is a real-time scrolling waveform / bar-chart that
 * "slides across the screen" as new data arrives.
 *
 * Colour is derived from the value itself using a small 16-entry
 * palette so different signal levels are visually distinct.
 *
 * The screen never fires interrupts — it is a pure output device.
 */

import {
  PeripheralStatus,
  type Peripheral,
  type Interrupt,
  type PeripheralSnapshot,
} from "@/types/peripheral.types";
import type { MemoryService } from "@/services/Memory.service";

// ─── 16-colour palette (index = value & 0xF) ───────────────────────────────

/**
 * CSS colour strings used when rendering the grid.
 * Index 0 is "off / background"; the rest are signal colours that
 * progress from cool → warm so higher values read as hotter.
 */
const PALETTE: readonly string[] = [
  "#0f172a", // 0  – off / dark slate
  "#1e3a5f", // 1  – deep blue
  "#1d4ed8", // 2  – blue
  "#2563eb", // 3  – bright blue
  "#0891b2", // 4  – cyan
  "#059669", // 5  – emerald
  "#16a34a", // 6  – green
  "#65a30d", // 7  – lime
  "#ca8a04", // 8  – yellow
  "#ea580c", // 9  – orange
  "#dc2626", // 10 – red
  "#e11d48", // 11 – rose
  "#c026d3", // 12 – fuchsia
  "#7c3aed", // 13 – violet
  "#f8fafc", // 14 – near-white
  "#ffffff", // 15 – white
] as const;

export { PALETTE as SCREEN_PALETTE };

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a 0–255 byte value to a palette index (0–15).
 * 0 always maps to palette 0 (off).  Non-zero values are scaled
 * linearly into palette indices 1–15.
 */
function valueToPaletteIndex(value: number): number {
  if (value === 0) return 0;
  // Map 1-255 → 1-15
  return Math.min(15, Math.max(1, Math.ceil((value / 255) * 15)));
}

// ─── Screen Peripheral ─────────────────────────────────────────────────────

export class ScreenPeripheral implements Peripheral {
  readonly id: string;
  readonly name: string;
  priority: number;
  status: PeripheralStatus;

  private handlerAddress: number;
  private readonly memory: MemoryService;

  /** Grid width (columns). */
  private width: number;
  /** Grid height (rows). */
  private height: number;

  /**
   * Memory address the screen samples each tick.
   * Defaults to 0x0038 — the proximity sensor's register.
   */
  private sourceAddress: number;

  /**
   * Internal pixel buffer stored **row-major**: `pixels[row * width + col]`.
   * Each entry is a palette index (0–15).
   */
  private pixels: number[];

  /** Tick divider — only scroll every N ticks (controls scroll speed). */
  private tickDivider: number;
  private tickCounter: number;

  constructor(
    id: string,
    name: string,
    handlerAddress: number = 0,
    width: number = 32,
    height: number = 8,
    sourceAddress: number = 0x0038,
    memory: MemoryService,
    tickDivider: number = 2,
  ) {
    this.id = id;
    this.name = name;
    this.handlerAddress = handlerAddress;
    this.priority = 0; // never fires — priority irrelevant
    this.status = PeripheralStatus.DISCONNECTED;

    this.memory = memory;
    this.width = width;
    this.height = height;
    this.sourceAddress = sourceAddress;
    this.pixels = new Array(width * height).fill(0);
    this.tickDivider = Math.max(1, tickDivider);
    this.tickCounter = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  connect(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) {
      this.status = PeripheralStatus.IDLE;
    }
  }

  disconnect(): void {
    this.status = PeripheralStatus.DISCONNECTED;
  }

  // ── Configuration ─────────────────────────────────────────────────────

  setSourceAddress(address: number): void {
    this.sourceAddress = address;
  }

  setTickDivider(divider: number): void {
    this.tickDivider = Math.max(1, divider);
  }

  /** Clear all pixels to 0 (off). */
  clearScreen(): void {
    this.pixels.fill(0);
  }

  // ── Trigger ───────────────────────────────────────────────────────────

  /** Trigger clears the screen. */
  trigger(): void {
    this.clearScreen();
  }

  // ── Tick — the auto-scroll engine ─────────────────────────────────────

  /**
   * Each qualifying tick:
   * 1. Read one byte from `sourceAddress`.
   * 2. Shift every column left by one (oldest data falls off).
   * 3. Draw a new rightmost column whose filled height is proportional
   *    to the sampled value (0 = empty, 255 = full height).
   *
   * The screen never generates interrupts — always returns `null`.
   */
  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;

    this.tickCounter++;
    if (this.tickCounter < this.tickDivider) return null;
    this.tickCounter = 0;

    this.status = PeripheralStatus.ACTIVE;

    // 1. Sample the source — invert so that low distance (close) = tall bar,
    //    high distance (far) = empty.  A raw value of 255 means "far away"
    //    and should produce an empty column (dark background).
    const raw = this.memory.read(this.sourceAddress);
    const value = 255 - raw;

    // 2. Shift columns left
    for (let row = 0; row < this.height; row++) {
      const rowBase = row * this.width;
      for (let col = 0; col < this.width - 1; col++) {
        this.pixels[rowBase + col] = this.pixels[rowBase + col + 1];
      }
    }

    // 3. Draw new rightmost column
    //    barHeight is how many cells from the bottom should be filled.
    const barHeight = Math.round((value / 255) * this.height);
    const colorIdx = valueToPaletteIndex(value);

    for (let row = 0; row < this.height; row++) {
      const fromBottom = this.height - 1 - row;
      const rightCol = this.width - 1;
      this.pixels[row * this.width + rightCol] =
        fromBottom < barHeight ? colorIdx : 0;
    }

    this.status = PeripheralStatus.IDLE;
    return null;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  toJSON(): PeripheralSnapshot {
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      status: this.status,
      handlerAddress: this.handlerAddress,
      meta: {
        type: "screen",
        width: this.width,
        height: this.height,
        sourceAddress: this.sourceAddress,
        tickDivider: this.tickDivider,
        pixels: [...this.pixels],
        palette: [...PALETTE],
      },
    };
  }
}
