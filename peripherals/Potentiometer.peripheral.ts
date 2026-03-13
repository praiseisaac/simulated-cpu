/**
 * @module PotentiometerPeripheral
 *
 * Input peripheral with a configurable max resistance. External UI updates the
 * resistance value, which is normalized to 0-255 for CPU consumption and
 * written to a memory-mapped register each tick.
 *
 * Interrupt behavior: value-change interrupts with tick-based debounce.
 */

import {
  PeripheralStatus,
  type Peripheral,
  type Interrupt,
  type PeripheralSnapshot,
} from "@/types/peripheral.types";
import type { MemoryService } from "@/services/Memory.service";

export class PotentiometerPeripheral implements Peripheral {
  readonly id: string;
  readonly name: string;
  priority: number;
  status: PeripheralStatus;

  private handlerAddress: number;
  private readonly memory: MemoryService;
  private readonly registerAddress: number;

  private maxResistance: number;
  private currentResistance: number;
  private normalizedValue: number;

  private pendingFire: boolean;
  private forceFire: boolean;
  private debounceTicks: number;
  private debounceRemaining: number;

  constructor(
    id: string,
    name: string,
    handlerAddress: number,
    maxResistance: number = 100,
    priority: number = 2,
    memory: MemoryService,
    registerAddress: number = 0x003A,
    debounceTicks: number = 2,
  ) {
    this.id = id;
    this.name = name;
    this.handlerAddress = handlerAddress;
    this.maxResistance = Math.max(1, Math.floor(maxResistance));
    this.priority = priority;
    this.memory = memory;
    this.registerAddress = registerAddress;
    this.debounceTicks = Math.max(0, Math.floor(debounceTicks));

    this.currentResistance = 0;
    this.normalizedValue = 0;

    this.status = PeripheralStatus.DISCONNECTED;
    this.pendingFire = false;
    this.forceFire = false;
    this.debounceRemaining = 0;
  }

  connect(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) {
      this.status = PeripheralStatus.IDLE;
    }
  }

  disconnect(): void {
    this.status = PeripheralStatus.DISCONNECTED;
    this.pendingFire = false;
    this.forceFire = false;
    this.debounceRemaining = 0;
  }

  setResistance(resistance: number): void {
    const clamped = Math.min(this.maxResistance, Math.max(0, Math.round(resistance)));

    if (clamped === this.currentResistance) return;

    this.currentResistance = clamped;
    this.normalizedValue = this.normalizeResistance(clamped);

    // Value-change interrupt is debounced in tick() to avoid rapid IRQ storms.
    this.pendingFire = true;
    this.debounceRemaining = this.debounceTicks;
  }

  getResistance(): number {
    return this.currentResistance;
  }

  setMaxResistance(maxResistance: number): void {
    this.maxResistance = Math.max(1, Math.floor(maxResistance));
    this.currentResistance = Math.min(this.currentResistance, this.maxResistance);
    this.normalizedValue = this.normalizeResistance(this.currentResistance);
  }

  getMaxResistance(): number {
    return this.maxResistance;
  }

  getNormalizedValue(): number {
    return this.normalizedValue;
  }

  trigger(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) return;
    this.forceFire = true;
  }

  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;

    // CPU-facing data register is always refreshed while connected.
    this.memory.write(this.registerAddress, this.normalizedValue);

    if (this.pendingFire && this.debounceRemaining > 0) {
      this.debounceRemaining--;
    }

    const shouldFire =
      this.forceFire || (this.pendingFire && this.debounceRemaining === 0);

    if (!shouldFire) {
      this.status = PeripheralStatus.IDLE;
      return null;
    }

    this.pendingFire = false;
    this.forceFire = false;
    this.status = PeripheralStatus.ACTIVE;

    const interrupt: Interrupt = {
      source: this.id,
      priority: this.priority,
      handlerAddress: this.handlerAddress,
      timestamp: Date.now(),
    };

    this.status = PeripheralStatus.IDLE;
    return interrupt;
  }

  toJSON(): PeripheralSnapshot {
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      status: this.status,
      handlerAddress: this.handlerAddress,
      meta: {
        type: "potentiometer",
        maxResistance: this.maxResistance,
        currentResistance: this.currentResistance,
        normalizedValue: this.normalizedValue,
        debounceTicks: this.debounceTicks,
        registerAddress: this.registerAddress,
      },
    };
  }

  private normalizeResistance(resistance: number): number {
    if (this.maxResistance <= 0) return 0;
    return Math.round((resistance / this.maxResistance) * 255);
  }
}
