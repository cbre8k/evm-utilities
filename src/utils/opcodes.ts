// ============================================================
// src/utils/opcodes.ts — Frontend UI layer for EVM opcodes
// Data (types, table, lookups) comes from shared/utils/opcodes.ts
// This file adds badge colors and getOpcodeStyle() for rendering
// ============================================================

// Re-export data types and lookups so consumers only need one import
export type { OpcodeCategory, OpcodeInfo } from '@shared/utils/opcodes';
export { OPCODES, OPCODE_BY_NAME, OPCODE_BY_HEX, getOpcodeInfo } from '@shared/utils/opcodes';

import type { OpcodeCategory } from '@shared/utils/opcodes';
import { getOpcodeInfo } from '@shared/utils/opcodes';

// ── Category → badge colors ───────────────────────────────────

export const CATEGORY_COLOR: Record<OpcodeCategory, { bg: string; color: string }> = {
  stop:       { bg: '#1c1917', color: '#a8a29e' },
  arithmetic: { bg: '#1a1a2e', color: '#94a3b8' },
  comparison: { bg: '#1a1a2e', color: '#94a3b8' },
  bitwise:    { bg: '#1a1a2e', color: '#94a3b8' },
  sha3:       { bg: '#2e1065', color: '#c4b5fd' },
  env:        { bg: '#1e3a5f', color: '#7dd3fc' },
  block:      { bg: '#0c2a1e', color: '#6ee7b7' },
  memory:     { bg: '#1c1917', color: '#78716c' },
  storage:    { bg: '#831843', color: '#fbcfe8' },
  flow:       { bg: '#1e3a5f', color: '#93c5fd' },
  log:        { bg: '#2d1b69', color: '#c4b5fd' },
  call:       { bg: '#14532d', color: '#86efac' },
  create:     { bg: '#3d2c00', color: '#fcd34d' },
  stack:      { bg: '#111827', color: '#6b7280' },
};

// Overrides for specific opcodes that differ from their category color
export const OPCODE_COLOR_OVERRIDE: Partial<Record<string, { bg: string; color: string }>> = {
  SSTORE:       { bg: '#7f1d1d', color: '#fecaca' },
  REVERT:       { bg: '#3b0f0f', color: '#fca5a5' },
  INVALID:      { bg: '#450a0a', color: '#f87171' },
  SELFDESTRUCT: { bg: '#450a0a', color: '#f87171' },
  CALLCODE:     { bg: '#3d2c00', color: '#fcd34d' },
  DELEGATECALL: { bg: '#3d2c00', color: '#fcd34d' },
  STATICCALL:   { bg: '#1e3a5f', color: '#93c5fd' },
  JUMPDEST:     { bg: '#0c1a2e', color: '#475569' },
  JUMPI:        { bg: '#1e3a5f', color: '#60a5fa' },
};

const DEFAULT_STYLE = { bg: '#1e293b', color: '#94a3b8' };

/**
 * Get badge styling for an opcode name (e.g. "CALL", "SSTORE", "REVERT").
 * Checks per-opcode overrides first, then falls back to category color.
 */
export function getOpcodeStyle(name: string): { bg: string; color: string } {
  const override = OPCODE_COLOR_OVERRIDE[name];
  if (override) return override;
  const info = getOpcodeInfo(name);
  if (info) return CATEGORY_COLOR[info.category];
  return DEFAULT_STYLE;
}