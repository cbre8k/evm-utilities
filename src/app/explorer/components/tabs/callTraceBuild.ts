import type { TraceNode, TraceLog, AddressStateDiff, FilteredStructLog } from '@/types/explorer';
import type { FlatEntry, TraceItem, TraceFrame, JumpFrame } from './callTraceTypes';
import { CALL_OPS, HIDDEN_OPCODE_ROWS, VISIBLE_OPCODE_ROWS } from './callTraceConstants';
import { decodeReturn } from './callTraceUtils';

export function parseGas(v?: string): number {
  if (!v) return 0;
  try { return Number(v.startsWith('0x') ? BigInt(v) : BigInt(v)); } catch { return 0; }
}

function callSelector(node?: TraceNode | null): string | undefined {
  if (!node) return undefined;
  const input = node.input ?? '';
  if (!input || input === '0x' || input.length < 10) return undefined;
  return input.slice(0, 10).toLowerCase();
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

/**
 * Build a log queue in execution order.
 *
 * Receipt logs (from the tx receipt) are always in correct execution order.
 * Tree logs (from callTracer) have decoded names/inputs but collectTraceLogs
 * returns them in pre-order (wrong for interleaved parent/child emissions).
 *
 * Strategy: use receipt logs as the primary queue (correct order), and enrich
 * each one with decoded name/inputs from the tree logs by matching topic0.
 * Fall back to tree logs only when receipt logs are unavailable.
 */
function buildLogQueue(
  root: TraceNode,
  receiptLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>,
): TraceLog[] {
  const treeLogs = collectTraceLogs(root);

  // If no receipt logs, fall back to tree logs (may have wrong order but at
  // least has decoded names)
  if (!receiptLogs || receiptLogs.length === 0) return treeLogs;

  // Build a lookup from tree logs: per (address + topic0) → queue of decoded info.
  // Within a given (address, topic0) pair, logs appear in the same relative order
  // in both sources, so we consume them in FIFO order.
  const key = (addr: string, t0: string) => `${addr}:${t0}`;
  const decodedMap = new Map<string, TraceLog[]>();
  for (const tl of treeLogs) {
    const k = key((tl.address ?? '').toLowerCase(), tl.topics?.[0] ?? '');
    if (!decodedMap.has(k)) decodedMap.set(k, []);
    decodedMap.get(k)!.push(tl);
  }
  const decodedIdx = new Map<string, number>();

  return receiptLogs.map(rl => {
    const k = key((rl.address ?? '').toLowerCase(), rl.topics?.[0] ?? '');
    const idx = decodedIdx.get(k) ?? 0;
    const candidates = decodedMap.get(k);
    const match = candidates?.[idx];
    if (match) decodedIdx.set(k, idx + 1);
    return {
      address: rl.address,
      topics: rl.topics,
      data: rl.data,
      name: rl.eventName ?? match?.name,
      inputs: match?.inputs,
    };
  });
}

/**
 * Build from structlog (preferred) — real ordering, real gas costs per op.
 *
 * Uses OpenTracer-style context stacks to track execution state:
 * - Each call type (CALL, STATICCALL, DELEGATECALL, CALLCODE, CREATE) pushes
 *   a new context with the correct storage and code addresses.
 * - Depth decreases in structlog (RETURN/STOP/REVERT) auto-pop the stack.
 * - DELEGATECALL/CALLCODE inherit the caller's storage address (proxy pattern).
 * - JUMP-in/out track internal depth per call frame for function nesting.
 */
export function buildFromStructLog(
  structLog: FilteredStructLog[],
  root: TraceNode,
  receiptLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>,
): FlatEntry[] {
  const rootFrom = (root.from ?? '').toLowerCase();
  const rootTo = (root.to ?? root.from ?? '').toLowerCase();
  const out: FlatEntry[] = [{
    kind: 'call', node: root, depth: 0, gasUsed: parseGas(root.gasUsed),
    visibleFrom: rootFrom,
    visibleTo: rootTo,
    storageAddress: rootTo,
    isDelegateCall: false,
    selector: callSelector(root),
  }];

  const callQueue = collectDescendantCalls(root);
  let callIdx = 0;

  const logQueue = buildLogQueue(root, receiptLogs);
  let logIdx = 0;

  // --- OpenTracer-inspired context stacks ---
  // Each entry represents one call frame's execution context.
  // Push on CALL_OPS, pop when structlog depth decreases (RETURN/STOP/REVERT).
  const rootAddr = (root.to ?? root.from ?? '').toLowerCase();
  const contextStack: Array<{
    node: TraceNode;
    isDelegateCall: boolean;
    storageAddress: string;   // Where SLOAD/SSTORE actually happen (proxy for D:CALL)
    codeAddress: string;      // Where code is executing (implementation for D:CALL)
    visibleAddress: string;   // Address shown as "sender" for child calls (spec: visibleReceiver of parent)
  }> = [{
    node: root,
    isDelegateCall: false,
    storageAddress: rootAddr,
    codeAddress: rootAddr,
    visibleAddress: rootAddr,
  }];

  for (const e of structLog) {
    // Pop contexts when depth decreases — equivalent to OpenTracer's
    // RETURN/STOP/REVERT/SELFDESTRUCT stack pops.
    // Always keep at least the root context.
    while (contextStack.length > 1 && contextStack.length > e.depth) {
      contextStack.pop();
    }

    const ctx = contextStack[contextStack.length - 1];
    // Use raw structlog depth — JumpFrame nesting is handled by JUMP-in/out
    // markers in buildTraceTree, not by depth values.
    const rowDepth = e.depth;

    if (e.op === 'SLOAD' || e.op === 'SSTORE') {
      // Storage ops happen at the storage context address.
      // For DELEGATECALL/CALLCODE this is the caller (proxy), not the implementation.
      out.push({
        kind: 'storage',
        depth: rowDepth,
        opcode: e.op,
        address: ctx.storageAddress,
        slot: e.storageKey ?? '0x',
        before: e.storagePre  ?? '0x',
        after:  e.storagePost ?? '0x',
        gasCost: e.gasCost,
      });
    } else if (e.op.startsWith('LOG')) {
      const log = logQueue[logIdx++];
      // Events in EVM use the storage context address (proxy for DELEGATECALL)
      // Fall back to structlog topics (extracted from EVM stack) when receipt/tree logs unavailable (e.g. reverted txs)
      out.push({
        kind: 'event',
        depth: rowDepth,
        opcode: e.op,
        address: (log?.address ?? ctx.storageAddress).toLowerCase(),
        topics: log?.topics ?? e.logTopics ?? [],
        data: log?.data ?? '0x',
        gasCost: e.gasCost,
        name: log?.name,
        inputs: log?.inputs,
      });
    } else if (CALL_OPS.has(e.op)) {
      const node = callQueue[callIdx++] ?? null;
      if (node) {
        const isDcall = node.type === 'DELEGATECALL' || node.type === 'CALLCODE';
        const nodeAddr = (node.to ?? node.from ?? '').toLowerCase();

        // Compute visible addresses per the Tenderly spec:
        // - DELEGATECALL: visibleFrom = storageAddress (proxy), visibleTo = codeAddress (logic)
        // - CALL inside DELEGATECALL: visibleFrom = parent's codeAddress (logic), visibleTo = target
        // - Regular CALL: visibleFrom = parent's visibleAddress, visibleTo = target
        let visibleFrom: string;
        let visibleTo: string;

        if (isDcall) {
          // [proxy => logic] — proxy is the storage context, logic is the implementation
          visibleFrom = ctx.storageAddress;
          visibleTo = nodeAddr;
        } else {
          // [parent's visible address => target]
          // For child CALL inside DELEGATECALL, ctx.visibleAddress = codeAddress (logic)
          // For regular CALL, ctx.visibleAddress = the contract address
          visibleFrom = ctx.visibleAddress;
          visibleTo = nodeAddr;
        }

        out.push({
          kind: 'call', node, depth: rowDepth, gasUsed: parseGas(node.gasUsed),
          visibleFrom,
          visibleTo,
          storageAddress: isDcall ? ctx.storageAddress : nodeAddr,
          isDelegateCall: isDcall,
          selector: callSelector(node),
        });

        // Push new context — like OpenTracer's stack push on CALL/DELEGATECALL/STATICCALL
        contextStack.push({
          node,
          isDelegateCall: isDcall,
          // DELEGATECALL/CALLCODE: storage stays at caller's address (OpenTracer pattern)
          storageAddress: isDcall ? ctx.storageAddress : nodeAddr,
          codeAddress: nodeAddr,
          // For DELEGATECALL: child calls should show codeAddress (logic) as sender
          // For regular CALL: child calls should show the target address
          visibleAddress: nodeAddr,
        });
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
        address: ctx.codeAddress,
        error: e.error,
        jumpTo: e.jumpTo,
        jumpCondition: e.jumpCondition,
        sourceLabel: e.sourceLabel,
        jumpTargetLabel: e.jumpTargetLabel,
        jumpTargetFile: e.jumpTargetFile,
        jumpTargetLine: e.jumpTargetLine,
        jumpTargetFunction: e.jumpTargetFunction,
        jumpTargetFunctionParams: e.jumpTargetFunctionParams,
        jumpResolvedParams: e.jumpResolvedParams,
        jumpTargetFunctionReturnsValue: e.jumpTargetFunctionReturnsValue,
        jumpStack: e.jumpStack,
        jumpMemory: e.jumpMemory,
        selector: callSelector(ctx?.node),
        sourceJump: e.sourceJump,
        line: e.sourceLine,
        file: e.sourceFile,
      });


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
  const stack: Array<{
    depth: number;
    items: TraceItem[];
    contractName?: string;
    isJump?: boolean;
    jumpFrame?: JumpFrame;
    callSelector?: string;
    callFunction?: string;
  }> = [{ depth: -1, items: roots }];

  entries.forEach((entry, index) => {
    // Pop frames when we return to a shallower depth.
    // Jump frames at the same depth must NOT be auto-popped —
    // they are exited explicitly (JUMP-out) or by a depth decrease.
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top.depth > entry.depth) { stack.pop(); continue; }
      if (top.depth === entry.depth && !top.isJump) { stack.pop(); continue; }
      break;
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
      // For DELEGATECALL/CALLCODE, children execute the implementation's code
      // but from the proxy's context. Tenderly shows the proxy name for internal
      // functions, so inherit the parent's contractName (proxy) instead of the
      // implementation's contract_name.
      const isDcall = entry.isDelegateCall;
      const frameName = isDcall ? parent.contractName : entry.node.contract_name;
      stack.push({
        depth: entry.depth,
        items: frame.items,
        contractName: frameName,
        callSelector: entry.selector,
        callFunction: (entry.node.function_name || entry.node.decodedFunction?.split('(')[0] || '').toLowerCase(),
      });
      return;
    }

    // JUMP-in with function info → create an expandable jump frame
    if (
      entry.kind === 'opcode' &&
      entry.sourceJump === 'i' &&
      (entry.jumpTargetFunction || entry.jumpTargetLabel)
    ) {
      const jumpFn = (entry.jumpTargetFunction || '').toLowerCase();
      const parentFn = parent.callFunction || '';
      const sameSelector = !!entry.selector && !!parent.callSelector && entry.selector === parent.callSelector;
      const sameFunction = !!jumpFn && !!parentFn && jumpFn === parentFn;

      // Hide duplicate jump frame that mirrors the parent call function body
      // (same selector + function name) to avoid redundant rows.
      if (sameSelector && sameFunction) {
        return;
      }

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
      stack.push({ depth: entry.depth, items: jumpFrame.items, contractName: parent.contractName, isJump: true, jumpFrame });
      return;
    }

    // JUMP-out → explicitly pop the enclosing jump frame and capture return stack
    if (entry.kind === 'opcode' && entry.sourceJump === 'o') {
      if (stack.length > 1 && stack[stack.length - 1].isJump) {
        const top = stack[stack.length - 1];
        if (top.jumpFrame && entry.jumpStack) {
          top.jumpFrame.returnStack = entry.jumpStack;
        }
        stack.pop();
      }
      return;
    }

    // Skip REVERT opcodes — the synthetic revert row in TraceTree handles them
    if (entry.kind === 'opcode' && entry.op === 'REVERT') return;

    if (entry.kind !== 'opcode' || entry.error || VISIBLE_OPCODE_ROWS.has(entry.op)) {
      parent.items.push({
        kind: 'step',
        id: `${entry.kind}-${index}`,
        depth: entry.depth,
        entry,
        contractName: parent.contractName,
      });
    }
  });

  // Absorb first JumpFrame inside DELEGATECALL/CALLCODE frames BEFORE computing
  // gas so that gas values are correct for the final tree structure.
  absorbDelegateJumps(roots);

  // Compute cumulative gas for jump frames (must run after absorption so the
  // tree structure is stable).
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
      total += item.entry.gasCost;
    }
  }
  return total;
}

