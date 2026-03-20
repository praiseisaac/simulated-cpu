# Peripherals

Peripherals are hardware devices that connect to the CPU and interact with it through **interrupts** and **memory-mapped I/O**. Think of them like accessories plugged into a computer — a keyboard, a temperature sensor, or an LED light.

## How Peripherals Work

Every peripheral in this simulator follows a simple lifecycle:

```
DISCONNECTED ──▶ CONNECTED ──▶ ACTIVE / IDLE
     ▲                              │
     └──────────────────────────────┘
            (disconnect)
```

1. **Disconnected** — The device exists but isn't wired to the CPU
2. **Connected** — Wired to the CPU bus, ready to operate
3. **Active** — Currently generating an interrupt signal
4. **Idle** — Connected but not firing

Each CPU clock tick, the system calls `tick()` on every connected peripheral. If the peripheral needs the CPU's attention, it returns an **Interrupt** object. Otherwise, it returns `null`.

## Existing Peripherals

| File | Device | Type | What It Does |
|------|--------|------|-------------|
| `Button.peripheral.ts` | Push Button | Input | Press it (`trigger()`) to send a one-shot interrupt to the CPU |
| `Timer.peripheral.ts` | Timer | Input | Automatically fires an interrupt every N ticks |
| `Sensor.peripheral.ts` | Analog Sensor | Input | Fires when a value crosses a threshold (like a temperature alarm) |
| `ProximitySensor.peripheral.ts` | Proximity Sensor | Input | Detects cursor distance, writes to memory, fires while in range |
| `Potentiometer.peripheral.ts` | Potentiometer (Knob) | Input | Analog slider that writes a 0–255 value to a memory address |
| `Screen.peripheral.ts` | Display Screen | Output | Reads from memory and renders a scrolling waveform visualization |
| `LED.peripheral.ts` | LED Light | Output | Reads a memory byte and turns on (≥128) or off (<128) |

### Input vs Output Peripherals

- **Input peripherals** generate interrupts to get the CPU's attention (like pressing a key)
- **Output peripherals** read from memory each tick to display data (like a monitor) — they never fire interrupts

## The Peripheral Interface

Every peripheral must implement this interface (defined in `types/peripheral.types.ts`):

```typescript
interface Peripheral {
  id: string;              // Unique ID, e.g. "my-buzzer-1"
  name: string;            // Display name, e.g. "Buzzer"
  priority: number;        // Interrupt priority (0 = most urgent)
  status: PeripheralStatus; // DISCONNECTED, CONNECTED, ACTIVE, or IDLE

  connect(): void;         // Called when wired to the CPU
  disconnect(): void;      // Called when removed from the CPU
  tick(): Interrupt | null; // Called every CPU cycle — return an interrupt or null
  trigger(): void;         // Called on manual user interaction
  toJSON(): PeripheralSnapshot; // Serialize state for the UI
}
```

## Creating Your Own Peripheral

Follow these steps to build a custom peripheral from scratch.

### Step 1: Create the File

Create a new file in this directory following the naming convention:

```
peripherals/YourDevice.peripheral.ts
```

For example: `Buzzer.peripheral.ts`, `MotionDetector.peripheral.ts`, `Thermometer.peripheral.ts`

### Step 2: Write the Class

Here's a starter template. This example creates a **Buzzer** that beeps (fires an interrupt) every N ticks while it's turned on:

```typescript
import {
  PeripheralStatus,
  type Peripheral,
  type Interrupt,
  type PeripheralSnapshot,
} from "@/types/peripheral.types";

export class BuzzerPeripheral implements Peripheral {
  readonly id: string;
  readonly name: string;
  priority: number;
  status: PeripheralStatus;

  private handlerAddress: number;
  private interval: number;       // How many ticks between beeps
  private tickCount: number;      // Counts ticks since last beep
  private isOn: boolean;          // Whether the buzzer is active

  constructor(
    id: string,
    name: string,
    handlerAddress: number,
    interval: number = 8,
    priority: number = 2,
  ) {
    this.id = id;
    this.name = name;
    this.handlerAddress = handlerAddress;
    this.priority = priority;
    this.status = PeripheralStatus.DISCONNECTED;

    this.interval = interval;
    this.tickCount = 0;
    this.isOn = false;
  }

  connect(): void {
    if (this.status === PeripheralStatus.DISCONNECTED) {
      this.status = PeripheralStatus.IDLE;
    }
  }

  disconnect(): void {
    this.status = PeripheralStatus.DISCONNECTED;
    this.tickCount = 0;
    this.isOn = false;
  }

  trigger(): void {
    // Toggle the buzzer on/off when triggered manually
    if (this.status === PeripheralStatus.DISCONNECTED) return;
    this.isOn = !this.isOn;
    this.tickCount = 0;
  }

  tick(): Interrupt | null {
    if (this.status === PeripheralStatus.DISCONNECTED) return null;
    if (!this.isOn) {
      this.status = PeripheralStatus.IDLE;
      return null;
    }

    this.tickCount++;

    if (this.tickCount >= this.interval) {
      this.tickCount = 0;
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

  toJSON(): PeripheralSnapshot {
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      status: this.status,
      handlerAddress: this.handlerAddress,
      meta: {
        type: "buzzer",          // Used by the frontend to pick the right UI
        interval: this.interval,
        tickCount: this.tickCount,
        isOn: this.isOn,
      },
    };
  }
}
```

