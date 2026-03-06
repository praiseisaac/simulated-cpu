import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { SavedState } from "@/types/persistence.types";
import type { CPUService } from "@/services/cpu/CPU.service";

// ─── Current Schema Version ─────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

// ─── Persistence Service ────────────────────────────────────────────────────

/**
 * Saves and loads the full CPU simulation state to/from a JSON file.
 *
 * Usage:
 *   PersistenceService.save(cpu, "./state.json");
 *   const state = PersistenceService.load("./state.json");
 *   cpu.restoreFromSnapshot(state);
 */
export class PersistenceService {
  /**
   * Serialise the current CPU state and write it to a JSON file.
   */
  static save(cpu: CPUService, filePath: string): void {
    const state = cpu.toJSON();
    const json = JSON.stringify(state, null, 2);
    writeFileSync(filePath, json, "utf-8");
  }

  /**
   * Read a JSON file and parse it into a `SavedState`.
   * Validates the schema version before returning.
   */
  static load(filePath: string): SavedState {
    if (!existsSync(filePath)) {
      throw new Error(`Save file not found: ${filePath}`);
    }

    const raw = readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (!PersistenceService.isSavedState(parsed)) {
      throw new Error("Invalid save file format");
    }

    if (parsed.version > SCHEMA_VERSION) {
      throw new Error(
        `Save file version ${parsed.version} is newer than supported version ${SCHEMA_VERSION}`
      );
    }

    return parsed;
  }

  /**
   * Check whether a save file exists at the given path.
   */
  static exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  // ── Validation ──────────────────────────────────────────────────────

  /**
   * Basic structural type guard for `SavedState`.
   */
  private static isSavedState(value: unknown): value is SavedState {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;

    return (
      typeof obj.version === "number" &&
      typeof obj.timestamp === "number" &&
      typeof obj.cycle === "number" &&
      typeof obj.clockSpeed === "number" &&
      Array.isArray(obj.memory) &&
      Array.isArray(obj.cores) &&
      typeof obj.scheduler === "object" &&
      obj.scheduler !== null &&
      Array.isArray(obj.peripherals) &&
      Array.isArray(obj.pendingInterrupts)
    );
  }
}
