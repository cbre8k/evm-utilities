import type { TraceNode } from '@/types/explorer';
import type { TraceItem, JumpFrame } from './callTraceTypes';
import { nodeContractName, nodeFunctionName, short } from './callTraceUtils';

export type GraphNode = {
  id: string;
  label: string;
  address?: string | null;
  contract?: string;
  groupKey: string;
  groupLabel: string;
  count: number;
  children: string[];
  isInternal: boolean;
};

export type GraphEdge = { source: string; target: string; count: number };

const NODE_W = 210;
const NODE_H = 90;
const X_GAP = 120;
const Y_GAP = 40;

export function getCallGraphIdForFrame(
  node: TraceNode,
  addressLabels: Record<string, string>,
  tokenLabels: Record<string, string>,
  tokenAddresses: Set<string>,
  labelFnOnly = false,
): { id: string; label: string; contract: string; address?: string | null; functionName: string } {
  if (!node) {
    return { id: 'call:UnknownContract::unknown', label: 'unknown', contract: 'UnknownContract', address: null, functionName: 'unknown' };
  }
  const contract = nodeContractName(node, addressLabels, tokenLabels, tokenAddresses) || 'UnknownContract';
  const fn = nodeFunctionName(node) || 'unknown';
  const label = labelFnOnly ? fn : `${contract}.${fn}`;
  return { id: `call:${contract}::${fn}`, label, contract, address: node.to ?? node.from, functionName: fn };
}

export function getCallGraphIdForJump(
  frame: JumpFrame,
  addressLabels: Record<string, string>,
  tokenLabels: Record<string, string>,
  tokenAddresses: Set<string>,
  labelFnOnly = false,
): { id: string; label: string; contract: string; address?: string | null; functionName: string } {
  const entry = frame.entry;
  const jumpName = entry.jumpTargetFunction || entry.jumpTargetLabel || entry.op || 'jump';
  const contract = frame.contractName
    || (frame.address ? short(frame.address, addressLabels, tokenLabels, tokenAddresses) : 'UnknownContract')
    || 'UnknownContract';
  const label = labelFnOnly ? jumpName : `${contract}.${jumpName}`;
  return { id: `jump:${contract}::${jumpName}`, label, contract, address: frame.address, functionName: jumpName };
}

export function buildCallGraph(
  traceItems: TraceItem[],
  addressLabels: Record<string, string>,
  tokenLabels: Record<string, string>,
  tokenAddresses: Set<string>,
  options?: {
    includeInternalNodes?: boolean;
    includeInternalEdges?: boolean;
    labelFnOnly?: boolean;
    groupBy?: 'address' | 'contract';
    callTypes?: TraceNode['type'][];
  },
): { nodes: GraphNode[]; edges: GraphEdge[]; order: string[]; itemMap: Map<string, string> } {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const order: string[] = [];
  const itemMap = new Map<string, string>();
  const includeInternalNodes = options?.includeInternalNodes ?? true;
  const includeInternalEdges = options?.includeInternalEdges ?? true;
  const labelFnOnly = options?.labelFnOnly ?? false;
  const groupBy = options?.groupBy ?? 'address';
  const callTypes = options?.callTypes ? new Set(options.callTypes) : null;

  function upsertNode(node: {
    id: string;
    label: string;
    contract?: string;
    address?: string | null;
    groupKey: string;
    groupLabel: string;
    isInternal: boolean;
  }) {
    const existing = nodes.get(node.id);
    if (existing) {
      existing.count += 1;
    } else {
      nodes.set(node.id, {
        id: node.id,
        label: node.label,
        address: node.address ?? null,
        contract: node.contract,
        groupKey: node.groupKey,
        groupLabel: node.groupLabel,
        count: 1,
        children: [],
        isInternal: node.isInternal,
      });
    }
    if (!order.includes(node.id)) order.push(node.id);
  }

  function addEdge(source: string, target: string) {
    const key = `${source}=>${target}`;
    const existing = edges.get(key);
    if (existing) existing.count += 1;
    else edges.set(key, { source, target, count: 1 });
    nodes.get(source)?.children.push(target);
  }

  function walk(items: TraceItem[], parentId?: string) {
    items.forEach((item) => {
      if (item.kind === 'step') return;
      let current: { id: string; label: string; contract?: string; address?: string | null; groupKey: string; groupLabel: string; isInternal: boolean } | null = null;

      if (item.kind === 'frame') {
        if (callTypes && !callTypes.has(item.entry.node.type)) {
          walk(item.items, parentId);
          return;
        }
        const frameNode = getCallGraphIdForFrame(item.entry.node, addressLabels, tokenLabels, tokenAddresses, labelFnOnly);
        const addr = (frameNode.address ?? '').toLowerCase();
        const key = groupBy === 'address' ? (addr || `unknown:${frameNode.contract}`) : frameNode.contract;
        const label = groupBy === 'address'
          ? (frameNode.contract || addr || 'UnknownContract')
          : frameNode.contract;
        current = {
          ...frameNode,
          groupKey: key,
          groupLabel: label,
          isInternal: false,
        };
        itemMap.set(item.id, current.id);
        itemMap.set(item.entry.node.id, current.id);
      } else if (item.kind === 'jump-frame' && includeInternalNodes) {
        const jumpNode = getCallGraphIdForJump(item, addressLabels, tokenLabels, tokenAddresses, labelFnOnly);
        const addr = (jumpNode.address ?? '').toLowerCase();
        // Use the enclosing external call frame's groupKey/label so that jump frames
        // inside DELEGATECALL appear in the proxy's box rather than the implementation's.
        const parentGraphNode = parentId ? nodes.get(parentId) : undefined;
        const key = parentGraphNode?.groupKey
          ?? (groupBy === 'address' ? (addr || `unknown:${jumpNode.contract}`) : jumpNode.contract);
        const label = parentGraphNode?.groupLabel
          ?? (groupBy === 'address' ? (jumpNode.contract || addr || 'UnknownContract') : jumpNode.contract);
        current = {
          ...jumpNode,
          groupKey: key,
          groupLabel: label,
          isInternal: true,
        };
        itemMap.set(item.id, current.id);
      }

      if (current) {
        upsertNode(current);
        if (parentId) {
          const isInternalEdge = item.kind === 'jump-frame';
          if (!isInternalEdge || includeInternalEdges) {
            addEdge(parentId, current.id);
          }
        }
        // Internal (jump-frame) nodes pass their outer parentId down when internal edges
        // are disabled — CALL frames inside jumps stay connected to the external parent.
        const childParentId = (item.kind === 'jump-frame' && !includeInternalEdges) ? parentId : current.id;
        walk(item.items, childParentId);
      } else if (item.kind === 'jump-frame') {
        walk(item.items, parentId);
      }
    });
  }

  walk(traceItems);
  return { nodes: [...nodes.values()], edges: [...edges.values()], order, itemMap };
}
