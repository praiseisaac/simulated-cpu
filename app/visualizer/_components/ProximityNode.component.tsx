"use client";

/**
 * @module ProximityNode
 *
 * React Flow custom node for the proximity sensor peripheral.
 * Renders a simple **circle** that tracks the user's cursor position
 * and streams the Euclidean distance to the backend via
 * `updatePeripheral`.  The circle changes colour when the cursor
 * enters the configured radius (green → red).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSimulation } from "@/app/visualizer/_modules/SimulationProvider.module";
import type { PeripheralSnapshot } from "@/types/peripheral.types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** How often (ms) we push new distance values to the backend. */
const SEND_INTERVAL_MS = 80;

// ─── Debounced sender ───────────────────────────────────────────────────────

/**
 * Returns a stable callback that throttles updatePeripheral calls
 * so we don't flood the WS connection with every mousemove frame.
 */
function useThrottledSend(
  updatePeripheral: (id: string, updates: Record<string, unknown>) => void,
) {
  const lastSent = useRef(0);
  const pending = useRef<{ id: string; distance: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (id: string, distance: number) => {
      pending.current = { id, distance };
      const now = Date.now();

      if (now - lastSent.current >= SEND_INTERVAL_MS) {
        updatePeripheral(id, { currentDistance: distance });
        lastSent.current = now;
        pending.current = null;
        return;
      }

      // Schedule a trailing send
      if (!timer.current) {
        timer.current = setTimeout(() => {
          if (pending.current) {
            updatePeripheral(pending.current.id, {
              currentDistance: pending.current.distance,
            });
            lastSent.current = Date.now();
            pending.current = null;
          }
          timer.current = null;
        }, SEND_INTERVAL_MS);
      }
    },
    [updatePeripheral],
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stopPropagation(e: ReactPointerEvent) {
  e.stopPropagation();
}

// ─── Component ──────────────────────────────────────────────────────────────

/** React Flow custom node: a circular proximity sensor. */
export function ProximityNode({ data }: NodeProps) {
  const { updatePeripheral, removePeripheral } = useSimulation();
  const throttledSend = useThrottledSend(updatePeripheral);
  const nodeRef = useRef<HTMLDivElement>(null);
  const peripheral = data.peripheral as PeripheralSnapshot | undefined;

  // Keep a stable ref to the peripheral ID so the mousemove listener
  // doesn't need to be re-attached on every tick broadcast.
  const peripheralIdRef = useRef<string | null>(null);
  peripheralIdRef.current = peripheral?.id ?? null;

  // ── Mouse-tracking effect ───────────────────────────────────────────

  useEffect(() => {
    if (!peripheral) return;

    function onMouseMove(e: MouseEvent) {
      const id = peripheralIdRef.current;
      if (!nodeRef.current || !id) return;
      const rect = nodeRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      throttledSend(id, distance);
    }

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
    // Only re-attach when peripheral existence changes or ID changes,
    // NOT on every tick snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peripheral?.id, throttledSend]);

  // ── Render ──────────────────────────────────────────────────────────

  if (!peripheral) {
    return (
      <div className="w-20 h-20 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] text-zinc-400">
        N/A
      </div>
    );
  }

  const radius = (peripheral.meta.radius as number) ?? 100;
  const distance = (peripheral.meta.currentDistance as number) ?? 9999;
  const wasInRange = (peripheral.meta.wasInRange as boolean) ?? false;

  // Colour shifts from emerald → red as cursor gets closer
  const ringColor = wasInRange
    ? "border-red-400 shadow-red-200/50"
    : "border-emerald-400 shadow-emerald-200/50";

  const bgColor = wasInRange
    ? "bg-red-50"
    : "bg-emerald-50";

  // Proximity factor: 1 = touching, 0 = far away (clamped)
  const proximity = Math.max(0, Math.min(1, 1 - distance / (radius * 2)));
  const pulseScale = 1 + proximity * 0.15;

  return (
    <div
      ref={nodeRef}
      className="relative flex items-center justify-center"
      style={{ width: 120, height: 120 }}
    >
      {/* Radius indicator ring (decorative) */}
      <div
        className="absolute rounded-full border border-dashed border-zinc-200 opacity-30 pointer-events-none"
        style={{
          width: Math.min(200, radius),
          height: Math.min(200, radius),
        }}
      />

      {/* Main circle */}
      <div
        className={`w-20 h-20 rounded-full ${bgColor} border-[3px] ${ringColor}
          shadow-lg flex flex-col items-center justify-center
          transition-all duration-150 ease-out`}
        style={{
          transform: `scale(${pulseScale})`,
        }}
      >
        {/* Distance label */}
        <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5">
          PROX
        </span>
        <span className="text-sm font-bold font-mono text-zinc-800 tabular-nums">
          {distance > 999 ? "far" : distance}
        </span>
        <span className="text-[8px] text-zinc-400 mt-0.5">
          r={radius}
        </span>
      </div>

      {/* Delete button */}
      <button
        onClick={() => removePeripheral(peripheral.id)}
        onPointerDownCapture={stopPropagation}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border
          border-zinc-200 text-red-400 hover:text-red-600 text-[8px] font-bold
          flex items-center justify-center hover:bg-red-50 transition-colors z-10"
        title="Remove"
      >
        ✕
      </button>

      {/* Source handle → goes to CPU via IRQ edge */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 bg-orange-400 border-orange-500"
      />
    </div>
  );
}
