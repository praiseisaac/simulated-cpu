# Scripts

Test scripts that validate individual services work correctly. Run them to check that the simulation logic is behaving as expected.

## Running Tests

```bash
npm run test-cpu          # CPU pipeline: fetch, decode, execute all 8 instructions
npm run test-memory       # Memory: read, write, bounds checking, bulk loads
npm run test-interrupts   # Interrupt controller: priority queue ordering
npm run test-peripherals  # Peripherals: tick/trigger behavior, interrupt generation
npm run test-persistence  # Persistence: save/load round-trips
```

Each script runs standalone with `tsx` (TypeScript execution) and prints results to the console.

## Files

| Script | What It Tests |
|--------|--------------|
| `test-cpu.ts` | Creates a CPU, loads a program, runs it through the pipeline, and verifies register/memory values after execution |
| `test-memory.ts` | Tests reading and writing bytes, out-of-bounds access errors, program loading, and memory dumps |
| `test-interrupts.ts` | Tests interrupt priority queue ordering — ensures higher-priority interrupts are dequeued first |
| `test-peripherals.ts` | Tests each peripheral type: button arm/fire, timer periodic firing, sensor threshold crossing |
| `test-persistence.ts` | Saves a CPU snapshot to JSON, loads it back, and verifies the state matches |
