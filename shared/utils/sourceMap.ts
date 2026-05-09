// ============================================================
// shared/utils/sourceMap.ts — PC-to-source mapping logic
// Single source of truth for both frontend and backend
// ============================================================

export interface SourceLocation {
  start: number;
  length: number;
  fileIndex: number;
  jump: string;
  modifier: number;
}

/**
 * Maps PC (Program Counter) to Source Map instruction index.
 * Requires the runtime bytecode (hex string, optionally 0x-prefixed).
 */
export function buildPcToInstMapping(bytecode: string): Record<number, number> {
  const pcToInst: Record<number, number> = {};
  const bin = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;

  let pc = 0;
  let inst = 0;

  for (let i = 0; i < bin.length; i += 2) {
    const byte = parseInt(bin.slice(i, i + 2), 16);
    pcToInst[pc] = inst;

    // PUSH1 (0x60) through PUSH32 (0x7f): skip the immediate bytes
    if (byte >= 0x60 && byte <= 0x7f) {
      const skip = byte - 0x5f;
      i += skip * 2;
      pc += skip + 1;
    } else {
      pc += 1;
    }
    inst += 1;
  }

  return pcToInst;
}

/**
 * Parses a Solidity source map string.
 * Format: s:l:f:j:m;...  (fields may be omitted to inherit from previous)
 */
export function parseSourceMap(sourceMap: string): SourceLocation[] {
  const parts = sourceMap.split(';');
  const locations: SourceLocation[] = [];

  let last: SourceLocation = { start: -1, length: -1, fileIndex: -1, jump: '-', modifier: -1 };

  for (const part of parts) {
    const fields = part.split(':');
    const loc: SourceLocation = { ...last };

    if (fields[0] && fields[0] !== '') loc.start = parseInt(fields[0], 10);
    if (fields[1] && fields[1] !== '') loc.length = parseInt(fields[1], 10);
    if (fields[2] && fields[2] !== '') loc.fileIndex = parseInt(fields[2], 10);
    if (fields[3] && fields[3] !== '') loc.jump = fields[3];
    if (fields[4] && fields[4] !== '') loc.modifier = parseInt(fields[4], 10);

    locations.push(loc);
    last = loc;
  }

  return locations;
}

/**
 * Find the 1-based line number in the source code for a given byte offset.
 */
export function getLineForOffset(source: string, offset: number): number {
  if (offset < 0) return 0;
  return source.slice(0, offset).split('\n').length;
}