/**
 * For DELEGATECALL / CALLCODE frames, the first JumpFrame is typically
 * the function selector dispatch — unwrap it so the actual function
 * JumpFrames appear directly as children of the D:CALL frame.
 *
 * contractName updates are NOT needed here: buildTraceTree already
 * propagates the implementation name from the DELEGATECALL frame's
 * contract_name through the stack, matching OpenTracer's approach.
 */
function absorbDelegateJumps(items: TraceItem[]): void {
  for (const item of items) {
    if (item.kind === 'frame') {
      const node = item.entry.node;
      if (node.type === 'DELEGATECALL' || node.type === 'CALLCODE') {
        // Unwrap the first JumpFrame only when it represents the function entry
        // dispatch (i.e. same function as the DELEGATECALL itself, or either
        // name is unknown).  When both names are known and differ, the dedup
        // guard already fired and the first JumpFrame is a real internal call —
        // do NOT absorb it in that case.
        if (item.items.length > 0 && item.items[0].kind === 'jump-frame') {
          const jump = item.items[0] as JumpFrame;
          const dcFn = (node.function_name || node.decodedFunction?.split('(')[0] || '').toLowerCase();
          const jFn  = (jump.entry.jumpTargetFunction || '').toLowerCase();
          const shouldAbsorb = !dcFn || !jFn || dcFn === jFn;
          if (shouldAbsorb) {
            item.items.splice(0, 1, ...jump.items);
          }
        }
      }
      absorbDelegateJumps(item.items);
    } else if (item.kind === 'jump-frame') {
      absorbDelegateJumps(item.items);
    }
  }
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
