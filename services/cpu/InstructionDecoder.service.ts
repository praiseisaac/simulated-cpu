/**
 * @module InstructionDecoder.service
 *
 * Stateless decoder that converts raw 4-byte instruction words into
 * structured {@link Instruction} objects.  Also provides a human-readable
 * `disassemble` function for logging and UI display.
 *
 * Invalid opcodes or out-of-range register indices silently produce a
 * `NOP` instruction so the simulation never crashes on garbage memory.
 */

import {
  Opcode,
  INSTRUCTION_WIDTH,
  type Instruction,
} from "@/types/cpu.types";

// ─── Valid Opcodes Set ──────────────────────────────────────────────────────

/** Set of numeric values that map to a real {@link Opcode}. */
const VALID_OPCODES = new Set<number>(Object.values(Opcode) as number[]);

// ─── Decoder ────────────────────────────────────────────────────────────────

/**
 * Decode 4 raw bytes into a structured `Instruction`.
 *
 * Encoding (fixed-width, big-endian address):
 *   Byte 0: opcode
 *   Byte 1: register operand (index 0–3, or 0x00 if unused)
 *   Byte 2: second register (ADD/SUB) OR address high byte (LOAD/STORE/JMP)
 *   Byte 3: 0x00 (ADD/SUB) OR address low byte (LOAD/STORE/JMP)
 */
export function decode(raw: Uint8Array): Instruction {
  if (raw.length !== INSTRUCTION_WIDTH) {
    throw new Error(
      `Expected ${INSTRUCTION_WIDTH} bytes, got ${raw.length}`
    );
  }

  const opcodeRaw = raw[0];

  if (!VALID_OPCODES.has(opcodeRaw)) {
    throw new Error(
      `Unknown opcode: 0x${opcodeRaw.toString(16).padStart(2, "0")}`
    );
  }

  const opcode = opcodeRaw as Opcode;

  switch (opcode) {
    // NOP → [0x00, 0x00, 0x00, 0x00]
    case Opcode.NOP: {
      return { opcode, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
    }

    // LOAD Rd, addr  → [0x01, Rd, addrHi, addrLo]
    case Opcode.LOAD: {
      if (!isValidRegisterIndex(raw[1])) {
        // Illegal operand — treat as NOP
        return { opcode: Opcode.NOP, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
      }
      const address = (raw[2] << 8) | raw[3];
      return { opcode, reg1: raw[1], reg2: 0, address, raw: raw.slice() };
    }

    // STORE Rs, addr → [0x02, Rs, addrHi, addrLo]
    case Opcode.STORE: {
      if (!isValidRegisterIndex(raw[1])) {
        return { opcode: Opcode.NOP, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
      }
      const address = (raw[2] << 8) | raw[3];
      return { opcode, reg1: raw[1], reg2: 0, address, raw: raw.slice() };
    }

    // ADD Rd, Rs → [0x03, Rd, Rs, 0x00]
    case Opcode.SUB:
    case Opcode.ADD: {
      if (!isValidRegisterIndex(raw[1]) || !isValidRegisterIndex(raw[2])) {
        return { opcode: Opcode.NOP, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
      }
      return { opcode, reg1: raw[1], reg2: raw[2], address: 0, raw: raw.slice() };
    }

    // JMP addr → [0x05, 0x00, addrHi, addrLo]
    case Opcode.JMP: {
      const address = (raw[2] << 8) | raw[3];
      return { opcode, reg1: 0, reg2: 0, address, raw: raw.slice() };
    }

    // IRET → [0xFE, 0x00, 0x00, 0x00]
    case Opcode.IRET: {
      return { opcode, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
    }

    // HALT → [0xFF, 0x00, 0x00, 0x00]
    case Opcode.HALT: {
      return { opcode, reg1: 0, reg2: 0, address: 0, raw: raw.slice() };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidRegisterIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= 3;
}

/**
 * Human-readable disassembly of an instruction (for logging / UI).
 */
export function disassemble(instr: Instruction): string {
  const regName = (i: number) => `R${i}`;
  const addr = (a: number) => `0x${a.toString(16).padStart(3, "0")}`;

  switch (instr.opcode) {
    case Opcode.NOP:
      return `NOP`;
    case Opcode.LOAD:
      return `LOAD  ${regName(instr.reg1)}, ${addr(instr.address)}`;
    case Opcode.STORE:
      return `STORE ${regName(instr.reg1)}, ${addr(instr.address)}`;
    case Opcode.ADD:
      return `ADD   ${regName(instr.reg1)}, ${regName(instr.reg2)}`;
    case Opcode.SUB:
      return `SUB   ${regName(instr.reg1)}, ${regName(instr.reg2)}`;
    case Opcode.JMP:
      return `JMP   ${addr(instr.address)}`;
    case Opcode.IRET:
      return `IRET`;
    case Opcode.HALT:
      return `HALT`;
  }
}
