"use client";

/**
 * @module MemoryNode
 *
 * React Flow custom node that renders the first 64 bytes of memory as
 * a hex grid, highlights recent accesses, and shows peripheral data counters.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/_modules/SimulationProvider.module";
import type { MemoryAccessEvent } from "@/types/memory.types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format a byte as a 2-digit uppercase hex string. */
function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

/** Format a 12-bit address as a 3-digit uppercase hex string. */
function hex3(value: number): string {
  return value.toString(16).toUpperCase().padStart(3, "0");
}

/** Column header labels "0"–"F" for the hex grid. */
const COL_HEADERS = Array.from({ length: 16 }, (_, i) =>
  i.toString(16).toUpperCase()
);

// ─── Cell Highlight Logic ───────────────────────────────────────────────────

/**
 * Return a Tailwind highlight class for a memory cell based on recent
 * read/write accesses (blue for reads, red for writes).
 */
function getCellHighlight(
  address: number,
  recentAccesses: MemoryAccessEvent[]
): string {
  // Check most recent first — last write/read wins
  for (let i = recentAccesses.length - 1; i >= 0; i--) {
    const access = recentAccesses[i];
    if (access.address === address) {
      return access.type === "write"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-700";
    }
  }
  return "";
}

// ─── Access Badge ───────────────────────────────────────────────────────────

/** Inline badge showing a single recent memory access (Read/Write + address + value). */
function AccessBadge({ access }: { access: MemoryAccessEvent }) {
  const isWrite = access.type === "write";
  const color = isWrite ? "text-red-600" : "text-blue-600";
  const prefix = isWrite ? "W" : "R";

  return (
    <span className={`${color} text-[10px]`}>
      {prefix} 0x{hex3(access.address)}={hex2(access.value)}
    </span>
  );
}

// ─── Peripheral Data Counters ───────────────────────────────────────────────

/** Well-known data addresses used by auto-loaded ISRs. */
const DATA_LABELS: { addr: number; label: string; color: string }[] = [
  { addr: 0x3C, label: "const(1)", color: "text-zinc-400" },
  { addr: 0x3D, label: "Timer",    color: "text-blue-600" },
  { addr: 0x3E, label: "Sensor",   color: "text-amber-600" },
  { addr: 0x3F, label: "Button",   color: "text-indigo-600" },
];

/** Displays ISR data counters when any well-known address is non-zero. */
function DataCounters({ memorySlice }: { memorySlice: number[] }) {
  // Only show if there's any non-zero value in the data region
  const hasData = DATA_LABELS.some(({ addr }) => (memorySlice[addr] ?? 0) !== 0);
  if (!hasData) return null;

  return (
    <div className="mt-2 pt-1.5 border-t border-zinc-100">
      <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mb-1">
        Peripheral Counters
      </div>
      <div className="flex gap-3">
        {DATA_LABELS.filter(({ addr }) => (memorySlice[addr] ?? 0) !== 0).map(({ addr, label, color }) => (
          <div key={addr} className="text-center">
            <div className={`text-sm font-mono font-bold ${color}`}>
              {hex2(memorySlice[addr] ?? 0)}
            </div>
            <div className="text-[9px] text-zinc-400">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Memory Node ────────────────────────────────────────────────────────────

/** React Flow custom node rendering the memory hex dump. */
export function MemoryNode(_props: NodeProps) {
  const { memorySlice, recentAccesses } = useSimulation();

  // Build 4 rows × 16 columns from the first 64 bytes
  const rows = Array.from({ length: 4 }, (_, rowIndex) => {
    const startAddr = rowIndex * 16;
    const cells = memorySlice.slice(startAddr, startAddr + 16);
    return { startAddr, cells };
  });

  return (
    <div className="bg-white border border-zinc-300 rounded-xl shadow-md px-3 py-2.5 min-w-80">
      {/* Target handle — top (receives data bus from CPU) */}
      <Handle
        type="target"
        position={Position.Top}
        className="bg-blue-400! w-2.5! h-2.5!"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-800">Memory (1KB)</span>
        <span className="text-[10px] text-zinc-400">
          {memorySlice.length > 0 ? "0x000–0x03F" : "—"}
        </span>
      </div>

      {/* Hex grid */}
      <div className="font-mono text-[10px] leading-4">
        {/* Column headers */}
        <div className="flex gap-0">
          <span className="w-10 text-zinc-300 shrink-0" />
          {COL_HEADERS.map((h) => (
            <span
              key={h}
              className="w-5 text-center text-zinc-400 font-semibold"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Data rows */}
        {rows.map(({ startAddr, cells }) => (
          <div key={startAddr} className="flex gap-0">
            <span className="w-10 text-zinc-400 shrink-0">
              0x{hex2(startAddr)}:
            </span>
            {cells.length > 0 ? (
              cells.map((value, colIndex) => {
                const address = startAddr + colIndex;
                const highlight = getCellHighlight(address, recentAccesses);
                const nonZero = value !== 0;

                return (
                  <span
                    key={address}
                    className={`w-5 text-center rounded-sm ${highlight} ${
                      nonZero
                        ? "text-zinc-800 font-semibold"
                        : "text-zinc-300"
                    }`}
                  >
                    {hex2(value)}
                  </span>
                );
              })
            ) : (
              <span className="text-zinc-300 italic ml-1">no data</span>
            )}
          </div>
        ))}
      </div>

      {/* Recent accesses footer */}
      {recentAccesses.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-zinc-400">Recent:</span>
          {recentAccesses.slice(-5).map((access, i) => (
            <AccessBadge key={`${access.address}-${access.timestamp}-${i}`} access={access} />
          ))}
        </div>
      )}

      {/* Peripheral data counters */}
      <DataCounters memorySlice={memorySlice} />
    </div>
  );
}
