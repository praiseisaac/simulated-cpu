"use client";

/**
 * @module CoreTimeline
 *
 * Sliding-window timeline that visualises per-core activity over the last
 * {@link WINDOW_SIZE} cycles. Cells are colour-coded by state (idle, process,
 * halted, ISR) with peripheral-specific ISR colours. Includes a scheduler
 * queue view (round-robin or priority) below the grid.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useSimulation } from "@/app/visualizer/_modules/SimulationProvider.module";
import {
  getPeripheralColor,
  matchPeripheralByPC,
  type PeripheralColor,
} from "@/app/visualizer/_utils/peripheralColors";
import type { CoreState, ProcessState } from "@/types/cpu.types";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max number of cycles kept in the sliding window. */
const WINDOW_SIZE = 60;
/** Pixel size of each square cell. */
const CELL = 18;
/** Gap between cells. */
const GAP = 2;

// ─── Colour Helpers ─────────────────────────────────────────────────────────

/** Build a lookup: peripheralId → PeripheralColor from the ordered peripheral array. */
function buildColorLookup(peripherals: PeripheralSnapshot[]): Map<string, PeripheralColor> {
  const map = new Map<string, PeripheralColor>();
  peripherals.forEach((p, i) => map.set(p.id, getPeripheralColor(i)));
  return map;
}

/** Map a core snapshot to an inline background color (hex string). */
function cellHex(
  snap: CoreSnapshot,
  peripherals: PeripheralSnapshot[],
  colorLookup: Map<string, PeripheralColor>
): string | null {
  if (snap.halted) return null;       // use class for halted
  if (snap.servicing) {
    // Match PC to a peripheral ISR
    const pId = matchPeripheralByPC(snap.pc, peripherals);
    if (pId) {
      const c = colorLookup.get(pId);
      if (c) return c.hex;
    }
    return "#fb923c"; // fallback orange if can't match
  }
  return null; // idle or process — use class
}

