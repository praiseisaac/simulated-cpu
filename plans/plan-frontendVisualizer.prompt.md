# Frontend Visualizer — Incremental Build Plan

## Prerequisites
- [ ] Install `@xyflow/react`
- [x] Tailwind CSS v4 (already configured via `@tailwindcss/postcss`)

---

## Step 1: Bare Visualizer Page
Create `app/visualizer/page.tsx` with a plain React Flow canvas (no custom nodes). Just renders an empty flow with background grid and controls. Confirms routing + React Flow work.

## Step 2: Simulation Context
Create `app/visualizer/_modules/SimulationProvider.module.tsx`. Wraps CPU + Memory instances in React context. Exposes `step()`, `start()`, `stop()`, `reset()`, and reactive state pushed via WebSockets (no polling). No UI — just the data layer.

Also set up a lightweight WebSocket server (e.g. Next.js custom server or a small standalone WS server) that the CPU `onTick` listener publishes state updates to. The provider connects on mount and streams updates to consumers.

## Step 3: CPU Node
Create `app/visualizer/_components/CPUNode.component.tsx`. A single custom React Flow node that displays:
- Running/stopped status
- Current cycle count
- Core states (PC, registers, pipeline stage)

Wire it into the canvas as a static node.

## Step 4: Memory Node
Create `app/visualizer/_components/MemoryNode.component.tsx`. Custom node showing:
- A small hex grid (first 64 bytes)
- Recent access highlights

Wire it into the canvas alongside CPU node.

## Step 5: Controls Bar
Create `app/visualizer/_components/ControlsBar.component.tsx`. Floating toolbar with:
- Step / Start / Stop / Reset buttons
- Clock speed display

Connect to SimulationProvider actions.

## Step 6: Peripheral Node
Create `app/visualizer/_components/PeripheralNode.component.tsx`. Generic custom node for peripherals:
- Shows name, type, status badge
- Trigger button for interactive peripherals (Button)

## Step 7: Canvas Wiring
Update `app/visualizer/page.tsx` to compose all nodes with edges:
- CPU ↔ Memory edge (data bus)
- Peripheral → CPU edge (interrupt line)
- Animated edges on active data flow

---

## Future (Phase 3+)
- Drag-and-drop sidebar to add peripherals
- Pipeline animation inside CPU node
- Memory hex-dump detail modal
- Process queue visualization
- Save/load snapshot UI
