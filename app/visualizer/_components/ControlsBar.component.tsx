"use client";

/**
 * @module ControlsBar
 *
 * Floating control toolbar with Start / Stop / Step / Reset buttons,
 * a scheduler-type dropdown, and a stats row.
 */

import { useSimulation } from "@/app/visualizer/_modules/SimulationProvider.module";

// ─── Button Helper ──────────────────────────────────────────────────────────

/** Props for an individual simulation control button. */
interface ControlButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  variant?: "start" | "stop" | "step" | "reset";
}

/** Per-variant colour maps. */
const BUTTON_VARIANTS: Record<string, string> = {
  start:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:hover:bg-emerald-50",
  stop:
    "bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:hover:bg-amber-50",
  step:
    "bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:hover:bg-sky-50",
  reset:
    "bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:hover:bg-rose-50",
};

/** Variant-coloured button for a single simulation control action. */
function ControlButton({ label, icon, onClick, disabled, variant }: ControlButtonProps) {
  const colors = variant
    ? BUTTON_VARIANTS[variant]
    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:hover:bg-zinc-100";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${colors}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon} {label}
    </button>
  );
}

// ─── Status Dot ─────────────────────────────────────────────────────────────

/**
 * Coloured dot with a text label showing WebSocket / simulation status.
 *
 * - **Red** — disconnected from the WS server
 * - **Green** — connected and simulation is running
 * - **Gray** — connected but simulation is stopped
 */
function StatusIndicator({
  running,
  connected,
}: {
  running: boolean;
  connected: boolean;
}) {
  let dotColor = "bg-zinc-400";
  let label = "Disconnected";

  if (!connected) {
    dotColor = "bg-red-500";
    label = "Disconnected";
  } else if (running) {
    dotColor = "bg-green-500";
    label = "Running";
  } else {
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

// ─── Scheduler Labels ───────────────────────────────────────────────────────

/** Available scheduler algorithms for the dropdown. */
const SCHEDULER_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: "ROUND_ROBIN",         label: "Round Robin",         short: "RR"  },
  { value: "PREEMPTIVE_PRIORITY", label: "Preemptive Priority", short: "PP"  },
  { value: "NON_PREEMPTIVE",      label: "Non-Preemptive",      short: "NP"  },
];

// ─── Controls Bar ───────────────────────────────────────────────────────────

/**
 * Floating toolbar for the CPU simulation visualizer.
 *
 * Provides **Start**, **Stop**, **Step**, and **Reset** buttons alongside a
 * stats row displaying the current cycle count, clock speed (ms/tick),
 * connection/run status, active core count, and a scheduler type selector.
 */
export function ControlsBar() {
  const {
    running,
    connected,
    cycle,
    clockSpeed,
    coreStates,
    schedulerType,
    start,
    stop,
    step,
    reset,
    setSchedulerType,
  } = useSimulation();

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-lg px-4 py-3 min-w-80">
      {/* Button row */}
      <div className="flex items-center gap-2 mb-2">
        <ControlButton
          icon="▶"
          label="Start"
          onClick={start}
          disabled={!connected || running}
          variant="start"
        />
        <ControlButton
          icon="⏸"
          label="Stop"
          onClick={stop}
          disabled={!connected || !running}
          variant="stop"
        />
        <ControlButton
          icon="⏭"
          label="Step"
          onClick={step}
          disabled={!connected || running}
          variant="step"
        />
        <ControlButton
          icon="↺"
          label="Reset"
          onClick={reset}
          disabled={!connected}
          variant="reset"
        />

        {/* Scheduler type selector */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 font-medium">Scheduler:</span>
          <select
            value={schedulerType}
            onChange={(e) => setSchedulerType(e.target.value)}
            disabled={!connected}
            className="text-[11px] font-medium text-zinc-700 bg-zinc-100 border border-zinc-200
              rounded-md px-2 py-1 cursor-pointer hover:bg-zinc-200 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {SCHEDULER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-500 font-mono">
        <span>Cycle: {cycle}</span>
        <span>Speed: {clockSpeed}ms/tick</span>
        <StatusIndicator running={running} connected={connected} />
        <span>Cores: {coreStates.length}</span>
        <span className="text-zinc-400">
          {SCHEDULER_OPTIONS.find((o) => o.value === schedulerType)?.short ?? "??"}
        </span>
      </div>
    </div>
  );
}
