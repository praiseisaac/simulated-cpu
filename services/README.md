# Services

This directory contains the core simulation logic — the "backend" of the CPU simulator. Everything here is pure TypeScript with no framework dependencies, so it can run in Node.js, a browser, or any JavaScript runtime.

## Overview

```
services/
├── cpu/
│   ├── CPU.service.ts              # Main CPU orchestrator (ties everything together)
│   ├── Core.service.ts             # A single CPU core (registers, pipeline, execution)
│   ├── Scheduler.service.ts        # Process scheduling (round-robin, priority, etc.)
│   ├── InterruptController.service.ts  # Priority queue for interrupt requests
│   └── InstructionDecoder.service.ts   # Decodes raw bytes into instructions
├── Memory.service.ts               # 1 KB main memory
├── PeripheralManager.service.ts    # Registry for peripheral devices
└── Persistence.service.ts          # Save/load simulation snapshots
```

## How They Fit Together

On every clock tick, this is what happens in order:

```
1. Scheduler.tick()         →  Decide which process runs on which core
2. PeripheralManager.tickAll()  →  Check all peripherals for interrupts
3. InterruptController      →  Dispatch interrupts to available cores
4. Core.tick() × 2          →  Each core runs one pipeline cycle (FETCH → DECODE → EXECUTE)
```

The **CPU service** orchestrates this sequence. The **WebSocket server** (`server/ws.ts`) calls CPU methods in response to user commands and broadcasts the resulting state to the frontend.

## The CPU (`cpu/`)

### CPU.service.ts — The Orchestrator

The main entry point. It owns:
- 2 `Core` instances
- 1 `Scheduler`
- 1 `InterruptController`
- Access to `Memory` and `PeripheralManager`

Key methods:
- `start()` / `stop()` — Start or stop the clock
- `step()` — Advance one cycle manually
- `addProcess()` — Add a program to the scheduler queue
- `registerPeripheral()` — Add a hardware device
- `onTick(listener)` — Subscribe to clock events

### Core.service.ts — A Single CPU Core

Each core has:
- **4 registers** (R0–R3), each holding an 8-bit value (0–255)
- **Program counter (PC)** — points to the next instruction in memory
- **Status flags** — Zero (last result was 0), Carry (overflow), Halted (stopped)
- **3-stage pipeline** — FETCH → DECODE → EXECUTE, one stage per tick

The 8 instructions this CPU understands:

| Opcode | Mnemonic | What It Does |
|--------|----------|-------------|
| 0x00 | `NOP` | Do nothing |
| 0x01 | `LOAD Rn, addr` | Load value from memory address into register |
| 0x02 | `STORE Rn, addr` | Store register value to memory address |
| 0x03 | `ADD Rn, Rm` | Add two registers, store result in first |
| 0x04 | `SUB Rn, Rm` | Subtract second from first register |
| 0x05 | `JMP addr` | Jump to a memory address (set PC) |
| 0xFE | `IRET` | Return from interrupt (restore saved state) |
| 0xFF | `HALT` | Stop execution |

### Scheduler.service.ts — Process Scheduling

Manages which programs run on which cores. Supports three algorithms:

- **Round Robin** — Each process gets 4 clock cycles, then rotates to the next
- **Preemptive Priority** — Higher-priority processes can interrupt lower-priority ones mid-execution
- **Non-Preemptive** — A process runs until it finishes; new processes wait

### InterruptController.service.ts — Interrupt Queue

A priority queue for interrupt requests from peripherals. Lower priority number = handled first. When two interrupts have the same priority, the earlier one wins (FIFO).

### InstructionDecoder.service.ts — Decoding Instructions

Converts raw bytes from memory into structured `Instruction` objects. Also provides `disassemble()` to produce human-readable output like `"LOAD R0, 0x0038"`.

## Memory.service.ts

Simulates 1 KB (1024 bytes) of main memory. Features:

- **Byte-addressable** — Every address holds one byte (0–255)
- **Bounds-checked** — Reading/writing outside 0x000–0x3FF throws an error
- **Event-driven** — Fires `"read"` and `"write"` events for UI highlighting
- **Access log** — Tracks the last 256 accesses (circular buffer)
- `loadProgram(address, bytes)` — Load an array of bytes into memory starting at an address

## PeripheralManager.service.ts

Registry and lifecycle manager for all peripheral devices. Handles:
- Registering and unregistering peripherals
- Connecting and disconnecting them
- Ticking all connected peripherals and collecting their interrupts
- Broadcasting events when peripherals change state

## Persistence.service.ts

Save and restore the entire simulation state to/from JSON files. Used for snapshots so you can pause, save, and resume later.
