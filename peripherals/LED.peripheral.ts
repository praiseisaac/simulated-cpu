/**
 * @module LEDPeripheral
 *
 * Output peripheral that samples a memory-mapped byte each tick and maps it
 * to LOW/HIGH current states, then computes perceptual brightness from the
 * flowing current.
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

  /** Memory values >= threshold are treated as HIGH output state. */
  private outputThreshold: number;
  /** Simulated LED current in mA for LOW/HIGH digital output states. */
  private lowCurrentMa: number;
  private highCurrentMa: number;
  /** Current at which LED is considered full-brightness. */
  private maxCurrentMa: number;
  /** Gamma for perceptual brightness response. */
  private gamma: number;

  private currentMa: number;
  private brightness: number;

  constructor(
    id: string,
    name: string,
    handlerAddress: number = 0,
    color: string = "#ef4444",
    memory: MemoryService,
    sourceAddress: number = 0x003A,
    outputThreshold: number = 128,
    lowCurrentMa: number = 1,
    highCurrentMa: number = 18,
    maxCurrentMa: number = 20,
    gamma: number = 1.2,
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
    this.outputThreshold = this.clampByte(outputThreshold);
    this.lowCurrentMa = Math.max(0, lowCurrentMa);
    this.highCurrentMa = Math.max(this.lowCurrentMa, highCurrentMa);
    this.maxCurrentMa = Math.max(0.001, maxCurrentMa);
    this.gamma = Math.max(0.1, gamma);
    this.currentMa = 0;
    this.brightness = 0;
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

  setOutputThreshold(value: number): void {
    this.outputThreshold = this.clampByte(value);
  }

  setCurrentProfile(lowCurrentMa: number, highCurrentMa: number): void {
    this.lowCurrentMa = Math.max(0, lowCurrentMa);
    this.highCurrentMa = Math.max(this.lowCurrentMa, highCurrentMa);
  }

  setMaxCurrent(maxCurrentMa: number): void {
    this.maxCurrentMa = Math.max(0.001, maxCurrentMa);
  }

  setGamma(gamma: number): void {
    this.gamma = Math.max(0.1, gamma);
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
    this.currentMa = this.highCurrentMa;
    this.brightness = this.currentToBrightness(this.currentMa);
  }

  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;

    this.status = PeripheralStatus.ACTIVE;
    this.outputEntry = this.memory.read(this.sourceAddress);

    const isHigh = this.outputEntry >= this.outputThreshold;
    this.currentMa = isHigh ? this.highCurrentMa : this.lowCurrentMa;
    this.brightness = this.currentToBrightness(this.currentMa);

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
        outputThreshold: this.outputThreshold,
        lowCurrentMa: this.lowCurrentMa,
        highCurrentMa: this.highCurrentMa,
        maxCurrentMa: this.maxCurrentMa,
        gamma: this.gamma,
        currentMa: this.currentMa,
        brightness: this.brightness,
        sourceAddress: this.sourceAddress,
      },
    };
  }

  private clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  private currentToBrightness(currentMa: number): number {
    const normalized = Math.max(0, Math.min(1, currentMa / this.maxCurrentMa));
    const perceptual = Math.pow(normalized, this.gamma);
    return Math.round(perceptual * 255);
  }
}
