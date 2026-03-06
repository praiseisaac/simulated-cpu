# Step 1: Bare Visualizer Page

## Goal
Get a React Flow canvas rendering at `/visualizer` with zero custom logic — just confirm the library, routing, and Tailwind all work together.

## Prerequisite
```bash
npm install @xyflow/react
```

## File to Create
`app/visualizer/page.tsx`

## Requirements
- `"use client"` directive (React Flow needs client-side rendering)
- Full-viewport canvas (`h-screen w-screen`)
- React Flow `<ReactFlow>` with:
  - `<Background>` — dot grid
  - `<Controls>` — zoom in/out/fit
  - `<MiniMap>` — thumbnail navigator
- Two placeholder nodes so the canvas isn't empty:
  - A "CPU" node (plain default node) at position `{ x: 100, y: 100 }`
  - A "Memory" node (plain default node) at position `{ x: 400, y: 100 }`
- One edge connecting them (label: "data bus")
- Tailwind dark mode compatible (dark background for the wrapper)
- Import `@xyflow/react/dist/style.css` for React Flow's base styles

## Acceptance Criteria
- [ ] `npm run dev` starts without errors
- [ ] Visiting `http://localhost:3005/visualizer` shows the React Flow canvas
- [ ] Two default nodes ("CPU", "Memory") visible on the grid
- [ ] Edge connects them with "data bus" label
- [ ] Background grid, controls, and minimap all render
- [ ] No TypeScript errors

## Sketch
```
┌──────────────────────────────────────────────┐
│  [Controls]                      [MiniMap]   │
│                                              │
│      ┌───────┐   data bus   ┌──────────┐    │
│      │  CPU  │─────────────▶│  Memory  │    │
│      └───────┘              └──────────┘    │
│                                              │
│  · · · · · · · · · · · · · · · · · · · · ·  │
│  · · · · · · · · · · · · · · · · · · · · ·  │
└──────────────────────────────────────────────┘
```

## Notes
- These placeholder nodes will be replaced with custom nodes in Steps 3–4.
- No simulation logic here — this is purely a rendering smoke test.
