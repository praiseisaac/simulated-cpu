"use client";

/**
 * @module CPUNode
 *
 * React Flow custom node that renders the CPU — header, per-core panels
 * showing registers / PC / flags / pipeline stage, and an interrupt
 * activity banner.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/visualizer/_modules/SimulationProvider.module";
import type { CoreState } from "@/types/cpu.types";

// ─── Hex Helpers ────────────────────────────────────────────────────────────

/** Format a byte value as a 2-digit uppercase hex string. */
function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

/** Format a 16-bit value as a 4-digit uppercase hex string. */
function hex4(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

// ─── Pipeline Stage Badge ───────────────────────────────────────────────────

/** Tailwind colour classes for each pipeline stage. */
const STAGE_COLORS: Record<string, string> = {
  IDLE: "bg-zinc-200 text-zinc-600",
  FETCH: "bg-blue-100 text-blue-700",
  DECODE: "bg-yellow-100 text-yellow-700",
  EXECUTE: "bg-green-100 text-green-700",
};

/** Coloured badge displaying the current pipeline stage of a core. */
function StageBadge({ stage }: { stage: string }) {
  const colorClass = STAGE_COLORS[stage] ?? STAGE_COLORS.IDLE;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}
    >
      {stage}
    </span>
  );
}

// ─── Core Panel ─────────────────────────────────────────────────────────────

/** Detailed panel for a single CPU core (registers, PC, flags, PID). */
function CorePanel({ core }: { core: CoreState }) {
  const { registers, pc, pipelineStage, flags, assignedProcess, coreId, servicingInterrupt } = core;

  return (
    <div className={`border rounded-md p-2 flex-1 min-w-35 transition-colors duration-200 ${
      servicingInterrupt
        ? "border-orange-300 bg-orange-50/50"
        : "border-zinc-200"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-500">
          Core {coreId}
        </span>
        <div className="flex items-center gap-1">
          {servicingInterrupt && (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 animate-pulse">
              ISR
            </span>
          )}
          <StageBadge stage={pipelineStage} />
        </div>
      </div>

      <div className="font-mono text-[11px] text-zinc-700 space-y-0.5">
        <div>PC: 0x{hex4(pc)}</div>
        <div>
          R0:{hex2(registers.R0)} R1:{hex2(registers.R1)}
        </div>
        <div>
          R2:{hex2(registers.R2)} R3:{hex2(registers.R3)}
        </div>
        <div>PID: {assignedProcess ?? "—"}</div>
        <div className="text-zinc-400">
          Z:{flags.zero ? 1 : 0} C:{flags.carry ? 1 : 0} H:
          {flags.halted ? 1 : 0}
        </div>
      </div>
    </div>
  );
}

// ─── Status Dot ─────────────────────────────────────────────────────────────

/** Small coloured dot + label indicating CPU run status. */
function StatusDot({ running, coreStates }: { running: boolean; coreStates: CoreState[] }) {
  const allHalted = coreStates.length > 0 && coreStates.every((c) => c.flags.halted);

  let dotColor = "bg-zinc-400"; // idle / no cores
  let label = "Idle";

  if (running) {
    dotColor = "bg-green-500";
    label = "Running";
  } else if (allHalted) {
    dotColor = "bg-red-500";
    label = "Halted";
  } else if (coreStates.length > 0) {
    dotColor = "bg-zinc-400";
    label = "Stopped";
  }

  return (
    <span className="flex items-center gap-1 text-[11px] text-zinc-600">
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
}

// ─── CPU Node ───────────────────────────────────────────────────────────────

/** React Flow custom node rendering the CPU block. */
export function CPUNode(_props: NodeProps) {
  const { running, cycle, coreStates, interruptsFired, interruptSources, peripherals } = useSimulation();

  /** Resolve peripheral IDs to names for display. */
  const sourceNames = interruptSources.map((id) => {
    const p = peripherals.find((p) => p.id === id);
    return p?.name ?? id;
  });

  return (
    <div className="bg-white border border-zinc-300 rounded-xl shadow-md px-3 py-2.5 min-w-[320px]">
      {/* Target handle — top (receives interrupts from peripherals) */}
      <Handle
        type="target"
        position={Position.Top}
        className="bg-red-400! w-2.5! h-2.5!"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-800">CPU</span>
        <div className="flex items-center gap-3">
          <StatusDot running={running} coreStates={coreStates} />
          <span className="text-[11px] font-mono text-zinc-500">
            Cycle: {cycle}
          </span>
        </div>
      </div>

      {/* Interrupt activity banner */}
      {interruptsFired > 0 && (
        <div className="mb-2 px-2 py-1.5 rounded-md bg-red-50 border border-red-200 flex items-center gap-2 animate-pulse">
          <span className="text-red-500 text-xs font-bold">⚡ IRQ</span>
          <div className="flex flex-wrap gap-1">
            {sourceNames.map((name, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium"
              >
                {name}
              </span>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-red-400 font-mono">
            ×{interruptsFired}
          </span>
        </div>
      )}

      {/* Core panels */}
      <div className="flex gap-2">
        {coreStates.length > 0 ? (
          coreStates.map((core) => (
            <CorePanel key={core.coreId} core={core} />
          ))
        ) : (
          <div className="text-[11px] text-zinc-400 italic py-2">
            No core data — connect to WS server
          </div>
        )}
      </div>

      {/* Source handle — bottom (connects to Memory) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-blue-400! w-2.5! h-2.5!"
      />
    </div>
  );
}
