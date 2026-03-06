/**
 * @module Scheduler.service
 *
 * Process scheduler supporting three algorithms:
 *
 * | Type                  | Behaviour                                      |
 * |-----------------------|------------------------------------------------|
 * | Round Robin           | Fixed time-quantum rotation (FIFO by PID)      |
 * | Preemptive Priority   | Higher-priority ready process preempts running  |
 * | Non-Preemptive        | Run-to-completion; only idle cores are assigned  |
 *
 * The scheduler is ticked once per CPU clock cycle **before** cores execute.
 * It manages context save/restore by delegating to {@link Core}'s
 * `saveContext` / `restoreContext` methods.
 */

import {
  DEFAULT_QUANTUM,
  ProcessStatus,
  SchedulerType,
  type ProcessState,
} from "@/types/cpu.types";
import type { SchedulerSnapshot } from "@/types/persistence.types";
import type { Core } from "@/services/cpu/Core.service";

// ─── Scheduler Event ────────────────────────────────────────────────────────

/**
 * Emitted by the scheduler when a process changes state.
 * Consumers (e.g. the WS server) use these for logging and UI updates.
 */
export interface SchedulerEvent {
  /** What happened. */
  type: "assigned" | "preempted" | "completed" | "enqueued" | "removed" | "interrupted";
  /** Process affected. */
  pid: number;
  /** Core related to the event, or `null`. */
  coreId: number | null;
  /** CPU cycle at which the event occurred. */
  cycle: number;
}

/** Callback receiving scheduler events. */
type SchedulerListener = (event: SchedulerEvent) => void;

// ─── Scheduler ──────────────────────────────────────────────────────────────

/**
 * Multi-algorithm process scheduler.
 *
 * Maintains a process table (`Map<pid, ProcessState>`) and assigns ready
 * processes to idle or preemptable cores each tick. Supports live switching
 * between scheduling algorithms via {@link setType}.
 */
export class Scheduler {
  private processes: Map<number, ProcessState>;
  private nextPid: number;
  private quantum: number;
  private listeners: Set<SchedulerListener>;
  private schedulerType: SchedulerType;

  /** Round-robin: tracks which ready PID should go next. */
  private rrIndex: number;

  constructor(quantum: number = DEFAULT_QUANTUM) {
    this.processes = new Map();
    this.nextPid = 1;
    this.quantum = quantum;
    this.listeners = new Set();
    this.schedulerType = SchedulerType.ROUND_ROBIN;
    this.rrIndex = 0;
  }

  // ── Scheduler Type ────────────────────────────────────────────────────

  /** Return the active scheduling algorithm. */
  getType(): SchedulerType {
    return this.schedulerType;
  }

  /** Switch to a different scheduling algorithm (takes effect next tick). */
  setType(type: SchedulerType): void {
    this.schedulerType = type;
  }

  // ── Process Management ────────────────────────────────────────────────

  /**
   * Add a new process to the ready queue.
   * Returns the assigned PID.
   */
  addProcess(
    name: string,
    programStart: number,
    programLength: number,
    priority: number = 5
  ): number {
    const pid = this.nextPid++;
    const process: ProcessState = {
      pid,
      name,
      priority,
      status: ProcessStatus.READY,
      programStart,
      programLength,
      savedRegisters: { R0: 0, R1: 0, R2: 0, R3: 0 },
      savedPC: programStart,
      savedFlags: { zero: false, carry: false, halted: false },
      assignedCore: null,
      cyclesUsed: 0,
      quantumRemaining: this.quantum,
    };

    this.processes.set(pid, process);
    return pid;
  }

  /**
   * Remove a process entirely (e.g. user kills it).
   */
  removeProcess(pid: number): boolean {
    const proc = this.processes.get(pid);
    if (!proc) return false;

    // If it's running on a core, we'll need to unassign on next tick
    if (proc.status === ProcessStatus.RUNNING && proc.assignedCore !== null) {
      proc.status = ProcessStatus.FINISHED;
    }

    this.processes.delete(pid);
    return true;
  }

  // ── Tick ──────────────────────────────────────────────────────────────

