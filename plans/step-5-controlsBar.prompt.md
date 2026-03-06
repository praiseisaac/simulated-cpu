# Step 5: Controls Bar

## Goal
Create a floating toolbar that lets the user control the simulation — start, stop, step, reset — and see the current clock speed. Connected to the WebSocket via `useSimulation()`.

## Dependencies
- Step 2 complete (SimulationProvider actions available)

## File to Create
`app/visualizer/_components/ControlsBar.component.tsx`

## File to Update
`app/visualizer/page.tsx` — render ControlsBar inside the ReactFlow wrapper (as a Panel or absolute-positioned overlay)

## Actions (sent over WebSocket)
| Button | Command sent | Description |
|--------|-------------|-------------|
| ▶ Start | `{ type: "start" }` | Begin auto-ticking |
| ⏸ Stop | `{ type: "stop" }` | Pause auto-ticking |
| ⏭ Step | `{ type: "step" }` | Advance one cycle |
| ↺ Reset | `{ type: "reset" }` | Reset CPU to cycle 0 |

## UI Layout (Tailwind)
```
┌──────────────────────────────────────────────┐
│  ▶ Start  │  ⏸ Stop  │  ⏭ Step  │  ↺ Reset  │
│                                              │
│  Cycle: 42          Speed: 1000ms/tick       │
│  Status: ● Running   Cores: 2               │
└──────────────────────────────────────────────┘
```

## Requirements
- Positioned as a **top-center panel** over the React Flow canvas
- Horizontal button row with icon + label
- Buttons are visually disabled when not applicable:
  - Start disabled when already running
  - Stop disabled when already stopped
  - Step disabled when running (only works when stopped)
- Bottom row shows stats: cycle count, clock speed, running status, core count
- Status dot: green when running, gray when stopped
- Clock speed display shows `ms/tick`
- Tailwind styling: `bg-white border border-zinc-200 rounded-xl shadow-lg px-4 py-3`
- Buttons: `px-3 py-1.5 rounded-lg text-sm font-medium` with hover/disabled states
- Uses `useSimulation()` hook for state and actions

## Acceptance Criteria
- [ ] Controls bar renders floating above the canvas
- [ ] Start button sends `start` command and simulation begins ticking
- [ ] Stop button pauses the simulation
- [ ] Step button advances exactly one cycle (only when stopped)
- [ ] Reset button resets cycle to 0
- [ ] Cycle counter updates live
- [ ] Correct button disabled states
- [ ] Clean, minimal styling
- [ ] No TypeScript errors
