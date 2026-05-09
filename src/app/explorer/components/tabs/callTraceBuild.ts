import type { TraceNode, TraceLog, AddressStateDiff, FilteredStructLog } from '@/types/explorer';
import type { FlatEntry, TraceItem, TraceFrame, JumpFrame } from './callTraceTypes';
import { CALL_OPS, HIDDEN_OPCODE_ROWS, VISIBLE_OPCODE_ROWS } from './callTraceConstants';
import { decodeReturn } from './callTraceUtils';

export function parseGas(v?: string): number {
  if (!v) return 0;
  try { return Number(v.startsWith('0x') ? BigInt(v) : BigInt(v)); } catch { return 0; }
}

function collectDescendantCalls(root: TraceNode): TraceNode[] {
  const calls: TraceNode[] = [];
  for (const child of root.children) {
    calls.push(child, ...collectDescendantCalls(child));
  }
  return calls;
}

function collectTraceLogs(root: TraceNode): TraceLog[] {
  const logs = [...(root.logs ?? [])];
  for (const child of root.children) {
    logs.push(...collectTraceLogs(child));
  }
  return logs;
}

function frameStorageAddress(frame: TraceNode): string {
  return (frame.to ?? frame.from).toLowerCase();
}

/**
 * Build from structlog (preferred) — real ordering, real gas costs per op.
 * Entries are already in chronological order; depth tells us the call frame.
 */
export function buildFromStructLog(
  structLog: FilteredStructLog[],
  root: TraceNode,
): FlatEntry[] {
  const out: FlatEntry[] = [{ kind: 'call', node: root, depth: 0, gasUsed: parseGas(root.gasUsed) }];

  const callQueue = collectDescendantCalls(root);
  let callIdx = 0;

  const logQueue = collectTraceLogs(root);
  let logIdx = 0;

  const activeFrames: TraceNode[] = [root];
  const internalDepthByFrame = new Map<number, number>();

  for (const e of structLog) {
    const frameDepth = Math.max(0, e.depth - 1);
    const baseRowDepth = Math.max(1, e.depth);
    const internalDepth = internalDepthByFrame.get(frameDepth) ?? 0;
    const rowDepth = baseRowDepth + internalDepth;
    activeFrames.length = frameDepth + 1;
    const currentFrame = activeFrames[frameDepth] ?? root;

    if (e.op === 'SLOAD' || e.op === 'SSTORE') {
      out.push({
        kind: 'storage',
        depth: rowDepth,
        opcode: e.op,
        address: frameStorageAddress(currentFrame),
        slot: e.storageKey ?? '0x',
        before: e.storagePre  ?? '0x',
        after:  e.storagePost ?? '0x',
        gasCost: e.gasCost,
      });
    } else if (e.op.startsWith('LOG')) {
      const log = logQueue[logIdx++];
      out.push({
        kind: 'event',
        depth: rowDepth,
        opcode: e.op,
        address: (log?.address ?? currentFrame.to ?? currentFrame.from).toLowerCase(),
        topics: log?.topics ?? [],
        data: log?.data ?? '0x',
        gasCost: e.gasCost,
        name: log?.name,
        inputs: log?.inputs,
      });
    } else if (CALL_OPS.has(e.op)) {
      const node = callQueue[callIdx++] ?? null;
      if (node) {
        out.push({ kind: 'call', node, depth: rowDepth, gasUsed: parseGas(node.gasUsed) });
        activeFrames[rowDepth] = node;
      }
    } else if (HIDDEN_OPCODE_ROWS.has(e.op)) {
      continue;
    } else {
      out.push({
        kind: 'opcode',
        depth: rowDepth,
        op: e.op,
        pc: e.pc,
        gasCost: e.gasCost,
        address: frameStorageAddress(currentFrame),
        error: e.error,
        jumpTo: e.jumpTo,
        jumpCondition: e.jumpCondition,
        sourceLabel: e.sourceLabel,
        jumpTargetLabel: e.jumpTargetLabel,
        jumpTargetFile: e.jumpTargetFile,
        jumpTargetLine: e.jumpTargetLine,
        jumpTargetFunction: e.jumpTargetFunction,
        jumpTargetFunctionParams: e.jumpTargetFunctionParams,
        jumpTargetFunctionReturnsValue: e.jumpTargetFunctionReturnsValue,
        jumpStack: e.jumpStack,
        jumpMemory: e.jumpMemory,
        sourceJump: e.sourceJump,
        line: e.sourceLine,
        file: e.sourceFile,
      });

      if (e.op === 'JUMP' && e.sourceJump === 'i') {
        internalDepthByFrame.set(frameDepth, internalDepth + 1);
      } else if (e.op === 'JUMP' && e.sourceJump === 'o') {
        internalDepthByFrame.set(frameDepth, Math.max(0, internalDepth - 1));
      }
    }
  }
  return out;
}

