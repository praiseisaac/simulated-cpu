# Step 4: Memory Node

## Goal
Replace the placeholder "Memory" default node with a custom React Flow node that displays a hex grid of memory contents and highlights recent accesses.

## Dependencies
- Step 2 complete (SimulationProvider provides memory state)
- Step 3 complete (CPU node exists to connect to)

## File to Create
`app/visualizer/_components/MemoryNode.component.tsx`

## File to Update
`app/visualizer/page.tsx` — register the custom node type

## Data Consumed
The WebSocket server will need to include memory data in its broadcast. Extend the WS message to include:
```ts
{
  // existing ClockEvent fields...
  memorySlice: number[];          // first 64 bytes (addresses 0x00–0x3F)
  recentAccesses: MemoryAccessEvent[];  // last 5 accesses
}
```

Each `MemoryAccessEvent`:
```ts
{
  type: "read" | "write";
  address: number;
  value: number;
  timestamp: number;
}
```

## UI Layout (Tailwind)
```
┌─── Memory (1KB) ────────────────────────┐
│  ○ target handle (top, from CPU)         │
│                                          │
│       0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F │
│ 0x00: 01 00 00 10 03 00 01 00 FF 00 00 00 00 00 00 00 │
│ 0x10: 0A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 │
│ 0x20: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 │
│ 0x30: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 │
│                                          │
│  Recent: W 0x010=0A  R 0x000=01          │
└──────────────────────────────────────────┘
```

## Requirements
- Display first 64 bytes in a 4-row × 16-column hex grid
- Row labels on the left (`0x00:`, `0x10:`, `0x20:`, `0x30:`)
- Column headers (`0 1 2 ... F`)
- Use monospace font (`font-mono`)
- Highlight cells with recent **write** access in a red/orange tint
- Highlight cells with recent **read** access in a blue/cyan tint
- "Recent" footer shows last 3–5 accesses as `R/W addr=value`
- One **target** handle on top (receives edge from CPU)
- Cell values in uppercase hex, 2 digits each
- Non-zero values slightly bolder or different shade to stand out from zeros

## Acceptance Criteria
- [ ] Custom node renders at the Memory position on the canvas
- [ ] Hex grid shows correct byte values
- [ ] Read/write highlights appear on the correct cells after a tick
- [ ] Recent accesses list updates live
- [ ] Target handle connects to CPU source handle
- [ ] Monospace, clean alignment in the grid
- [ ] No TypeScript errors
