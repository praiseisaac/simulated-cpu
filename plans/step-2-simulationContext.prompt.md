# Step 2: Simulation Context (WebSocket)

## Goal
Create the data layer that runs the CPU simulation server-side and streams state updates to the browser via WebSocket. Split into two sub-steps:

### 2a — WebSocket Server + API Route
A standalone WebSocket server (`server/ws.ts`) that:
- Creates CPU + Memory instances
- Listens for client commands: `step`, `start`, `stop`, `reset`, `addProcess`, `setClockSpeed`
- Hooks into `cpu.onTick()` to broadcast `ClockEvent` JSON to all connected clients
- Runs alongside Next.js (separate process on port 3006)

**File:** `server/ws.ts`

**Dependencies:**
```bash
npm install ws
npm install -D @types/ws
```

**Run:** `npx tsx server/ws.ts` (add as `"ws"` script in package.json)

### 2b — SimulationProvider (client context)
A React context provider that:
- Connects to `ws://localhost:3006` on mount
- Exposes actions (`step`, `start`, `stop`, `reset`) that send JSON commands over the socket
- Stores latest `ClockEvent` in state, re-renders consumers on each message
- Provides `useSimulation()` hook for child components

**File:** `app/_modules/SimulationProvider.module.tsx`

---

## Provider & Hook Structure

### SimulationState
```ts
interface SimulationState {
  connected: boolean;                // WebSocket connection status
  running: boolean;                  // CPU is auto-ticking
  cycle: number;                     // current cycle count
  clockSpeed: number;                // ms per tick
  coreStates: CoreState[];           // one per core
  processQueue: ProcessState[];      // scheduler queue
  peripherals: PeripheralSnapshot[]; // registered peripherals
  interruptsFired: number;           // interrupts dispatched this tick
  pendingInterrupts: number;         // interrupts still queued
  memorySlice: number[];             // first 64 bytes
  recentAccesses: MemoryAccessEvent[]; // last 5 memory accesses
}
```

### SimulationActions
```ts
interface SimulationActions {
  start: () => void;
  stop: () => void;
  step: () => void;
  reset: () => void;
  addProcess: (name: string, programStart: number, programLength: number, priority?: number) => void;
  setClockSpeed: (ms: number) => void;
  triggerPeripheral: (id: string) => void;
}
```

### SimulationContext
```ts
type SimulationContextValue = SimulationState & SimulationActions;

const SimulationContext = createContext<SimulationContextValue | null>(null);
```

### useSimulation() hook
```ts
function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used within <SimulationProvider>");
  return ctx;
}
```

### SimulationProvider component
```tsx
function SimulationProvider({ children }: { children: React.ReactNode }) {
  // 1. useState for SimulationState (initial defaults)
  // 2. useRef for WebSocket instance
  // 3. useEffect → connect to ws://localhost:3006
  //    - onopen  → set connected: true
  //    - onclose → set connected: false, attempt reconnect
  //    - onmessage → parse JSON, update state
  //    - cleanup → close socket
  // 4. Action functions → ws.send(JSON.stringify({ type, ...payload }))
  // 5. Memoize context value
  // 6. Return <SimulationContext.Provider value={...}>{children}</SimulationContext.Provider>
}
```

### Usage in page.tsx
```tsx
export default function VisualizerPage() {
  return (
    <SimulationProvider>
      {/* ReactFlow canvas + child components call useSimulation() */}
    </SimulationProvider>
  );
}
```

---

## Acceptance Criteria
- [ ] `npx tsx server/ws.ts` starts a WS server on port 3006
- [ ] Browser connects and receives tick events when `start` is sent
- [ ] `step` command returns a single `ClockEvent`
- [ ] `stop` pauses the tick stream
- [ ] `reset` resets cycle to 0
- [ ] `useSimulation()` hook returns latest state + action functions
- [ ] No TypeScript errors

## Notes
- The WS server is a separate process so it can run the CPU in a true event loop without Next.js SSR constraints.
- In a future step, we can add a `"dev:all"` script using `concurrently` to start both Next.js and WS together.
