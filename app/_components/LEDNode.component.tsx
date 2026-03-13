"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/_modules/SimulationProvider.module";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

function stopPropagation(e: ReactPointerEvent) {
  e.stopPropagation();
}

function hex(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

const DEBOUNCE_MS = 120;

function useDebouncedUpdate(
  updatePeripheral: (id: string, updates: Record<string, unknown>) => void,
) {
  const pending = useRef<Record<string, Record<string, unknown>>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  return useCallback((id: string, updates: Record<string, unknown>) => {
    pending.current[id] = { ...pending.current[id], ...updates };

    if (timers.current[id]) clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      updatePeripheral(id, pending.current[id]);
      delete pending.current[id];
      delete timers.current[id];
    }, DEBOUNCE_MS);
  }, [updatePeripheral]);
}

export function LEDNode({ data }: NodeProps) {
  const { removePeripheral, updatePeripheral } = useSimulation();
  const debouncedUpdate = useDebouncedUpdate(updatePeripheral);
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
  const outputThreshold = (peripheral.meta.outputThreshold as number) ?? 128;
  const lowCurrentMa = (peripheral.meta.lowCurrentMa as number) ?? 1;
  const highCurrentMa = (peripheral.meta.highCurrentMa as number) ?? 18;
  const maxCurrentMa = (peripheral.meta.maxCurrentMa as number) ?? 20;
  const gamma = (peripheral.meta.gamma as number) ?? 1.2;
  const sourceAddress = (peripheral.meta.sourceAddress as number) ?? 0x003A;
  const glow = Math.max(0.1, brightness / 255);
  const isHigh = outputEntry >= outputThreshold;

  const sendUpdate = (updates: Record<string, unknown>) => {
    debouncedUpdate(peripheral.id, updates);
  };

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
        <div>
          src: <span className="font-mono text-zinc-300">{hex(sourceAddress)}</span>
        </div>
        <div>
          color: <span className="font-mono uppercase text-zinc-300">{color}</span>
        </div>
      </div>

      <div
        className="nopan nodrag nowheel mt-2 pt-2 border-t border-zinc-700 space-y-1.5"
        onPointerDownCapture={stopPropagation}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] text-zinc-400">
            <span>Threshold</span>
            <span className="font-mono">{outputThreshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={outputThreshold}
            onChange={(e) => sendUpdate({ outputThreshold: Number(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none bg-zinc-700 accent-cyan-400 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] text-zinc-400">
            <span>Low mA</span>
            <span className="font-mono">{lowCurrentMa.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={lowCurrentMa}
            onChange={(e) => sendUpdate({ lowCurrentMa: Number(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none bg-zinc-700 accent-cyan-400 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] text-zinc-400">
            <span>High mA</span>
            <span className="font-mono">{highCurrentMa.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={highCurrentMa}
            onChange={(e) => sendUpdate({ highCurrentMa: Number(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none bg-zinc-700 accent-cyan-400 cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[9px] text-zinc-400 flex items-center justify-between gap-1">
            max mA
            <input
              type="number"
              min={1}
              step={0.5}
              value={maxCurrentMa}
              onChange={(e) => sendUpdate({ maxCurrentMa: Number(e.target.value) })}
              className="w-14 px-1 py-0.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-200 text-right font-mono"
            />
          </label>
          <label className="text-[9px] text-zinc-400 flex items-center justify-between gap-1">
            gamma
            <input
              type="number"
              min={0.1}
              max={3}
              step={0.1}
              value={gamma}
              onChange={(e) => sendUpdate({ gamma: Number(e.target.value) })}
              className="w-14 px-1 py-0.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-200 text-right font-mono"
            />
          </label>
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
