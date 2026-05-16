import type { ContractSourceBundle, ContractSourceFile } from './sourceMapTypes';

export function normalizePath(path?: string): string {
  if (!path) return '';
  return path.replace(/\\/g, '/');
}

export function fileNameFromPath(path?: string): string {
  if (!path) return '';
  const normalized = normalizePath(path);
  return normalized.split('/').pop() ?? normalized;
}

export function pickFileByName(
  bundle: ContractSourceBundle | null,
  fileName?: string,
): ContractSourceFile | undefined {
  if (!bundle || !fileName) return undefined;
  const normalized = fileNameFromPath(fileName);
  const direct = bundle.sources.find((source) => source.name === normalized);
  if (direct) return direct;
  return bundle.sources.find((source) => source.path.endsWith(`/${normalized}`))
    || bundle.sources.find((source) => source.path === normalized);
}

export function clampLine(line: number | undefined, total: number): number | undefined {
  if (!line || Number.isNaN(line) || total <= 0) return undefined;
  return Math.min(Math.max(1, line), total);
}

export function linesFromSource(source: string): string[] {
  return source.split('\n');
}

export function lineRange(
  line: number | undefined,
  total: number,
  radius = 6,
): { start: number; end: number } {
  if (!line || total <= 0) return { start: 1, end: Math.min(total, radius * 2 + 1) };
  const start = Math.max(1, line - radius);
  const end = Math.min(total, line + radius);
  return { start, end };
}