  /**
   * Called once per CPU clock cycle, BEFORE cores execute.
   * Dispatches to the appropriate scheduling algorithm.
   */
  tick(cores: Core[], cycle: number): void {
    switch (this.schedulerType) {
      case SchedulerType.ROUND_ROBIN:
        this.tickRoundRobin(cores, cycle);
        break;
      case SchedulerType.PREEMPTIVE_PRIORITY:
        this.tickPreemptivePriority(cores, cycle);
        break;
      case SchedulerType.NON_PREEMPTIVE:
        this.tickNonPreemptive(cores, cycle);
        break;
    }
  }

  // ── Round Robin ───────────────────────────────────────────────────────

  /**
   * Round-robin scheduling with time quantum.
   * Each process gets `quantum` cycles, then is preempted and moved to
   * the back of the queue. Processes rotate in FIFO order (by PID).
   */
  private tickRoundRobin(cores: Core[], cycle: number): void {
    // Step 1: Handle running processes — check halted, decrement quantum, preempt expired
    for (const proc of this.processes.values()) {
      if (proc.status !== ProcessStatus.RUNNING || proc.assignedCore === null) continue;

      const core = cores[proc.assignedCore];

      if (core.isHalted()) {
        this.saveContext(proc, core);
        proc.status = ProcessStatus.FINISHED;
        proc.assignedCore = null;
        core.reset();
        this.emitEvent({ type: "completed", pid: proc.pid, coreId: core.coreId, cycle });
        continue;
      }

      proc.quantumRemaining--;
      proc.cyclesUsed++;

      if (proc.quantumRemaining <= 0) {
        this.saveContext(proc, core);
        proc.status = ProcessStatus.READY;
        proc.assignedCore = null;
        proc.quantumRemaining = this.quantum;
        core.reset();
        this.emitEvent({ type: "preempted", pid: proc.pid, coreId: core.coreId, cycle });
      }
    }

    // Step 2: Assign ready processes to idle cores (FIFO with rrIndex wrap)
    const readyQueue = this.getRoundRobinQueue();
    const idleCores = cores.filter((c) => !this.isCoreAssigned(c.coreId));

    for (const core of idleCores) {
      const next = readyQueue.shift();
      if (!next) break;
      this.assignToCore(next, core, cycle);
    }
  }

  /**
   * Round-robin ready queue: sorted by PID for pure FIFO rotation.
   * Wraps around using rrIndex so previously-run processes go to the back.
   */
  private getRoundRobinQueue(): ProcessState[] {
    const ready = Array.from(this.processes.values())
      .filter((p) => p.status === ProcessStatus.READY)
      .sort((a, b) => a.pid - b.pid);

    if (ready.length === 0) return ready;

    // Normalize rrIndex
    this.rrIndex = this.rrIndex % ready.length;

    // Rotate: elements from rrIndex onwards, then wrap to start
    const rotated = [
      ...ready.slice(this.rrIndex),
      ...ready.slice(0, this.rrIndex),
    ];

    // Advance index for next assignment
    this.rrIndex = (this.rrIndex + 1) % ready.length;

    return rotated;
  }

  // ── Preemptive Priority ───────────────────────────────────────────────

