# Step 7: Canvas Wiring

## Goal
Compose all custom nodes and edges into the final canvas layout. Connect CPU ↔ Memory with a data bus edge, peripherals → CPU with interrupt line edges. Add animated edges when data flows.

## Dependencies
- Steps 3–6 complete (all custom nodes exist)

## File to Update
`app/visualizer/page.tsx` — major rewrite to wire everything together

## Node Layout
```
         [Peripheral 1]    [Peripheral 2]    [Peripheral 3]
              │                  │                  │
              │ interrupt        │ interrupt        │ interrupt
              ▼                  ▼                  ▼
         ┌─────────────────────────────────────────────┐
         │                    CPU                      │
         └─────────────────────┬───────────────────────┘
                               │
                          data bus
                               │
                               ▼
                        ┌─────────────┐
                        │   Memory    │
                        └─────────────┘

                     [ Controls Bar (top panel) ]
```

## Edge Types
| Edge | Source → Target | Label | Style |
|------|----------------|-------|-------|
| Data bus | CPU (bottom) → Memory (top) | "data bus" | Thick, solid, bi-directional arrows |
| Interrupt line | Peripheral (bottom) → CPU (top) | "IRQ" | Dashed, thinner |

## Animated Edges
- When `interruptsFired > 0` in the current tick, animate the interrupt edge(s) from the firing peripheral(s) briefly (CSS pulse or React Flow `animated` prop)
- When a memory read/write occurs, animate the data bus edge

## Requirements
- Node positions auto-calculated based on number of peripherals (spread evenly across the top row)
- CPU centered below peripherals, Memory centered below CPU
- Use `useNodesState` + `useEdgesState` for dynamic updates
- Edge styles defined with Tailwind-compatible colors:
  - Data bus: `stroke: #3b82f6` (blue-500)
  - Interrupt: `stroke: #ef4444` (red-500)
- `animated: true` on edges during active data flow, `false` when idle
- `fitView` on initial load to center everything
- Edges should use `smoothstep` type for clean routing

## Dynamic Node Management
- On WS message, if new peripherals appear → add nodes
- If peripherals are removed → remove nodes + edges
- CPU and Memory nodes are always present

## Acceptance Criteria
- [ ] All nodes render in correct positions
- [ ] Data bus edge connects CPU to Memory
- [ ] Interrupt edges connect each peripheral to CPU
- [ ] Edge animations activate during active ticks
- [ ] Adding/removing peripherals updates nodes and edges dynamically
- [ ] Layout auto-adjusts for peripheral count
- [ ] `fitView` centers the graph on load
- [ ] Clean, readable canvas with no overlapping nodes
- [ ] No TypeScript errors