### Step 3: Register It in the WebSocket Server

Open `server/ws.ts` and make two changes:

**1. Import your peripheral at the top of the file:**

```typescript
import { BuzzerPeripheral } from "@/peripherals/Buzzer.peripheral";
```

**2. Add a case to the `createPeripheral()` function:**

```typescript
case "buzzer": {
  const interval = (msg.interval as number) ?? 8;
  return new BuzzerPeripheral(id, name, handlerAddress, interval, priority);
}
```

**3. (Optional) Add a data address for ISR counter tracking:**

In the `DATA_ADDRS` object, add an entry if you want the ISR to track a counter:

```typescript
const DATA_ADDRS: Record<string, number> = {
  timer:     0x003D,
  sensor:    0x003E,
  button:    0x003F,
  proximity: 0x0039,
  potentiometer: 0x003B,
  buzzer:    0x0037,  // Pick an unused address in the first 64 bytes
};
```

### Step 4: (Optional) Add a Frontend Node

If you want a custom visual for your peripheral in the visualizer:

1. Create `app/_components/BuzzerNode.component.tsx`
2. Register it as a node type in `app/page.tsx`
3. Add it to the `AddPeripheralPanel` component

For simple peripherals, the default `PeripheralNode` component works fine — it shows the name, status, and priority automatically.

### Step 5: Test It

You can test your peripheral manually:

```typescript
// In a test script or the Node.js REPL
import { BuzzerPeripheral } from "./peripherals/Buzzer.peripheral";

const buzzer = new BuzzerPeripheral("buzzer-1", "Test Buzzer", 0x0100, 8, 2);
buzzer.connect();
buzzer.trigger(); // Turn on

for (let i = 0; i < 20; i++) {
  const interrupt = buzzer.tick();
  if (interrupt) {
    console.log(`Tick ${i}: INTERRUPT fired!`);
  }
}
```

## Key Concepts for Your Peripheral

### Interrupts
When your `tick()` method returns an `Interrupt` object, the CPU will:
1. Save the current program's state (registers, program counter)
2. Jump to the `handlerAddress` to run the Interrupt Service Routine (ISR)
3. When the ISR executes `IRET`, restore the saved state and resume

### Memory-Mapped I/O
If your peripheral needs to share data with the CPU (not just signal "something happened"), you can read/write memory directly. Import `MemoryService` and accept it in your constructor:

```typescript
import type { MemoryService } from "@/services/Memory.service";

constructor(
  id: string,
  name: string,
  handlerAddress: number,
  memory: MemoryService,
  registerAddress: number = 0x0038,
) {
  // ...
  this.memory = memory;
  this.registerAddress = registerAddress;
}

tick(): Interrupt | null {
  // Write a value the CPU can read
  this.memory.write(this.registerAddress, someValue);
  // ...
}
```

### Priority
Lower numbers = higher urgency. If the CPU has to choose between two interrupts, it handles the lower-priority-number first:

| Priority | Use Case |
|----------|----------|
| 0 | Critical — user input, emergency stop |
| 1 | High — real-time sensors |
| 2 | Normal — timers, routine updates |
| 3 | Low — background monitoring |

## Peripheral Ideas

Need inspiration? Here are some peripherals you could build:

- **Buzzer** — Beeps at a configurable frequency
- **Motion Detector** — Fires when movement exceeds a threshold
- **Thermometer** — Writes temperature to memory, alerts on overheating
- **Keyboard** — Maps key presses to memory values
- **Seven-Segment Display** — Reads a digit from memory and displays it
- **Traffic Light** — Cycles through red/yellow/green states
- **Random Number Generator** — Writes random values to a memory register
- **Photoresistor** — Light level sensor that triggers in darkness