/** Return a Tailwind class for the cell background (halted, process, idle). */
function cellClass(snap: CoreSnapshot): string {
  if (snap.halted) return "bg-zinc-300";
  if (snap.servicing) return "";       // color set via inline style
  if (snap.pid !== null) return "bg-zinc-400"; // process — neutral
  return "bg-zinc-100";               // idle
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

/** Minimal core state captured per cycle for the timeline grid. */
interface CoreSnapshot {
  coreId: number;
  pid: number | null;
  pc: number;
  stage: string;
  halted: boolean;
  servicing: boolean;
}

/** Extract a {@link CoreSnapshot} from a full {@link CoreState}. */
function snapCore(c: CoreState): CoreSnapshot {
  return {
    coreId: c.coreId,
    pid: c.assignedProcess,
    pc: c.pc,
    stage: c.pipelineStage,
    halted: c.flags.halted,
    servicing: c.servicingInterrupt,
  };
}

/** One column of the timeline: a cycle number + snapshot per core. */
interface CycleFrame {
  cycle: number;
  cores: CoreSnapshot[];
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

/** Build a tooltip string describing a cell’s state. */
function cellTitle(
  snap: CoreSnapshot,
  cycle: number,
  peripherals: PeripheralSnapshot[]
): string {
  const parts = [`Cycle ${cycle}`, `Core ${snap.coreId}`];
  if (snap.halted) {
    parts.push("HALTED");
  } else if (snap.servicing) {
    const pId = matchPeripheralByPC(snap.pc, peripherals);
    const pName = peripherals.find((p) => p.id === pId)?.name;
    parts.push(pName ? `ISR: ${pName}` : "ISR");
  } else if (snap.pid !== null) {
    parts.push(`PID ${snap.pid}`);
  } else {
    parts.push("Idle");
  }
  parts.push(snap.stage);
  return parts.join(" · ");
}

// ─── Component ──────────────────────────────────────────────────────────────

/** Scheduler type display labels. */
const SCHEDULER_LABELS: Record<string, string> = {
  ROUND_ROBIN: "Round Robin",
  PREEMPTIVE_PRIORITY: "Preemptive Priority",
  NON_PREEMPTIVE: "Non-Preemptive",
};

/** Static color palette for PIDs (wraps around). */
const PID_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#f472b6", // pink-400
  "#a78bfa", // violet-400
  "#fbbf24", // amber-400
  "#38bdf8", // sky-400
  "#fb923c", // orange-400
  "#4ade80", // green-400
];

/** Map a PID to a deterministic colour from the palette. */
function pidColor(pid: number): string {
  return PID_COLORS[(pid - 1) % PID_COLORS.length];
}

// ─── Round Robin Queue Sub-Component ────────────────────────────────────────

/**
 * Visual queue showing process order for round-robin scheduling.
 * Processes slide left as they execute — gives the "conveyor belt" feel.
 */
function RoundRobinQueue({ processQueue }: { processQueue: ProcessState[] }) {
  const running = processQueue.filter((p) => p.status === "RUNNING");
  const ready = processQueue.filter((p) => p.status === "READY");

  if (running.length === 0 && ready.length === 0) {
    return (
      <div className="text-[9px] text-zinc-400 italic">Queue empty</div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-200">
      {/* Running (head of queue, being serviced) */}
      {running.map((p) => (
        <div
          key={p.pid}
          className="shrink-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 border-2 border-dashed"
          style={{ borderColor: pidColor(p.pid), backgroundColor: pidColor(p.pid) + "22" }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: pidColor(p.pid) }}
          />
          <span className="text-[9px] font-bold text-zinc-700">
            P{p.pid}
          </span>
          <span className="text-[8px] text-zinc-400">
            C{p.assignedCore}
          </span>
          {p.quantumRemaining > 0 && (
            <span className="text-[8px] text-zinc-400">
              q{p.quantumRemaining}
            </span>
          )}
        </div>
      ))}

      {/* Separator arrow */}
      {running.length > 0 && ready.length > 0 && (
        <span className="text-[10px] text-zinc-300 mx-0.5">→</span>
      )}

      {/* Ready (queued up, waiting) */}
      {ready.map((p) => (
        <div
          key={p.pid}
          className="shrink-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-zinc-50 border border-zinc-200"
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: pidColor(p.pid) }}
          />
          <span className="text-[9px] font-medium text-zinc-600">
            P{p.pid}
          </span>
          <span className="text-[8px] text-zinc-400">
            pri:{p.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Priority Queue Sub-Component ───────────────────────────────────────────

/**
 * Shows process queue sorted by priority for preemptive / non-preemptive modes.
 */
function PriorityQueueView({
  processQueue,
  isPreemptive,
}: {
  processQueue: ProcessState[];
  isPreemptive: boolean;
}) {
  const running = processQueue.filter((p) => p.status === "RUNNING");
  const ready = processQueue.filter((p) => p.status === "READY");

  if (running.length === 0 && ready.length === 0) {
    return (
      <div className="text-[9px] text-zinc-400 italic">Queue empty</div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-200">
      {running.map((p) => (
        <div
          key={p.pid}
          className="shrink-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 border-2"
          style={{
            borderColor: pidColor(p.pid),
            backgroundColor: pidColor(p.pid) + "22",
            borderStyle: isPreemptive ? "solid" : "double",
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: pidColor(p.pid) }}
          />
          <span className="text-[9px] font-bold text-zinc-700">
            P{p.pid}
          </span>
          <span className="text-[8px] text-zinc-400">
            C{p.assignedCore} pri:{p.priority}
          </span>
        </div>
      ))}

      {running.length > 0 && ready.length > 0 && (
        <span className="text-[10px] text-zinc-300 mx-0.5">│</span>
      )}

      {ready.map((p) => (
        <div
          key={p.pid}
          className="shrink-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-zinc-50 border border-zinc-200"
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: pidColor(p.pid) }}
          />
          <span className="text-[9px] font-medium text-zinc-600">
            P{p.pid}
          </span>
          <span className="text-[8px] text-zinc-400">
            pri:{p.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Timeline Component ────────────────────────────────────────────────

/** Main timeline component with sliding window grid + scheduler queue. */
export function CoreTimeline() {
  const { coreStates, cycle, running, peripherals, schedulerType, processQueue } = useSimulation();
  const [frames, setFrames] = useState<CycleFrame[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCycle = useRef<number>(-1);

  // Build a stable color lookup whenever peripherals change
  const colorLookup = useMemo(() => buildColorLookup(peripherals), [peripherals]);

  // Push a new frame whenever the cycle changes
  useEffect(() => {
    if (cycle === prevCycle.current || coreStates.length === 0) return;
    prevCycle.current = cycle;

    setFrames((prev) => {
      const next = [
        ...prev,
        { cycle, cores: coreStates.map(snapCore) },
      ];
      // Trim to window size
      return next.length > WINDOW_SIZE ? next.slice(next.length - WINDOW_SIZE) : next;
    });
  }, [cycle, coreStates]);

  // Auto-scroll to the right on new frames
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [frames]);

  const coreCount = coreStates.length || (frames[0]?.cores.length ?? 0);

  if (coreCount === 0) {
    return (
      <div className="text-[10px] text-zinc-400 px-3 py-2">
        No core data yet
      </div>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur border border-zinc-200 rounded-lg shadow-sm px-3 py-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-700">Core Activity</span>
          <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">
            {SCHEDULER_LABELS[schedulerType] ?? schedulerType}
          </span>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono tabular-nums">
          {frames.length} cycles
        </span>
      </div>

      {/* Timeline grid */}
      <div className="flex gap-1.5">
        {/* Core labels */}
        <div className="flex flex-col shrink-0" style={{ gap: GAP }}>
          {Array.from({ length: coreCount }, (_, i) => (
            <div
              key={i}
              className="text-[9px] font-semibold text-zinc-500 flex items-center justify-end pr-1"
              style={{ height: CELL, lineHeight: `${CELL}px` }}
            >
              C{i}
            </div>
          ))}
        </div>

        {/* Scrollable sliding window */}
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-zinc-300"
          style={{ maxWidth: WINDOW_SIZE * (CELL + GAP) }}
        >
          <div
            className="flex"
            style={{ gap: GAP, width: frames.length * (CELL + GAP) }}
          >
            {frames.map((frame) => (
              <div
                key={frame.cycle}
                className="flex flex-col shrink-0"
                style={{ gap: GAP }}
              >
                {frame.cores.map((snap) => {
                  const hex = cellHex(snap, peripherals, colorLookup);
                  return (
                    <div
                      key={snap.coreId}
                      className={`rounded-sm transition-colors duration-150 ${cellClass(snap)}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        ...(hex ? { backgroundColor: hex } : {}),
                      }}
                      title={cellTitle(snap, frame.cycle, peripherals)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[9px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-100 border border-zinc-200" />
          Idle
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-400" />
          Process
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-300" />
          Halted
        </span>
        {peripherals.map((p, i) => {
          const c = getPeripheralColor(i);
          return (
            <span key={p.id} className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: c.hex }}
              />
              {p.name}
            </span>
          );
        })}
      </div>

      {/* Scheduler Queue View */}
      <div className="mt-2 pt-1.5 border-t border-zinc-100">
        <div className="text-[9px] font-semibold text-zinc-500 mb-1">
          {schedulerType === "ROUND_ROBIN" ? "Queue" : "Priority Queue"}
        </div>
        {schedulerType === "ROUND_ROBIN" ? (
          <RoundRobinQueue processQueue={processQueue} />
        ) : (
          <PriorityQueueView
            processQueue={processQueue}
            isPreemptive={schedulerType === "PREEMPTIVE_PRIORITY"}
          />
        )}
      </div>
    </div>
  );
}
