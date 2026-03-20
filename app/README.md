# App (Frontend)

The visual frontend built with [Next.js](https://nextjs.org/) and [React Flow](https://reactflow.dev/). This is what you see in the browser — an interactive canvas showing the CPU, memory, and peripherals as connected nodes.

## Structure

```
app/
├── page.tsx                # Main page — sets up the React Flow canvas with all nodes
├── layout.tsx              # Root HTML layout (fonts, metadata)
├── globals.css             # Global Tailwind CSS styles
├── _components/            # UI components (visual building blocks)
│   ├── CPUNode.component.tsx          # Shows both cores with registers, flags, pipeline stage
│   ├── MemoryNode.component.tsx       # Hex grid of the first 64 bytes of memory
│   ├── PeripheralNode.component.tsx   # Generic peripheral card (name, status, priority)
│   ├── ProximityNode.component.tsx    # Proximity sensor with radius display
│   ├── ScreenNode.component.tsx       # Pixel grid output display
│   ├── PotentiometerNode.component.tsx # Analog slider input
│   ├── LEDNode.component.tsx          # LED indicator light
│   ├── ControlsBar.component.tsx      # Start/Stop/Step/Reset buttons, clock speed, scheduler
│   ├── AddPeripheralPanel.component.tsx # Panel to add new peripherals
│   └── CoreTimeline.component.tsx     # Per-core pipeline and process queue details
└── _modules/
    └── SimulationProvider.module.tsx   # WebSocket connection and shared state
```

## How It Works

### Data Flow

```
WebSocket Server (port 3006)
        │
        ▼
SimulationProvider (connects, sends commands, receives state)
        │
        ▼
React Context (shared state available to all components)
        │
        ▼
React Flow Canvas (renders nodes and edges)
        │
        ├── CPUNode (cores, registers, flags)
        ├── MemoryNode (hex grid, access highlights)
        ├── PeripheralNodes (device-specific visuals)
        └── Animated Edges (data flow lines)
```

### SimulationProvider

The `SimulationProvider` is the brain of the frontend. It:

1. Opens a WebSocket connection to `ws://localhost:3006`
2. Receives state broadcasts (core states, memory, peripherals, interrupts)
3. Updates React state so all components re-render
4. Exposes action functions (start, stop, step, reset, addPeripheral, etc.)

All components access the simulation state through the `useSimulation()` hook.

### Node Types

React Flow renders the canvas as a graph of **nodes** (boxes) connected by **edges** (lines). Each node type has a custom React component:

| Node Type | Component | Description |
|-----------|-----------|-------------|
| `cpu` | `CPUNode` | Dual-core status display |
| `memory` | `MemoryNode` | Memory hex grid |
| `peripheral` | `PeripheralNode` | Generic device card |
| `proximity` | `ProximityNode` | Cursor-distance sensor |
| `screen` | `ScreenNode` | Scrolling waveform display |
| `potentiometer` | `PotentiometerNode` | Slider input |
| `led` | `LEDNode` | LED indicator |

### Naming Conventions

- `*.component.tsx` — Stateless UI components (receive props, render visuals)
- `*.module.tsx` — Stateful modules (manage state, side effects, context)
- Files prefixed with `_` directories are private to Next.js (not routed)
