/**
 * @module CPU.service
 *
 * Top-level CPU orchestrator. On each clock tick:
 *
 * 1. **Scheduler** — Context-switch / assign processes to cores.
 * 2. **Peripherals** — Tick all connected peripherals, collect IRQs.
 * 3. **Interrupt dispatch** — Route pending interrupts to available cores.
 * 4. **Core execution** — Each core runs one pipeline cycle.
 *
 * Also exposes clock control (start/stop/step), clock speed adjustment,
 * peripheral and scheduler management, and full serialisation.
 */

import {
  NUM_CORES,
  CLOCK_CYCLE_MS,
  SchedulerType,
  type CoreState,
  type ClockEvent,
  type ProcessState,
} from "@/types/cpu.types";
import type { Interrupt } from "@/types/peripheral.types";
import type { SavedState } from "@/types/persistence.types";
import { Core, type CoreCallbacks } from "@/services/cpu/Core.service";
import { Scheduler, type SchedulerEvent } from "@/services/cpu/Scheduler.service";
import { InterruptController } from "@/services/cpu/InterruptController.service";
import { PeripheralManager } from "@/services/PeripheralManager.service";
import type { MemoryService } from "@/services/Memory.service";
import type { Peripheral } from "@/types/peripheral.types";

// ─── CPU Event Listener ─────────────────────────────────────────────────────

/** Callback invoked on every clock tick with the full {@link ClockEvent}. */
type CPUListener = (event: ClockEvent) => void;

// ─── CPU Service ────────────────────────────────────────────────────────────

/**
 * Main CPU service — owns cores, scheduler, interrupt controller,
 * peripheral manager, and the clock interval.
 *
 * Instantiate with a {@link MemoryService} and optional
 * {@link CoreCallbacks} for observing pipeline activity.
 */
export class CPUService {
  private cores: Core[];
  private memory: MemoryService;
  private scheduler: Scheduler;
  private interruptController: InterruptController;
  private peripheralManager: PeripheralManager;
  private cycle: number;
  private running: boolean;
  private timerId: ReturnType<typeof setInterval> | null;
  private listeners: Set<CPUListener>;
  private clockSpeed: number; // ms per tick

  constructor(memory: MemoryService, callbacks: CoreCallbacks = {}) {
    this.memory = memory;
    this.cores = [];
    for (let i = 0; i < NUM_CORES; i++) {
      this.cores.push(new Core(i, callbacks));
    }
    this.scheduler = new Scheduler();
    this.interruptController = new InterruptController();
    this.peripheralManager = new PeripheralManager();
    this.cycle = 0;
    this.running = false;
    this.timerId = null;
    this.listeners = new Set();
    this.clockSpeed = CLOCK_CYCLE_MS;
  }

  // ── Clock Control ─────────────────────────────────────────────────────

  /**
   * Start the clock. Each interval fires one tick on all cores.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timerId = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.stop();
        console.error("[CPU] Tick error — auto-stopped:", (err as Error).message);
      }
    }, this.clockSpeed);
  }

  /**
   * Stop (pause) the clock. State is preserved.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Advance exactly one clock cycle (manual stepping).
   */
  step(): ClockEvent {
    return this.tick();
  }

