# Step 6: Peripheral Node

## Goal
Create a reusable custom React Flow node for peripherals. Each peripheral instance gets its own node on the canvas, showing its status and providing a trigger button for interactive peripherals.

## Dependencies
- Step 2 complete (WS server manages peripherals, provider streams state)

## File to Create
`app/visualizer/_components/PeripheralNode.component.tsx`

## File to Update
`app/visualizer/page.tsx` — register the node type; add peripheral nodes dynamically based on WS state

## Data Consumed (per peripheral, from WS broadcast)
```ts
PeripheralSnapshot {
  id: string;
  name: string;
  priority: number;
  status: "DISCONNECTED" | "CONNECTED" | "ACTIVE" | "IDLE";
  handlerAddress: number;
  meta: Record<string, unknown>;  // e.g. { interval: 5 } for Timer
}
```

## Node Props (via React Flow `data` field)
```ts
{
  peripheral: PeripheralSnapshot;
}
```

## UI Layout (Tailwind)
```
┌─── Button: "Power Button" ──────────────┐
│  Status: ● IDLE         Priority: 0     │
│  Handler: 0x0080                         │
│                                          │
│       [ Trigger ]    (only for Button)   │
│                                          │
│  ○ source handle (bottom → CPU)          │
└──────────────────────────────────────────┘
```

## Requirements
- Status badge with color coding:
  - `DISCONNECTED` → gray
  - `CONNECTED` → blue
  - `IDLE` → yellow/amber
  - `ACTIVE` → green (pulsing)
- "Trigger" button visible only for peripherals that are interactive (Button type)
  - Sends `{ type: "triggerPeripheral", id: "..." }` over WS
- Handler address shown in hex (`0x0080`)
- Priority displayed as a number
- Node border color matches status (subtle left border accent)
- One **source** handle on the bottom (connects to CPU interrupt line)
- Node title shows peripheral name
- Compact size — smaller than CPU/Memory nodes
- `meta` can display extra info (e.g. "Interval: 5 ticks" for Timer)

## Acceptance Criteria
- [ ] Peripheral nodes render for each registered peripheral
- [ ] Status badge updates in real-time
- [ ] Trigger button sends command over WS and peripheral fires
- [ ] ACTIVE status shows a visual pulse/glow
- [ ] Source handle present for edge connections
- [ ] Timer shows interval in meta section
- [ ] Sensor shows threshold/value in meta section
- [ ] No TypeScript errors
