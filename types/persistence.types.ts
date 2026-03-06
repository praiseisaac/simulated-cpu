/**
 * @module persistence.types
 *
 * JSON-serialisable snapshot types used to save and restore the full
 * simulation state (cores, scheduler, memory, peripherals, interrupts).
 */

import type { Registers, StatusFlags, PipelineStage, ProcessState, SchedulerType } from "./cpu.types";
import type { PeripheralSnapshot, Interrupt } from "./peripheral.types";

// ─── Serialisable Core Snapshot ─────────────────────────────────────────────

/**
 * JSON-safe representation of a single CPU core's internal state.
 * `Uint8Array` fields are converted to plain number arrays.
 */
export interface CoreSnapshot {
  /** Core identifier (0-based). */
  coreId: number;
  /** Register values at time of snapshot. */
  registers: Registers;
  /** Program counter. */
  pc: number;
  /** Instruction register — 4 bytes stored as a plain array (Uint8Array isn't JSON-safe). */
  ir: number[];
  /** CPU status flags. */
  flags: StatusFlags;
  /** Pipeline stage the core was in. */
  pipelineStage: PipelineStage;
  /** Saved interrupt context stack (register/pc/flags per nested ISR). */
  interruptStack: Array<{
    registers: Registers;
    pc: number;
    flags: StatusFlags;
  }>;
}

// ─── Serialisable Scheduler Snapshot ────────────────────────────────────────

/**
 * Snapshot of the scheduler's process table and configuration.
 */
export interface SchedulerSnapshot {
  /** All tracked processes (any status). */
  processes: ProcessState[];
  /** Next PID to assign. */
  nextPid: number;
  /** Current time-slice quantum (cycles). */
  quantum: number;
  /** Active scheduling algorithm (omitted in older snapshots). */
  schedulerType?: SchedulerType;
}

// ─── Full Saved State ───────────────────────────────────────────────────────

/**
 * Complete simulation state that can be serialised to JSON and
 * restored later to resume exactly where execution left off.
 */
export interface SavedState {
  /** Schema version for forward compatibility. */
  version: number;
  /** Unix timestamp (ms) when the snapshot was taken. */
  timestamp: number;
  /** Current clock cycle. */
  cycle: number;
  /** Clock speed in milliseconds per tick. */
  clockSpeed: number;
  /** Full 1024-byte memory buffer as a plain array. */
  memory: number[];
  /** Per-core snapshots. */
  cores: CoreSnapshot[];
  /** Scheduler snapshot (process table + config). */
  scheduler: SchedulerSnapshot;
  /** Serialised peripheral state. */
  peripherals: PeripheralSnapshot[];
  /** Interrupts still queued at time of snapshot. */
  pendingInterrupts: Interrupt[];
}
