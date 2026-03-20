# Types

TypeScript type definitions shared across the entire project. These files define the "shape" of data — what properties objects have, what values are valid, and what methods expect.

If you're new to TypeScript, think of types as blueprints. They don't contain any logic, but they tell the rest of the code what to expect.

## Files

### `cpu.types.ts`

Defines everything related to the CPU:

- **Opcode** — The 8 instructions the CPU understands (`NOP`, `LOAD`, `STORE`, `ADD`, `SUB`, `JMP`, `IRET`, `HALT`)
- **RegisterName** — The four registers (`R0`, `R1`, `R2`, `R3`)
- **Instruction** — A decoded instruction with its opcode, register operands, and address
- **PipelineStage** — The three stages of execution (`FETCH`, `DECODE`, `EXECUTE`, plus `IDLE`)
- **CoreState** — A snapshot of one core's registers, flags, and pipeline status
- **ProcessState** — A scheduled program with its saved registers, PC, and scheduling info
- **SchedulerType** — The three scheduling algorithms (`ROUND_ROBIN`, `PREEMPTIVE_PRIORITY`, `NON_PREEMPTIVE`)
- **ClockEvent** — The full state broadcast after each tick

### `memory.types.ts`

Defines memory structure:

- **MemoryCell** — A single byte at an address
- **MemoryDump** — A range of memory cells
- **MemoryAccessEvent** — A logged read or write (type, address, value, timestamp)
- Constants like `MEMORY_SIZE` (1024) and `WORD_SIZE` (8 bits)

### `peripheral.types.ts`

Defines the peripheral device contract:

- **PeripheralStatus** — Lifecycle states (`DISCONNECTED`, `CONNECTED`, `ACTIVE`, `IDLE`)
- **Interrupt** — An interrupt request with source, priority, handler address, and timestamp
- **Peripheral** — The interface every peripheral device must implement
- **PeripheralSnapshot** — Serializable representation for UI display and persistence

### `persistence.types.ts`

Defines save/load formats:

- **CoreSnapshot** — Saved state of a single core
- **SchedulerSnapshot** — Saved process table and scheduler configuration
- **SavedState** — Complete simulation snapshot (schema versioned)
