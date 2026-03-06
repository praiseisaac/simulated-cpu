/**
 * Shared color palette for peripherals. Each peripheral gets a deterministic
 * color based on its index in the peripherals array. These colors are used on
 * the PeripheralNode border and in the CoreTimeline cells.
 */

export interface PeripheralColor {
  /** Tailwind bg class for solid fills (timeline cells, legend swatches). */
  bg: string;
  /** Tailwind border-l class for the node card accent stripe. */
  borderL: string;
  /** Tailwind text class for labels / badges. */
  text: string;
  /** Tailwind bg class for light/muted backgrounds. */
  bgLight: string;
  /** Raw hex for non-Tailwind uses (e.g. inline styles). */
  hex: string;
}

const PALETTE: PeripheralColor[] = [
  { bg: "bg-blue-500",    borderL: "border-l-blue-500",    text: "text-blue-700",    bgLight: "bg-blue-100",    hex: "#3b82f6" },
  { bg: "bg-emerald-500", borderL: "border-l-emerald-500", text: "text-emerald-700", bgLight: "bg-emerald-100", hex: "#10b981" },
  { bg: "bg-violet-500",  borderL: "border-l-violet-500",  text: "text-violet-700",  bgLight: "bg-violet-100",  hex: "#8b5cf6" },
  { bg: "bg-rose-500",    borderL: "border-l-rose-500",    text: "text-rose-700",    bgLight: "bg-rose-100",    hex: "#f43f5e" },
  { bg: "bg-amber-500",   borderL: "border-l-amber-500",   text: "text-amber-700",   bgLight: "bg-amber-100",   hex: "#f59e0b" },
  { bg: "bg-cyan-500",    borderL: "border-l-cyan-500",    text: "text-cyan-700",    bgLight: "bg-cyan-100",    hex: "#06b6d4" },
  { bg: "bg-fuchsia-500", borderL: "border-l-fuchsia-500", text: "text-fuchsia-700", bgLight: "bg-fuchsia-100", hex: "#d946ef" },
  { bg: "bg-lime-500",    borderL: "border-l-lime-500",    text: "text-lime-700",    bgLight: "bg-lime-100",    hex: "#84cc16" },
];

/** Get the color entry for a peripheral by its index. */
export function getPeripheralColor(index: number): PeripheralColor {
  return PALETTE[index % PALETTE.length];
}

/** Build a lookup map from peripheral ID → PeripheralColor given the ordered array. */
export function buildColorMap(peripheralIds: string[]): Map<string, PeripheralColor> {
  const map = new Map<string, PeripheralColor>();
  peripheralIds.forEach((id, i) => map.set(id, getPeripheralColor(i)));
  return map;
}

/**
 * Given a core's PC and an array of peripherals (with handlerAddress), determine
 * which peripheral the core is currently servicing (if any).
 *
 * Each ISR is 20 bytes (5 instructions × 4 bytes). If the core's PC falls within
 * [handlerAddress, handlerAddress + 20), we assume it's servicing that peripheral.
 */
export function matchPeripheralByPC(
  pc: number,
  peripherals: { id: string; handlerAddress: number }[]
): string | null {
  const ISR_SIZE = 20;
  for (const p of peripherals) {
    if (pc >= p.handlerAddress && pc < p.handlerAddress + ISR_SIZE) {
      return p.id;
    }
  }
  return null;
}