  /**
   * Change clock speed (ms per tick). Restarts the interval if running.
   */
  setClockSpeed(ms: number): void {
    if (ms <= 0) throw new RangeError("Clock speed must be > 0");
    this.clockSpeed = ms;
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  
  // ── Tick ──────────────────────────────────────────────────────────────

  private tick(): ClockEvent {
    this.cycle++;

    // 1. Scheduler: manage quantum-based scheduling
    this.scheduler.tick(this.cores, this.cycle);

    // 2. Peripherals: tick all connected peripherals, collect interrupts
    const peripheralInterrupts = this.peripheralManager.tickAll();
    this.interruptController.enqueueAll(peripheralInterrupts);

    // 3. Dispatch pending interrupts to available cores
    let interruptsFired = 0;
    const interruptSources: string[] = [];

    // Track which peripherals generated interrupts this cycle
    for (const irq of peripheralInterrupts) {
      interruptSources.push(irq.source);
    }

    while (this.interruptController.hasPending()) {
      const interrupt = this.interruptController.peek()!;

      // Find a core to dispatch to — prefer idle cores, then preempt lowest-priority process
      const targetCore = this.findCoreForInterrupt(interrupt);
      if (!targetCore) break; // no core available, leave interrupt queued

      this.interruptController.dequeueHighest();

      // If the core has a running process, preempt it first
      this.scheduler.interruptPreempt(targetCore, this.cycle);

      // Dispatch interrupt to the core
      targetCore.handleInterrupt(interrupt.handlerAddress);
      interruptsFired++;
    }

    // 4. Execute one cycle on each core
    const coreStates: CoreState[] = this.cores.map((core) => {
      const state = core.tick(this.memory);
      const running = this.scheduler.getRunningProcesses()
        .find((p) => p.assignedCore === core.coreId);
      state.assignedProcess = running?.pid ?? null;
      return state;
    });

    const event: ClockEvent = {
      cycle: this.cycle,
      coreStates,
      processQueue: this.scheduler.getProcessQueue(),
      schedulerType: this.scheduler.getType(),
      interruptsFired,
      interruptSources,
      pendingInterrupts: this.interruptController.size,
      timestamp: Date.now(),
    };

    this.emit(event);

    return event;
  }

  /**
   * Find a core to handle the given interrupt.
   * Prefers idle cores (not running a process and not servicing an interrupt).
   * Falls back to cores running a lower-priority process.
   * Returns null if no suitable core is found.
   */
  private findCoreForInterrupt(interrupt: Interrupt): Core | null {
    // First pass: completely idle core (no process, not servicing interrupt)
    for (const core of this.cores) {
      const proc = this.scheduler.getProcessOnCore(core.coreId);
      if (!proc && !core.isServicingInterrupt()) {
        return core;
      }
    }

    // Second pass: core running a lower-priority process that isn't already in an ISR
    let bestCore: Core | null = null;
    let lowestPriority = -1;

    for (const core of this.cores) {
      if (core.isServicingInterrupt()) continue; // don't nest interrupts from dispatch

      const proc = this.scheduler.getProcessOnCore(core.coreId);
      if (proc && proc.priority > interrupt.priority) {
        // This process has a higher priority number (= lower urgency) than the interrupt
        if (proc.priority > lowestPriority) {
          lowestPriority = proc.priority;
          bestCore = core;
        }
      }
    }

    return bestCore;
  }

  // ── Core Access ───────────────────────────────────────────────────────

  /**
   * Return a specific core by index.
   * @throws {RangeError} If `index` is out of bounds.
   */
  getCore(index: number): Core {
    if (index < 0 || index >= NUM_CORES) {
      throw new RangeError(`Core index ${index} out of range (0–${NUM_CORES - 1})`);
    }
    return this.cores[index];
  }

  /** Snapshot of every core's state (registers, pc, flags, pipeline). */
  getCoreStates(): CoreState[] {
    return this.cores.map((c) => c.getState());
  }

  /** Current tick counter (monotonically increasing). */
  getCycle(): number {
    return this.cycle;
  }

  /** Whether the clock interval is active. */
  isRunning(): boolean {
    return this.running;
  }

  // ── Scheduler Access ──────────────────────────────────────────────────

  /**
   * Add a process to the scheduler queue.
   * Returns the assigned PID.
   */
  addProcess(
    name: string,
    programStart: number,
    programLength: number,
    priority?: number
  ): number {
    return this.scheduler.addProcess(name, programStart, programLength, priority);
  }

  /** Remove a process from the scheduler by PID. */
  removeProcess(pid: number): boolean {
    return this.scheduler.removeProcess(pid);
  }

  /** Direct access to the underlying scheduler instance. */
  getScheduler(): Scheduler {
    return this.scheduler;
  }

  /** Switch the scheduling algorithm. */
  setSchedulerType(type: SchedulerType): void {
    this.scheduler.setType(type);
  }

  /** Return the active scheduling algorithm. */
  getSchedulerType(): SchedulerType {
    return this.scheduler.getType();
  }

  /** Non-finished processes sorted by priority. */
  getProcessQueue(): ProcessState[] {
    return this.scheduler.getProcessQueue();
  }

  /** Subscribe to scheduler lifecycle events. */
  onSchedulerEvent(listener: (event: SchedulerEvent) => void): () => void {
    return this.scheduler.onEvent(listener);
  }

  // ── Peripheral Access ──────────────────────────────────────────────

  /** Register and wire a peripheral to the CPU bus. */
  registerPeripheral(peripheral: Peripheral): void {
    this.peripheralManager.register(peripheral);
  }

  /** Remove a peripheral from the registry. */
  unregisterPeripheral(id: string): boolean {
    return this.peripheralManager.unregister(id);
  }

  /** Activate a registered peripheral's connection. */
  connectPeripheral(id: string): void {
    this.peripheralManager.connect(id);
  }

  /** Deactivate a peripheral's connection (stops it from ticking). */
  disconnectPeripheral(id: string): void {
    this.peripheralManager.disconnect(id);
  }

  /** Manually trigger a peripheral (e.g. simulate a button press). */
  triggerPeripheral(id: string): void {
    this.peripheralManager.trigger(id);
  }

  /** Direct access to the peripheral manager. */
  getPeripheralManager(): PeripheralManager {
    return this.peripheralManager;
  }

  /** Direct access to the interrupt controller. */
  getInterruptController(): InterruptController {
    return this.interruptController;
  }

  /** Current clock speed in ms per tick. */
  getClockSpeed(): number {
    return this.clockSpeed;
  }

  /** Direct access to the memory service. */
  getMemory(): MemoryService {
    return this.memory;
  }

  // ── Event Subscription ────────────────────────────────────────────────

  /**
   * Subscribe to clock-tick events.
   * @returns An unsubscribe function.
   */
  onTick(listener: CPUListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ClockEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /** Stop the clock, reset cycle counter, scheduler, peripherals, and all cores. */
  reset(): void {
    this.scheduler.reset();
    this.interruptController.reset();
    this.peripheralManager.reset();
    for (const core of this.cores) {
      core.reset();
    }
  }

  // ── Serialisation ───────────────────────────────────────────────────

  /** Serialise the full CPU state to a JSON-safe snapshot. */
  toJSON(): SavedState {
    return {
      version: 1,
      timestamp: Date.now(),
      cycle: this.cycle,
      clockSpeed: this.clockSpeed,
      memory: Array.from(this.memory.getRawBuffer()),
      cores: this.cores.map((c) => c.toJSON()),
      scheduler: this.scheduler.toJSON(),
      peripherals: this.peripheralManager.toJSON(),
      pendingInterrupts: Array.from(this.interruptController.getPendingInterrupts()),
    };
  }

  /**
   * Restore CPU state from a saved snapshot.
   * NOTE: Does NOT restore peripherals (they must be re-registered externally
   * since they are class instances with behaviour). Only restores core state,
   * scheduler queue, memory, cycle counter, and pending interrupts.
   */
  restoreFromSnapshot(state: SavedState): void {
    this.stop();
    this.cycle = state.cycle;
    this.clockSpeed = state.clockSpeed;
    this.memory.restore(state.memory);

    for (let i = 0; i < this.cores.length && i < state.cores.length; i++) {
      this.cores[i].restoreFromSnapshot(state.cores[i]);
    }

    this.scheduler.restoreFromSnapshot(state.scheduler);

    this.interruptController.clear();
    this.interruptController.enqueueAll(state.pendingInterrupts);
  }
}
