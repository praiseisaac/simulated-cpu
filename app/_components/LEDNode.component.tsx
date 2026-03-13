"use client";

import { type PointerEvent as ReactPointerEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/_modules/SimulationProvider.module";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

function stopPropagation(e: ReactPointerEvent) {
  e.stopPropagation();
}

function hex(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

export function LEDNode({ data }: NodeProps) {
  const { removePeripheral } = useSimulation();
  const peripheral = data.peripheral as PeripheralSnapshot | undefined;

  if (!peripheral) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-500">
        No LED data
      </div>
    );
  }

  const color = (peripheral.meta.color as string) ?? "#ef4444";
  const brightness = (peripheral.meta.brightness as number) ?? 0;
  const currentMa = (peripheral.meta.currentMa as number) ?? 0;
  const outputEntry = (peripheral.meta.outputEntry as number) ?? 0;
  const level = (peripheral.meta.level as "LOW" | "HIGH") ?? "LOW";
  const sourceAddress = (peripheral.meta.sourceAddress as number) ?? 0x003A;
  const glow = Math.max(0.1, brightness / 255);
  const isHigh = level === "HIGH";

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg px-3 py-2.5 text-xs text-zinc-300 min-w-44">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full bg-zinc-200" />
          <span className="font-semibold text-[11px] text-zinc-200 truncate">{peripheral.name}</span>
        </div>
        <button
          onClick={() => removePeripheral(peripheral.id)}
          onPointerDownCapture={stopPropagation}
          className="text-red-400 hover:text-red-500 text-[10px] font-bold px-0.5 rounded hover:bg-red-950 transition-colors"
          title="Remove LED"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center justify-center py-2">
        <div
          className="h-10 w-10 rounded-full border border-white/30 transition-all"
          style={{
            backgroundColor: color,
            opacity: 0.2 + glow * 0.8,
            boxShadow: `0 0 ${8 + glow * 16}px ${color}`,
          }}
        />
      </div>

      <div className="text-[10px] text-zinc-400 space-y-0.5">
        <div className="flex items-center justify-between">
          <span>Output</span>
          <span className="font-mono text-zinc-200">{brightness}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Current</span>
          <span className="font-mono text-zinc-200">{currentMa.toFixed(1)}mA</span>
        </div>
        <div className="flex items-center justify-between">
          <span>State</span>
          <span className={`font-mono ${isHigh ? "text-emerald-300" : "text-zinc-400"}`}>{isHigh ? "HIGH" : "LOW"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Entry</span>
          <span className="font-mono text-zinc-300">{outputEntry}</span>
        </div>
        <div>
          src: <span className="font-mono text-zinc-300">{hex(sourceAddress)}</span>
        </div>
        <div>
          color: <span className="font-mono uppercase text-zinc-300">{color}</span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 bg-blue-400 border-blue-500"
      />
    </div>
  );
}
