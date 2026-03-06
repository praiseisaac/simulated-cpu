/**
 * @module InterruptController
 *
 * Priority-sorted interrupt queue that sits between peripherals and CPU cores.
 * Each tick the CPU drains pending interrupts and dispatches them to
 * available cores. Lower numeric priority = higher urgency.
 */

import type { Interrupt } from "@/types/peripheral.types";

// ─── Listener Types ─────────────────────────────────────────────────────────

/** Callback invoked when an interrupt is enqueued. */
type InterruptListener = (interrupt: Interrupt) => void;

// ─── Interrupt Controller ───────────────────────────────────────────────────

/**
 * Priority-sorted queue that collects interrupts from peripherals
 * and dispatches them to cores via the CPU tick loop.
 *
 * Lower `priority` number = higher urgency (dispatched first).
 */
export class InterruptController {
  private queue: Interrupt[];
  private listeners: Set<InterruptListener>;

  constructor() {
    this.queue = [];
    this.listeners = new Set();
  }

  // ── Enqueue ─────────────────────────────────────────────────────────

  /**
   * Add an interrupt to the queue. The queue is kept sorted by priority
   * (ascending — lower number = higher priority).
   * Ties are broken by timestamp (earlier first).
   */
  enqueue(interrupt: Interrupt): void {
    this.queue.push(interrupt);
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.timestamp - b.timestamp;
    });

    for (const listener of this.listeners) {
      listener(interrupt);
    }
  }

  /**
   * Enqueue multiple interrupts at once (from a peripheral tick batch).
   */
  enqueueAll(interrupts: Interrupt[]): void {
    for (const interrupt of interrupts) {
      this.enqueue(interrupt);
    }
  }

  // ── Dequeue ─────────────────────────────────────────────────────────

  /**
   * Remove and return the highest-priority (lowest number) interrupt,
   * or `null` if the queue is empty.
   */
  dequeueHighest(): Interrupt | null {
    return this.queue.shift() ?? null;
  }

  // ── Inspection ──────────────────────────────────────────────────────

  /**
   * Peek at the highest-priority interrupt without removing it.
   */
  peek(): Interrupt | null {
    return this.queue[0] ?? null;
  }

  /**
   * Whether there is at least one pending interrupt.
   */
  hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Number of pending interrupts.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Return a snapshot of all pending interrupts (read-only).
   */
  getPendingInterrupts(): ReadonlyArray<Interrupt> {
    return this.queue;
  }

  // ── Event Subscription ────────────────────────────────────────────

  /**
   * Register a listener that fires whenever an interrupt is enqueued.
   * Returns an unsubscribe function.
   */
  onInterrupt(listener: InterruptListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Clear / Reset ─────────────────────────────────────────────────

  /**
   * Discard all pending interrupts.
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Full reset — clears queue and all listeners.
   */
  reset(): void {
    this.queue = [];
    this.listeners.clear();
  }
}
