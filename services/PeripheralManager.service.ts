/**
 * @module PeripheralManager
 *
 * Registry that owns every peripheral device attached to the CPU.
 * It manages lifecycle transitions (register / unregister / connect / disconnect),
 * ticks all connected peripherals each CPU cycle to collect pending interrupts,
 * and emits lifecycle events so the WS layer can broadcast changes.
 */

import type {
  Peripheral,
  Interrupt,
  PeripheralSnapshot,
  PeripheralStatus,
} from "@/types/peripheral.types";

// ─── Events ─────────────────────────────────────────────────────────────────

/** Lifecycle event emitted by the peripheral manager. */
export interface PeripheralManagerEvent {
  type: "registered" | "unregistered" | "connected" | "disconnected" | "triggered";
  peripheralId: string;
  timestamp: number;
}

/** Callback signature for peripheral manager event subscribers. */
type PeripheralManagerListener = (event: PeripheralManagerEvent) => void;

// ─── Peripheral Manager ─────────────────────────────────────────────────────

/**
 * Registry for all peripherals. Manages their lifecycle (connect/disconnect)
 * and ticks all connected peripherals each CPU cycle to collect interrupts.
 */
export class PeripheralManager {
  private peripherals: Map<string, Peripheral>;
  private listeners: Set<PeripheralManagerListener>;

  constructor() {
    this.peripherals = new Map();
    this.listeners = new Set();
  }

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Add a peripheral to the registry. It starts in whatever status
   * the peripheral was constructed with (typically DISCONNECTED).
   */
  register(peripheral: Peripheral): void {
    if (this.peripherals.has(peripheral.id)) {
      throw new Error(`Peripheral "${peripheral.id}" is already registered`);
    }
    this.peripherals.set(peripheral.id, peripheral);
    this.emit("registered", peripheral.id);
  }

  /**
   * Remove a peripheral entirely. Disconnects it first if connected.
   */
  unregister(id: string): boolean {
    const p = this.peripherals.get(id);
    if (!p) return false;

    if (p.status !== ("DISCONNECTED" as PeripheralStatus)) {
      p.disconnect();
    }
    this.peripherals.delete(id);
    this.emit("unregistered", id);
    return true;
  }

  // ── Connect / Disconnect ──────────────────────────────────────────────

  connect(id: string): void {
    const p = this.getOrThrow(id);
    p.connect();
    this.emit("connected", id);
  }

  disconnect(id: string): void {
    const p = this.getOrThrow(id);
    p.disconnect();
    this.emit("disconnected", id);
  }

  // ── Trigger ───────────────────────────────────────────────────────────

  trigger(id: string): void {
    const p = this.getOrThrow(id);
    p.trigger();
    this.emit("triggered", id);
  }

  // ── Tick ──────────────────────────────────────────────────────────────

  /**
   * Tick all connected (non-DISCONNECTED) peripherals.
   * Returns an array of any interrupts generated this cycle.
   */
  tickAll(): Interrupt[] {
    const interrupts: Interrupt[] = [];

    for (const p of this.peripherals.values()) {
      if (p.status === ("DISCONNECTED" as PeripheralStatus)) continue;

      const interrupt = p.tick();
      if (interrupt !== null) {
        interrupts.push(interrupt);
      }
    }

    return interrupts;
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  get(id: string): Peripheral | undefined {
    return this.peripherals.get(id);
  }

  getAll(): Peripheral[] {
    return Array.from(this.peripherals.values());
  }

  getConnected(): Peripheral[] {
    return Array.from(this.peripherals.values())
      .filter((p) => p.status !== ("DISCONNECTED" as PeripheralStatus));
  }

  has(id: string): boolean {
    return this.peripherals.has(id);
  }

  get size(): number {
    return this.peripherals.size;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  /**
   * Return serialisable snapshots of all peripherals.
   */
  toJSON(): PeripheralSnapshot[] {
    return Array.from(this.peripherals.values()).map((p) => p.toJSON());
  }

  // ── Event Subscription ────────────────────────────────────────────────

  onEvent(listener: PeripheralManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /**
   * Disconnect and reconnect all peripherals (soft reset).
   * Keeps them registered. To fully remove, use {@link clear}.
   */
  reset(): void {
    for (const p of this.peripherals.values()) {
      if (p.status !== ("DISCONNECTED" as PeripheralStatus)) {
        p.disconnect();
      }
      p.connect();
    }
  }

  /**
   * Disconnect and remove all peripherals.
   */
  clear(): void {
    this.reset();
    this.peripherals.clear();
    this.listeners.clear();
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private getOrThrow(id: string): Peripheral {
    const p = this.peripherals.get(id);
    if (!p) {
      throw new Error(`Peripheral "${id}" not found`);
    }
    return p;
  }

  private emit(
    type: PeripheralManagerEvent["type"],
    peripheralId: string
  ): void {
    const event: PeripheralManagerEvent = {
      type,
      peripheralId,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