  /**
   * Preemptive priority scheduling.
   * At every tick, the highest-priority READY process can preempt a running
   * process with lower priority (higher number). No quantum — a process runs
   * until preempted by a higher-priority process or completes.
   */
  private tickPreemptivePriority(cores: Core[], cycle: number): void {
    // Step 1: Handle halted/completed processes
    for (const proc of this.processes.values()) {
      if (proc.status !== ProcessStatus.RUNNING || proc.assignedCore === null) continue;

      const core = cores[proc.assignedCore];

      if (core.isHalted()) {
        this.saveContext(proc, core);
        proc.status = ProcessStatus.FINISHED;
        proc.assignedCore = null;
        core.reset();
        this.emitEvent({ type: "completed", pid: proc.pid, coreId: core.coreId, cycle });
        continue;
      }

      proc.cyclesUsed++;
    }

    // Step 2: Check if any ready process has higher priority than a running one
    const readyQueue = this.getPriorityQueue();
    const idleCores = cores.filter((c) => !this.isCoreAssigned(c.coreId));

    // First, fill idle cores
    for (const core of idleCores) {
      const next = readyQueue.shift();
      if (!next) break;
      this.assignToCore(next, core, cycle);
    }

    // Then, check for priority preemption on busy cores
    for (const candidate of readyQueue) {
      // Find the running process with the lowest priority (highest number)
      let worstProc: ProcessState | null = null;
      let worstCore: Core | null = null;

      for (const core of cores) {
        if (core.isServicingInterrupt()) continue; // don't preempt ISRs
        const running = this.getProcessOnCore(core.coreId);
        if (!running) continue;
        if (candidate.priority < running.priority) {
          // candidate is higher priority (lower number)
          if (!worstProc || running.priority > worstProc.priority) {
            worstProc = running;
            worstCore = core;
          }
        }
      }

      if (worstProc && worstCore) {
        // Preempt the lower-priority process
        this.saveContext(worstProc, worstCore);
        worstProc.status = ProcessStatus.READY;
        worstProc.assignedCore = null;
        worstCore.reset();
        this.emitEvent({ type: "preempted", pid: worstProc.pid, coreId: worstCore.coreId, cycle });

        // Assign the higher-priority candidate
        this.assignToCore(candidate, worstCore, cycle);
      }
    }
  }

  // ── Non-Preemptive ────────────────────────────────────────────────────

  /**
   * Non-preemptive (run-to-completion) scheduling.
   * Once a process starts, it runs until it halts/completes.
   * No quantum-based preemption and no priority preemption.
   * New processes only get assigned to idle cores.
   */
  private tickNonPreemptive(cores: Core[], cycle: number): void {
    // Step 1: Handle halted/completed processes
    for (const proc of this.processes.values()) {
      if (proc.status !== ProcessStatus.RUNNING || proc.assignedCore === null) continue;

      const core = cores[proc.assignedCore];

      if (core.isHalted()) {
        this.saveContext(proc, core);
        proc.status = ProcessStatus.FINISHED;
        proc.assignedCore = null;
        core.reset();
        this.emitEvent({ type: "completed", pid: proc.pid, coreId: core.coreId, cycle });
        continue;
      }

      proc.cyclesUsed++;
      // No quantum decrement — process runs until completion
    }

    // Step 2: Only assign ready processes to idle cores (no preemption)
    const readyQueue = this.getPriorityQueue();
    const idleCores = cores.filter((c) => !this.isCoreAssigned(c.coreId));

    for (const core of idleCores) {
      const next = readyQueue.shift();
      if (!next) break;
      this.assignToCore(next, core, cycle);
    }
  }

  // ── Priority Queue Helper ────────────────────────────────────────────

