/**
 * @module LEDPeripheral
 *
 * Output peripheral that samples a memory-mapped byte each tick and maps it
 * to LOW/HIGH current states.
 *
 * This peripheral never emits interrupts.
 */

import {
  PeripheralStatus,
  type Peripheral,
  type Interrupt,
  type PeripheralSnapshot,
} from "@/types/peripheral.types";
import type { MemoryService } from "@/services/Memory.service";

export class LEDPeripheral implements Peripheral {
  readonly id: string;
  readonly name: string;
  priority: number;
  status: PeripheralStatus;

  private handlerAddress: number;
  private readonly memory: MemoryService;
  private sourceAddress: number;
  private color: string;
  private outputEntry: number;
  private level: "LOW" | "HIGH";
  private currentMa: number;
  private brightness: number;

  constructor(
    id: string,
    name: string,
    handlerAddress: number = 0,
    color: string = "#ef4444",
    memory: MemoryService,
    sourceAddress: number = 0x003A,
    initialLevel: "LOW" | "HIGH" = "LOW",
  ) {
    this.id = id;
    this.name = name;
    this.handlerAddress = handlerAddress;
    this.priority = 0;
    this.status = PeripheralStatus.DISCONNECTED;

    this.color = color;
    this.memory = memory;
    this.sourceAddress = sourceAddress;
    this.outputEntry = 0;
    this.level = initialLevel;
    this.currentMa = initialLevel === "HIGH" ? 18 : 0;
    this.brightness = initialLevel === "HIGH" ? 255 : 0;
  }

  connect(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) {
      this.status = PeripheralStatus.IDLE;
    }
  }

  disconnect(): void {
    this.status = PeripheralStatus.DISCONNECTED;
  }

  setSourceAddress(address: number): void {
    this.sourceAddress = address;
  }

  getBrightness(): number {
    return this.brightness;
  }

  getCurrentMa(): number {
    return this.currentMa;
  }

  trigger(): void {
    // Manual trigger emulates a HIGH digital output pulse.
    this.outputEntry = 0xff;
    this.level = "HIGH";
    this.currentMa = 18;
    this.brightness = 255;
  }

  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;

    this.status = PeripheralStatus.ACTIVE;
    this.outputEntry = this.memory.read(this.sourceAddress);

    const isHigh = this.outputEntry >= 128;
    this.level = isHigh ? "HIGH" : "LOW";
    this.currentMa = isHigh ? 18 : 0;
    this.brightness = isHigh ? 255 : 0;

    this.status = PeripheralStatus.IDLE;

    return null;
  }

  toJSON(): PeripheralSnapshot {
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      status: this.status,
      handlerAddress: this.handlerAddress,
      meta: {
        type: "led",
        color: this.color,
        outputEntry: this.outputEntry,
        level: this.level,
        currentMa: this.currentMa,
        brightness: this.brightness,
        sourceAddress: this.sourceAddress,
      },
    };
  }
}
