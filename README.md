# Simulated CPU

A fully interactive CPU simulation with a real-time visual frontend. Built to teach how a processor fetches, decodes, and executes instructions — complete with multi-core scheduling, interrupt handling, memory-mapped I/O, and pluggable peripheral devices.

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React Flow](https://img.shields.io/badge/React%20Flow-12-purple)

## What Is This?

This project simulates a simple computer from scratch. If you've ever wondered what happens when you press a button on a keyboard, how a CPU runs multiple programs at once, or how hardware devices talk to software — this simulator shows you all of it visually, in real time.

You'll see:
- A **CPU** fetching instructions from memory and executing them step by step
- A **scheduler** deciding which program gets to run next
- **Peripherals** (buttons, sensors, LEDs) sending signals to the CPU
- **Memory** being read and written as programs execute

## Key Concepts

If you're new to these topics, here's a quick primer on the core ideas this simulator demonstrates.

### What Is a CPU?

A CPU (Central Processing Unit) is the "brain" of a computer. It reads instructions from memory one at a time and executes them. Our simulated CPU is an **8-bit, dual-core processor** — meaning:

- **8-bit**: It works with numbers from 0 to 255
- **Dual-core**: It has two independent processing units that can run programs at the same time

### The Fetch-Decode-Execute Cycle

Every CPU follows this loop:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  FETCH   │────▶│  DECODE  │────▶│ EXECUTE  │
│          │     │          │     │          │
│ Read the │     │ Figure   │     │ Do the   │
│ next     │     │ out what │     │ actual   │
│ instruc- │     │ it means │     │ work     │
│ tion     │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘
     ▲                                 │
     └─────────────────────────────────┘
              (repeat forever)
```

1. **Fetch** — Read the next instruction's bytes from memory
2. **Decode** — Parse those bytes to figure out the operation (e.g., "add two registers")
3. **Execute** — Perform the operation (e.g., add R0 + R1, store result)

In this simulator, each stage takes one clock tick, so you can watch each step happen.

### Registers

Registers are tiny, fast storage slots inside the CPU. Our CPU has 4 registers:

| Register | Purpose |
|----------|---------|
| R0 | General purpose |
| R1 | General purpose |
| R2 | General purpose |
| R3 | General purpose |

Each holds a single byte (0–255). Programs use registers for calculations because accessing them is instant, unlike memory which takes a whole cycle to read.

### Instructions (ISA)

ISA stands for **Instruction Set Architecture** — the list of commands a CPU understands. Our CPU has 8 instructions:

| Opcode | Mnemonic | Example | What It Does |
|--------|----------|---------|-------------|
| `0x00` | `NOP` | `NOP` | Do nothing (no operation) |
| `0x01` | `LOAD` | `LOAD R0, 0x0038` | Copy a value from memory into a register |
| `0x02` | `STORE` | `STORE R0, 0x0038` | Copy a register's value into memory |
| `0x03` | `ADD` | `ADD R0, R1` | Add two registers (result goes in the first) |
| `0x04` | `SUB` | `SUB R0, R1` | Subtract second register from first |
| `0x05` | `JMP` | `JMP 0x0100` | Jump to a different address (change the program counter) |
| `0xFE` | `IRET` | `IRET` | Return from an interrupt handler |
| `0xFF` | `HALT` | `HALT` | Stop the program |

Each instruction is encoded as **4 bytes**:
```
[opcode] [operand1] [operand2_high] [operand2_low]
```

### Memory

Memory is where programs and data live. Our simulator has **1 KB (1024 bytes)** of memory, addressable from `0x000` to `0x3FF`.

- Programs are loaded into memory as sequences of bytes
- The CPU reads instructions from memory using the program counter
- Peripherals can read/write specific memory addresses (memory-mapped I/O)

### Interrupts

An interrupt is a signal from a peripheral device saying "I need attention!" When an interrupt fires:

1. The CPU **saves** the current program's state (registers, program counter)
2. The CPU **jumps** to a special routine called an ISR (Interrupt Service Routine)
3. The ISR handles the interrupt (e.g., reads a sensor value)
4. The ISR executes `IRET` to **restore** the saved state and resume the original program

This is how real computers handle keyboard presses, mouse clicks, network packets, and more — without the running program needing to constantly check for them.

### Process Scheduling

When multiple programs need to run but there are limited CPU cores, a **scheduler** decides who runs when. This simulator supports three strategies:

| Algorithm | How It Works |
|-----------|-------------|
| **Round Robin** | Each program gets a fixed time slice (4 cycles), then the next program takes over. Fair but not urgent. |
| **Preemptive Priority** | Important programs can interrupt less important ones mid-execution. Fast for high-priority tasks. |
| **Non-Preemptive** | A program runs until it finishes. Simple but can starve other programs. |

### Peripherals

Peripherals are hardware devices attached to the CPU — buttons, sensors, displays, LEDs. They communicate with the CPU in two ways:

- **Interrupts** — "Hey CPU, something happened!" (input devices like buttons)
- **Memory-mapped I/O** — The CPU reads/writes specific memory addresses that the peripheral monitors (output devices like screens)

See the [peripherals README](peripherals/README.md) for details on each device and how to create your own.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Next.js Frontend                 │
│   React Flow Canvas · Custom Nodes · Controls    │
│                                                   │
│   CPUNode · MemoryNode · PeripheralNodes         │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (port 3006)
┌──────────────────────▼──────────────────────────┐
│               WebSocket Server                    │
│         Command Router · State Broadcaster        │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Simulation Services                  │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │
│  │   CPU    │  │  Memory  │  │  Peripheral    │  │
│  │ 2 Cores │  │  1 KB    │  │  Manager       │  │
│  │ Scheduler│  │  8-bit   │  │  7 Devices     │  │
│  │ Interrupts│ │  Events  │  │  Interrupts    │  │
│  └─────────┘  └──────────┘  └────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │          Tick Sequence (each cycle)         │  │
│  │  1. Scheduler → 2. Peripherals →           │  │
│  │  3. Interrupts → 4. Core Execute           │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- **Node.js 20+** — [Download here](https://nodejs.org/). Check with `node --version`
- **npm** — Comes with Node.js. Check with `npm --version`

### Installation

```bash
# Clone the repository
git clone https://github.com/praiseisaac/simulated-cpu.git

# Navigate into the project
cd simulated-cpu

# Install dependencies
npm install
```

### Running the Simulator

Start both the simulation server and the visual frontend with one command:

```bash
npm run dev:all
```

This launches:
- **WebSocket server** on `ws://localhost:3006` (the simulation engine)
- **Next.js frontend** on `http://localhost:3005` (the visual interface)

Open [http://localhost:3005](http://localhost:3005) in your browser to see the simulator.

### Running Components Individually

```bash
# WebSocket server only (simulation backend)
npm run ws

# Next.js frontend only (requires the WS server to be running separately)
npm run dev
```

### Running Tests

Validate that each part of the simulator works correctly:

```bash
npm run test-cpu          # Test CPU fetch/decode/execute pipeline
npm run test-memory       # Test memory read/write/bounds
npm run test-interrupts   # Test interrupt priority queue
npm run test-peripherals  # Test peripheral tick/trigger behavior
npm run test-persistence  # Test save/load snapshots
```

## Using the Simulator

Once the simulator is running in your browser:

1. **Add a process** — Click the controls to load a program into memory and schedule it for execution
2. **Start the clock** — Click "Start" to begin the fetch-decode-execute cycle
3. **Watch the pipeline** — See each core's registers, flags, and pipeline stage update in real time
4. **Add peripherals** — Use the panel in the top-right to add buttons, sensors, LEDs, etc.
5. **Trigger devices** — Click on a button peripheral to fire an interrupt and watch the CPU handle it
6. **Step through** — Use "Step" to advance one tick at a time for detailed observation
7. **Adjust speed** — Use the clock speed slider to slow down or speed up the simulation
8. **Change scheduling** — Switch between Round Robin, Preemptive Priority, and Non-Preemptive to see how they behave differently

## Peripherals

The simulator comes with 7 built-in peripherals:

| Peripheral | Type | What It Does |
|-----------|------|-------------|
| **Button** | Input | One-shot interrupt on press |
| **Timer** | Input | Periodic interrupt every N ticks |
| **Sensor** | Input | Fires when a value crosses a threshold |
| **Proximity Sensor** | Input | Detects cursor distance, writes to memory |
| **Potentiometer** | Input | Analog slider, writes 0–255 to memory |
| **Screen** | Output | Scrolling waveform display from memory |
| **LED** | Output | On/off indicator from memory value |

### Creating Your Own Peripheral

Want to build a custom peripheral? See the **[Peripherals README](peripherals/README.md)** for a complete guide with:
- The interface your peripheral must implement
- A full starter template (Buzzer example)
- Step-by-step instructions for wiring it into the server and frontend
- Ideas for peripherals you could build

## Project Structure

```
simulated-cpu/
├── app/                    # Frontend (Next.js + React Flow)
│   ├── page.tsx            # Main canvas with CPU, Memory, Peripheral nodes
│   ├── _components/        # Visual components for each node type
│   └── _modules/           # WebSocket connection and shared state
├── services/               # Core simulation logic (pure TypeScript)
│   ├── cpu/                # CPU, Core, Scheduler, Interrupts, Decoder
│   ├── Memory.service.ts   # 1 KB main memory
│   └── PeripheralManager.service.ts
├── peripherals/            # Peripheral device implementations
├── types/                  # TypeScript type definitions
├── server/                 # WebSocket server (simulation ↔ frontend bridge)
│   └── ws.ts
└── scripts/                # Test scripts
```

Each directory has its own README with detailed documentation:

| Directory | README | What's Inside |
|-----------|--------|--------------|
| [`peripherals/`](peripherals/README.md) | Peripheral devices and how to create new ones | |
| [`services/`](services/README.md) | Core simulation services (CPU, Memory, Scheduler) | |
| [`types/`](types/README.md) | TypeScript type definitions | |
| [`app/`](app/README.md) | Frontend visualizer (React Flow canvas) | |
| [`server/`](server/README.md) | WebSocket server bridge | |
| [`scripts/`](scripts/README.md) | Test scripts | |

## Tech Stack

| Layer | Technology | What It Does |
|-------|-----------|-------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 | Web application framework and styling |
| Visualizer | @xyflow/react 12 (React Flow) | Interactive node-and-edge canvas |
| Backend | WebSocket server (ws library) | Real-time communication between simulation and browser |
| Language | TypeScript 5 | Type-safe JavaScript |
| Runner | tsx | Runs TypeScript files directly without a build step |

## Design Principles

- **Event-driven** — Components communicate through events and listeners, not direct calls
- **Tick-deterministic** — The entire system advances via a single clock: scheduler → peripherals → interrupts → cores
- **Separation of concerns** — Simulation logic is pure TypeScript with no framework dependencies; the frontend is a read-only view
- **Memory-mapped I/O** — Peripherals communicate via fixed memory addresses, just like real hardware

## License

MIT