  /**
   * Returns ready processes sorted by priority (ascending = higher priority first),
   * then by PID for FIFO within same priority.
   */
  private getPriorityQueue(): ProcessState[] {
    return Array.from(this.processes.values())
      .filter((p) => p.status === ProcessStatus.READY)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.pid - b.pid;
      });
  }

  // ── Queue Access ──────────────────────────────────────────────────────

  /**
   * Get all ready processes sorted appropriately for the current scheduler type.
   * Round Robin: FIFO by PID; Priority-based: by priority then PID.
   */
  getReadyQueue(): ProcessState[] {
    if (this.schedulerType === SchedulerType.ROUND_ROBIN) {
      return Array.from(this.processes.values())
        .filter((p) => p.status === ProcessStatus.READY)
        .sort((a, b) => a.pid - b.pid);
    }
    return this.getPriorityQueue();
  }

  /** Return all running processes. */
  getRunningProcesses(): ProcessState[] {
    return Array.from(this.processes.values())
      .filter((p) => p.status === ProcessStatus.RUNNING);
  }

  /** Return every tracked process regardless of status. */
  getAllProcesses(): ProcessState[] {
    return Array.from(this.processes.values());
  }

  /** Look up a process by PID. */
  getProcess(pid: number): ProcessState | undefined {
    return this.processes.get(pid);
  }

  /**
   * Return non-finished processes sorted by priority (ascending), then PID.
   * Used for the UI process queue display.
   */
  getProcessQueue(): ProcessState[] {
    return Array.from(this.processes.values())
      .filter((p) => p.status !== ProcessStatus.FINISHED)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.pid - b.pid;
      });
  }

  // ── Interrupt Preemption ─────────────────────────────────────────────

  /**
   * Preempt the process running on the given core due to an interrupt.
   * Saves context, moves the process back to READY (mid-quantum),
   * and resets the core so the CPU can dispatch the ISR.
   *
   * Returns the PID of the preempted process, or null if no process was running.
   */
  interruptPreempt(core: Core, cycle: number): number | null {
    const proc = this.getProcessOnCore(core.coreId);
    if (!proc) return null;

    this.saveContext(proc, core);
    proc.status = ProcessStatus.READY;
    const coreId = proc.assignedCore;
    proc.assignedCore = null;
    // Do NOT reset quantum — the process gets its remaining quantum back
    // when re-assigned (it was interrupted, not expired)
    core.reset();

    this.emitEvent({ type: "interrupted", pid: proc.pid, coreId, cycle });
    return proc.pid;
  }

  /**
   * Get the process currently running on a given core, if any.
   */
  getProcessOnCore(coreId: number): ProcessState | null {
    for (const proc of this.processes.values()) {
      if (proc.status === ProcessStatus.RUNNING && proc.assignedCore === coreId) {
        return proc;
      }
    }
    return null;
  }

  // ── Configuration ─────────────────────────────────────────────────────

  /** Current time-slice quantum (only meaningful for round-robin). */
  getQuantum(): number {
    return this.quantum;
  }

  /**
   * Set a new quantum value.
   * @throws {RangeError} If `q` is ≤ 0.
   */
  setQuantum(q: number): void {
    if (q <= 0) throw new RangeError("Quantum must be > 0");
    this.quantum = q;
  }

  // ── Event Subscription ────────────────────────────────────────────────

  /**
   * Subscribe to scheduler lifecycle events.
   * @returns An unsubscribe function.
   */
  onEvent(listener: SchedulerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /** Clear all processes and reset the PID counter. */
  reset(): void {
    this.processes.clear();
    this.nextPid = 1;
    this.rrIndex = 0;
  }

  // ── Serialisation ───────────────────────────────────────────────────

  /** Serialise scheduler state (process table + config) to JSON. */
  toJSON(): SchedulerSnapshot {
    return {
      processes: Array.from(this.processes.values()).map((p) => ({ ...p })),
      nextPid: this.nextPid,
      quantum: this.quantum,
      schedulerType: this.schedulerType,
    };
  }

  /** Restore scheduler state from a previously serialised snapshot. */
  restoreFromSnapshot(snapshot: SchedulerSnapshot): void {
    this.processes.clear();
    for (const proc of snapshot.processes) {
      this.processes.set(proc.pid, { ...proc });
    }
    this.nextPid = snapshot.nextPid;
    this.quantum = snapshot.quantum;
    if (snapshot.schedulerType) {
      this.schedulerType = snapshot.schedulerType;
    }
    this.rrIndex = 0;
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private isCoreAssigned(coreId: number): boolean {
    for (const proc of this.processes.values()) {
      if (proc.status === ProcessStatus.RUNNING && proc.assignedCore === coreId) {
        return true;
      }
    }
    return false;
  }

  private assignToCore(proc: ProcessState, core: Core, cycle: number): void {
    // Restore saved context into the core
    core.restoreContext({
      registers: { ...proc.savedRegisters },
      pc: proc.savedPC,
      flags: { ...proc.savedFlags },
    });

    proc.status = ProcessStatus.RUNNING;
    proc.assignedCore = core.coreId;

    // Only set quantum for round-robin (other modes don't use it)
    if (this.schedulerType === SchedulerType.ROUND_ROBIN) {
      proc.quantumRemaining = this.quantum;
    }

    this.emitEvent({ type: "assigned", pid: proc.pid, coreId: core.coreId, cycle });
  }

  private saveContext(proc: ProcessState, core: Core): void {
    const ctx = core.saveContext();
    proc.savedRegisters = ctx.registers;
    proc.savedPC = ctx.pc;
    proc.savedFlags = ctx.flags;
  }

  private emitEvent(event: SchedulerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
