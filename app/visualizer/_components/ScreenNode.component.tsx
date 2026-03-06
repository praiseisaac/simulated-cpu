"use client";

/**
 * @module ScreenNode
 *
 * React Flow custom node for the **Screen** peripheral — a scrolling
 * pixel grid that visualises a memory-mapped data source over time.
 *
 * Each cell is coloured using the 16-entry palette defined in the
 * Screen peripheral backend.  The grid auto-scrolls: the newest
 * sample appears on the right and old data slides left.
 */

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/visualizer/_modules/SimulationProvider.module";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

// ─── Default palette (matches Screen.peripheral.ts) ─────────────────────────

const DEFAULT_PALETTE: readonly string[] = [
  "#0f172a", "#1e3a5f", "#1d4ed8", "#2563eb",
  "#0891b2", "#059669", "#16a34a", "#65a30d",
  "#ca8a04", "#ea580c", "#dc2626", "#e11d48",
  "#c026d3", "#7c3aed", "#f8fafc", "#ffffff",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function stopPropagation(e: ReactPointerEvent) {
  e.stopPropagation();
}

function hex(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

// ─── Grid Renderer ──────────────────────────────────────────────────────────

interface GridProps {
  width: number;
  height: number;
  pixels: number[];
  palette: string[];
  baseAddress?: number;
}

/**
 * Renders the pixel grid as a compact CSS grid of coloured cells.
 * Each cell is a tiny `<div>` whose background colour is set via the
 * palette.  Hover shows the cell index and raw value as a tooltip.
 */
function PixelGrid({ width, height, pixels, palette, baseAddress = 0 }: GridProps) {
  // Pre-compute colours once per render
  const colours = useMemo(
    () =>
      pixels.map((v) => palette[v & 0xf] ?? palette[0]),
    [pixels, palette],
  );

  const cellSize = width > 16 ? 6 : width > 8 ? 8 : 10;

  return (
    <div
      className="rounded overflow-hidden border border-zinc-700"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
        gap: 0,
        background: palette[0],
      }}
    >
      {colours.map((color, i) => (
        <div
          key={i}
          style={{ backgroundColor: color, width: cellSize, height: cellSize }}
          title={`[${Math.floor(i / width)},${i % width}] ${hex(baseAddress + i)} = ${pixels[i]}`}
        />
      ))}
    </div>
  );
}

// ─── Screen Node ────────────────────────────────────────────────────────────

/** React Flow custom node: a scrolling pixel-grid display. */
export function ScreenNode({ data }: NodeProps) {
  const { removePeripheral } = useSimulation();
  const peripheral = data.peripheral as PeripheralSnapshot | undefined;

  if (!peripheral) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-500">
        No screen data
      </div>
    );
  }

  const meta = peripheral.meta;
  const width = (meta.width as number) ?? 32;
  const height = (meta.height as number) ?? 8;
  const sourceAddress = (meta.sourceAddress as number) ?? 0;
  const pixels: number[] = (meta.pixels as number[]) ?? new Array(width * height).fill(0);
  const palette: string[] = (meta.palette as string[]) ?? [...DEFAULT_PALETTE];

  return (
    <div
      className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg
        px-3 py-2.5 text-xs text-zinc-300 select-none"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
          <span className="font-semibold text-[11px] text-zinc-200 truncate max-w-32">
            {peripheral.name}
          </span>
        </div>
        <button
          onClick={() => removePeripheral(peripheral.id)}
          onPointerDownCapture={stopPropagation}
          className="text-red-400 hover:text-red-500 text-[10px] font-bold px-0.5
            rounded hover:bg-red-950 transition-colors"
          title="Remove"
        >
          ✕
        </button>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 text-[9px] text-zinc-500 mb-1.5">
        <span>
          {width}×{height}
        </span>
        <span>
          src: <span className="font-mono text-zinc-400">{hex(sourceAddress)}</span>
        </span>
        <span className={peripheral.status === "ACTIVE" ? "text-emerald-400" : ""}>
          {peripheral.status}
        </span>
      </div>

      {/* The pixel grid */}
      <div className="nopan nodrag nowheel" onPointerDownCapture={stopPropagation}>
        <PixelGrid
          width={width}
          height={height}
          pixels={pixels}
          palette={palette}
        />
      </div>

      {/* Target handle — data bus from CPU */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 bg-blue-400 border-blue-500"
      />
    </div>
  );
}
