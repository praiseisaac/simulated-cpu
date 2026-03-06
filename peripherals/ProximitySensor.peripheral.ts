/**
 * @module ProximitySensorPeripheral
 *
 * Concrete {@link Peripheral} implementation: a proximity sensor that fires
 * an interrupt when the cursor moves within a configurable `radius` of its
 * node on the canvas.
 *
 * Each tick the sensor writes the current distance (clamped to 0–255) to a
 * memory-mapped hardware register so programs can read it directly.
 * Interrupts are edge-triggered — they fire once when the cursor *enters*
 * the radius, not continuously while inside.
 */

import {
  PeripheralStatus,
  type Peripheral,
  type Interrupt,
  type PeripheralSnapshot,
} from "@/types/peripheral.types";
import type { MemoryService } from "@/services/Memory.service";

// ─── Proximity Sensor ───────────────────────────────────────────────────────

export class ProximitySensorPeripheral implements Peripheral {
  readonly id: string;
  readonly name: string;
  priority: number;
  status: PeripheralStatus;

  private handlerAddress: number;
  private radius: number;
  private currentDistance: number;
  private wasInRange: boolean;
  private pendingFire: boolean;
  private forceFire: boolean;
  private readonly memory: MemoryService;

  /** Memory address where the distance value is written each tick. */
  readonly registerAddress: number;

  constructor(
    id: string,
    name: string,
    handlerAddress: number,
    radius: number = 100,
    priority: number = 1,
    memory: MemoryService,
    registerAddress: number = 0x0038,
  ) {
    this.id = id;
    this.name = name;
    this.handlerAddress = handlerAddress;
    this.radius = radius;
    this.priority = priority;
    this.status = PeripheralStatus.DISCONNECTED;
    this.currentDistance = 9999;
    this.wasInRange = false;
    this.pendingFire = false;
    this.forceFire = false;
    this.memory = memory;
    this.registerAddress = registerAddress;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  connect(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) {
      this.status = PeripheralStatus.IDLE;
    }
  }

  disconnect(): void {
    this.status = PeripheralStatus.DISCONNECTED;
    this.pendingFire = false;
    this.forceFire = false;
    this.wasInRange = false;
  }

  // ── External Data Feed ────────────────────────────────────────────────

  /**
   * Feed the current Euclidean distance (px) from the cursor to the
   * node centre. Edge detection runs here: if the cursor just entered
   * the radius, an interrupt is queued for the next tick.
   */
  setDistance(distance: number): void {
    this.currentDistance = distance;

    const isInRange = distance < this.radius;

    // Fire on entry — was outside, now inside
    if (isInRange && !this.wasInRange) {
      this.pendingFire = true;
    }

    this.wasInRange = isInRange;
  }

  getDistance(): number {
    return this.currentDistance;
  }

  getRadius(): number {
    return this.radius;
  }

  setRadius(radius: number): void {
    this.radius = Math.max(1, radius);
    // Re-evaluate edge
    this.wasInRange = this.currentDistance < this.radius;
  }

  // ── Trigger ───────────────────────────────────────────────────────────

  trigger(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) return;
    this.forceFire = true;
  }

  // ── Tick ──────────────────────────────────────────────────────────────

  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;

    // Write clamped distance to the hardware register every tick
    const clamped = Math.min(255, Math.max(0, Math.floor(this.currentDistance)));
    this.memory.write(this.registerAddress, clamped);

    // Fire every tick while cursor is within the radius (like a button
    // that stays held down), OR on a forced / edge trigger.
    const shouldFire = this.forceFire || this.pendingFire || this.wasInRange;

    if (shouldFire) {
      this.pendingFire = false;
      this.forceFire = false;
      this.status = PeripheralStatus.ACTIVE;

      return {
        source: this.id,
        priority: this.priority,
        handlerAddress: this.handlerAddress,
        timestamp: Date.now(),
      };
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
        type: "proximity",
        radius: this.radius,
        currentDistance: Math.round(this.currentDistance),
        wasInRange: this.wasInRange,
        registerAddress: this.registerAddress,
      },
    };
  }
}
