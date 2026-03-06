# Simulated CPU

A fully interactive CPU simulation with a real-time visual frontend. Built to demonstrate how a processor fetches, decodes, and executes instructions — complete with multi-core scheduling, interrupt handling, memory-mapped I/O, and pluggable peripherals.

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React Flow](https://img.shields.io/badge/React%20Flow-12-purple)

## Overview

The simulation models a **dual-core 8-bit CPU** with a configurable clock speed, 1 KB of byte-addressable memory, and a set of peripherals that communicate via interrupts and memory-mapped registers. A WebSocket server bridges the backend simulation to a React Flow-based visual canvas, where you can watch data flow between the CPU, memory, and peripherals in real time.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Next.js Frontend                │
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
│  │ Scheduler│  │  8-bit   │  │  5 Devices     │  │
│  │ Interrupts│ │  Events  │  │  Interrupts    │  │
│  └─────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Features

### CPU
- **Dual-core** processor with independent register sets (R0–R3), program counters, and status flags (Zero, Carry, Halted)
- **3-stage pipeline**: FETCH → DECODE → EXECUTE per tick
- **8-instruction ISA**: `NOP`, `LOAD`, `STORE`, `ADD`, `SUB`, `JMP`, `IRET`, `HALT`
- Configurable clock speed (default 1000ms per cycle)

### Scheduling
Three scheduling algorithms, switchable at runtime:

| Algorithm | Behaviour |
|-----------|-----------|
| **Round Robin** | Fixed quantum (4 cycles), FIFO rotation |
| **Preemptive Priority** | Lower number = higher urgency, preempts running processes |
| **Non-Preemptive** | Run-to-completion, only idle cores pick up new work |

### Memory
- **1024 bytes** (1 KB), byte-addressable
- Event-driven access logging for UI highlighting
- Memory-mapped I/O regions for peripheral registers
- Program loading at arbitrary addresses

### Interrupts
- Priority queue sorted by urgency (lower = more urgent), ties broken by timestamp
- Interrupt context saved/restored via per-core interrupt stacks
- ISR routines auto-generated when peripherals are registered

### Peripherals

| Peripheral | Trigger | Priority | Behaviour |
|-----------|---------|----------|-----------|
| **Button** | Manual press | 0 (highest) | Edge-triggered — fires once per press |
| **Proximity Sensor** | Cursor distance | 1 | Level-triggered — fires while cursor is within radius; writes distance to memory |
| **Timer** | Periodic | 2 | Fires every N ticks while connected |
| **Sensor** | Threshold | 3 | Rising-edge — fires when value crosses threshold |
| **Screen** | N/A | N/A | Output-only — reads from memory-mapped address, renders scrolling bar display |

### Visualizer
- **React Flow** canvas with custom nodes for CPU, Memory, and all peripherals
- Animated edges show data flowing between nodes in real time
- Per-core detail panels: registers, flags, pipeline stage, ISR indicators
- Interrupt activity banners with source identification
- Drag-and-drop peripheral addition
- Controls for start/stop/step/reset, clock speed, and scheduler selection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Visualizer | @xyflow/react 12 (React Flow) |
| Backend | WebSocket server (ws library) |
| Language | TypeScript 5, tsx runner |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
git clone https://github.com/praiseisaac/simulated-cpu.git
cd simulated-cpu
npm install
```

### Running

Start both the WebSocket server and Next.js frontend:

```bash
npm run dev:all
```

This runs:
- **WebSocket server** on `ws://localhost:3006`
- **Next.js frontend** on `http://localhost:3005`

Open [http://localhost:3005/visualizer](http://localhost:3005/visualizer) to see the simulation canvas.

### Running Individually

```bash
# WebSocket server only
npm run ws

# Next.js frontend only
npm run dev
```

### Test Scripts

Validate individual services using the test scripts:

```bash
npm run test-cpu          # CPU fetch/decode/execute
npm run test-memory       # Memory read/write/bounds
npm run test-interrupts   # Interrupt priority queue
npm run test-peripherals  # Peripheral tick/trigger
npm run test-persistence  # Save/load state
```

## WebSocket Protocol

The frontend communicates with the simulation via JSON messages over WebSocket.

### Commands (Client → Server)

| Command | Description |
|---------|-------------|
| `start` | Begin the simulation clock |
| `stop` | Pause the simulation |
| `step` | Execute a single tick |
| `reset` | Reset all state |
| `addProcess` | Add a process to the scheduler queue |
| `loadProgram` | Load program bytes into memory |
| `registerPeripheral` | Add a new peripheral device |
| `removePeripheral` | Remove a peripheral |
| `triggerPeripheral` | Manually trigger a peripheral (e.g., button press) |
| `setClockSpeed` | Change the tick interval |
| `setSchedulerType` | Switch scheduling algorithm |

### Broadcasts (Server → All Clients)

Each tick broadcasts a full state snapshot including: core states, process queue, peripheral snapshots, interrupt activity, and a memory slice.

## Project Structure

```
├── app/
│   └── visualizer/
│       ├── page.tsx                 # React Flow canvas
│       ├── _components/             # UI components (nodes, controls, panels)
│       └── _modules/               # Stateful modules (SimulationProvider)
├── services/
│   ├── cpu/
│   │   ├── CPU.service.ts           # Main CPU orchestrator
│   │   ├── Core.service.ts          # Individual core (registers, pipeline)
│   │   ├── InstructionDecoder.service.ts
│   │   ├── InterruptController.service.ts
│   │   └── Scheduler.service.ts     # Process scheduling algorithms
│   ├── Memory.service.ts            # 1KB memory with events
│   ├── PeripheralManager.service.ts # Device registry & lifecycle
│   └── Persistence.service.ts       # Save/load simulation state
├── peripherals/                     # Peripheral device implementations
├── types/                           # TypeScript type definitions
├── server/
│   └── ws.ts                        # WebSocket server bridge
└── scripts/                         # Test scripts for services
```

## Design Principles

- **Event-driven** — Memory, CPU, Scheduler, and PeripheralManager use pub/sub listeners, decoupling the WS broadcast layer from domain logic
- **Tick-deterministic** — The entire system advances via a single clock: scheduler → peripherals → interrupts → cores
- **Separation of concerns** — Services are pure TypeScript with no framework dependencies; the frontend is a read-only view with action dispatch
- **Full state serialization** — Every service implements `toJSON()` and `restoreFromSnapshot()` for persistence
- **Memory-mapped I/O** — Peripherals read/write fixed memory addresses, mimicking real hardware register-mapped devices

## License

MIT