/** Fallback when structlog not available — derive from call tree + state diffs */
export function buildFlatEntries(
  node: TraceNode,
  stateDiffs: AddressStateDiff[],
  depth = 0,
): FlatEntry[] {
  const out: FlatEntry[] = [];
  const gasUsed = parseGas(node.gasUsed);
  out.push({ kind: 'call', node, depth, gasUsed });

  const logs: TraceLog[] = node.logs ?? [];
  for (const log of logs) {
    const topicCount = log.topics?.length ?? 0;
    const dataLen = ((log.data?.length ?? 2) - 2) / 2;
    out.push({
      kind: 'event',
      depth: depth + 1,
      opcode: `LOG${topicCount}`,
      address: (log.address ?? '').toLowerCase(),
      topics: log.topics ?? [],
      data: log.data ?? '0x',
      gasCost: 375 + topicCount * 375 + dataLen * 8,
      name: log.name,
      inputs: log.inputs,
    });
  }

  const diff = stateDiffs.find(d => d.address === node.to?.toLowerCase());
  if (diff && depth === 0) {
    for (const sc of diff.storageChanges) {
      out.push({
        kind: 'storage',
        depth: 1,
        opcode: sc.before !== sc.after ? 'SSTORE' : 'SLOAD',
        address: diff.address,
        slot: sc.slot,
        before: sc.before,
        after: sc.after,
        gasCost: sc.before !== sc.after ? 2900 : 2100,
      });
    }
  }

  for (const child of node.children) {
    out.push(...buildFlatEntries(child, stateDiffs, depth + 1));
  }
  return out;
}

export function buildTraceTree(entries: FlatEntry[]): TraceItem[] {
  const roots: TraceItem[] = [];
  const stack: Array<{ depth: number; items: TraceItem[]; contractName?: string }> = [{ depth: -1, items: roots }];

  entries.forEach((entry, index) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= entry.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (entry.kind === 'call') {
      const reverted = !!entry.node.error;
      const value = reverted
        ? (entry.node.revertReason ?? entry.node.error ?? 'reverted')
        : decodeReturn(entry.node.output);

      const frame: TraceFrame = {
        kind: 'frame',
        id: entry.node.id,
        depth: entry.depth,
        entry,
        items: [],
        returnValue: value ? { reverted, value } : undefined,
      };

      parent.items.push(frame);
      // For DELEGATECALL, the child node's contract_name is the implementation
      const frameName = entry.node.contract_name;
      stack.push({ depth: entry.depth, items: frame.items, contractName: frameName });
      return;
    }

    // JUMP-in with function info → create an expandable jump frame
    if (
      entry.kind === 'opcode' &&
      entry.sourceJump === 'i' &&
      (entry.jumpTargetFunction || entry.jumpTargetLabel)
    ) {
      const jumpFrame: JumpFrame = {
        kind: 'jump-frame',
        id: `jump-${index}`,
        depth: entry.depth,
        entry,
        address: entry.address ?? '',
        contractName: parent.contractName,
        items: [],
        gasUsed: entry.gasCost,
      };
      parent.items.push(jumpFrame);
      stack.push({ depth: entry.depth, items: jumpFrame.items, contractName: parent.contractName });
      return;
    }

    // JUMP-out → skip (the depth pop handles leaving the frame)
    if (entry.kind === 'opcode' && entry.sourceJump === 'o') {
      return;
    }

    if (entry.kind !== 'opcode' || entry.error || VISIBLE_OPCODE_ROWS.has(entry.op)) {
      parent.items.push({
        kind: 'step',
        id: `${entry.kind}-${index}`,
        depth: entry.depth,
        entry,
      });
    }
  });

  // Compute cumulative gas for jump frames
  computeJumpGas(roots);

  return roots;
}

/** Walk the tree and sum descendant gasCosts into each JumpFrame.gasUsed. */
function computeJumpGas(items: TraceItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.kind === 'jump-frame') {
      const childGas = computeJumpGas(item.items);
      item.gasUsed = item.entry.gasCost + childGas;
      total += item.gasUsed;
    } else if (item.kind === 'frame') {
      computeJumpGas(item.items);
      total += item.entry.gasUsed;
    } else {
      total += item.entry.kind === 'opcode'
        ? item.entry.gasCost
        : item.entry.gasCost;
    }
  }
  return total;
}

export function findFrame(items: TraceItem[], id: string): TraceFrame | null {
  for (const item of items) {
    if (item.kind !== 'frame') {
      if (item.kind === 'jump-frame') {
        const child = findFrame(item.items, id);
        if (child) return child;
      }
      continue;
    }
    if (item.id === id) return item;
    const child = findFrame(item.items, id);
    if (child) return child;
  }
  return null;
}

export function findItem(items: TraceItem[], id: string): TraceItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.kind === 'frame' || item.kind === 'jump-frame') {
      const child = findItem(item.items, id);
      if (child) return child;
    }
  }
  return null;
}
