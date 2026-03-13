"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/_modules/SimulationProvider.module";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

const DEBOUNCE_MS = 120;

function stopPropagation(e: ReactPointerEvent) {
  e.stopPropagation();
}

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

export function PotentiometerNode({ data }: NodeProps) {
  const { removePeripheral, updatePeripheral } = useSimulation();
  const debouncedUpdate = useDebouncedUpdate(updatePeripheral);
  const peripheral = data.peripheral as PeripheralSnapshot | undefined;

  if (!peripheral) {
    return (
      <div className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-400">
        No potentiometer data
      </div>
    );
  }

  const maxResistance = (peripheral.meta.maxResistance as number) ?? 100;
  const currentResistance = (peripheral.meta.currentResistance as number) ?? 0;
  const normalizedValue = (peripheral.meta.normalizedValue as number) ?? 0;

  const setResistance = (value: number) => {
    debouncedUpdate(peripheral.id, {
      currentResistance: Math.max(0, Math.min(maxResistance, Math.round(value))),
    });
  };

  return (
    <div className="bg-white border border-zinc-200 border-l-4 border-l-amber-500 rounded-lg shadow-sm px-3 py-2 min-w-52 max-w-56 text-xs text-zinc-700">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
          <span className="font-semibold text-[11px] truncate">{peripheral.name}</span>
        </div>
        <button
          onClick={() => removePeripheral(peripheral.id)}
          className="text-red-400 hover:text-red-600 text-[10px] font-bold px-0.5 rounded hover:bg-red-50 transition-colors"
          title="Remove potentiometer"
        >
          ✕
        </button>
      </div>

      <div className="text-[10px] text-zinc-500 mb-1">Input • max {maxResistance} ohm</div>

      <div className="nopan nodrag nowheel space-y-1.5" onPointerDownCapture={stopPropagation}>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500">Resistance</span>
          <span className="font-mono text-zinc-700">{currentResistance}</span>
        </div>
        <input
          type="range"
          min={0}
          max={maxResistance}
          step={1}
          value={currentResistance}
          onChange={(e) => setResistance(Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none bg-zinc-200 accent-amber-500 cursor-pointer nopan"
        />

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-zinc-400">CPU byte</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-amber-300 transition-all duration-100"
              style={{ width: `${(normalizedValue / 255) * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-zinc-600 tabular-nums">{normalizedValue}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 bg-orange-400 border-orange-500"
      />
    </div>
  );
}
