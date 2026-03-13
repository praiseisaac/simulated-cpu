# Step 3: CPU Node

## Goal
Replace the placeholder "CPU" default node with a custom React Flow node that displays live CPU state from the `useSimulation()` hook.

## Dependencies
- Step 2 complete (SimulationProvider + WebSocket server running)

## File to Create
`app/_components/CPUNode.component.tsx`

## File to Update
`app/page.tsx` — register the custom node type and swap the placeholder

## Data Consumed (from `ClockEvent`)
```ts
{
  cycle: number;
  coreStates: CoreState[];  // array of 2 cores
  processQueue: ProcessState[];
}
```

Each `CoreState` contains:
```ts
{
  coreId: number;
  registers: { R0, R1, R2, R3 };
  pc: number;
  pipelineStage: "IDLE" | "FETCH" | "DECODE" | "EXECUTE";
  flags: { zero, carry, halted };
  assignedProcess: number | null;
}
```

## UI Layout (Tailwind)
```
┌─── CPU ──────────────────────────────────┐
│  Status: ● Running    Cycle: 42          │
│                                          │
│  ┌─ Core 0 ────────┐ ┌─ Core 1 ────────┐│
│  │ Stage: EXECUTE   │ │ Stage: IDLE     ││
│  │ PC: 0x0010       │ │ PC: 0x0000      ││
│  │ R0:05 R1:0A      │ │ R0:00 R1:00     ││
│  │ R2:00 R3:00      │ │ R2:00 R3:00     ││
│  │ PID: 1           │ │ PID: —          ││
│  │ Z:0 C:0 H:0      │ │ Z:0 C:0 H:0    ││
│  └──────────────────┘ └─────────────────┘│
│                                          │
│  ○ output handle (bottom, source)        │
└──────────────────────────────────────────┘
```

## Requirements
- `NodeProps` typed with custom data (not `any`)
- Green dot for running, red for stopped, gray for idle
- Pipeline stage shown as a colored badge:
  - IDLE → gray
  - FETCH → blue
  - DECODE → yellow
  - EXECUTE → green
- Registers displayed in hex (2 digits, e.g. `0A`)
- PC displayed in hex (4 digits, e.g. `0010`)
- One **source** handle on the bottom (connects to Memory)
- One **target** handle on the top (receives interrupt edges from peripherals)
- Consumes state from `useSimulation()` — no props for data, only React Flow `NodeProps`

## Acceptance Criteria
- [ ] Custom node renders in the canvas at the CPU position
- [ ] Core panels update on each tick
- [ ] Pipeline stage badges change color correctly
- [ ] Registers and PC show hex values
- [ ] Running/stopped indicator is accurate
- [ ] Handles are visible for edge connections
- [ ] No TypeScript errors
