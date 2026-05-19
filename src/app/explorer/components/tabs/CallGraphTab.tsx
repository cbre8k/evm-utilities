'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Handle, Position, MarkerType, BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';
import type { AddressStateDiff, FilteredStructLog, TraceNode } from '@/types/explorer';
import styles from '../../explorer.module.scss';
import { buildFromStructLog, buildFlatEntries, buildTraceTree } from './callTraceBuild';
import { buildCallGraph, getCallGraphIdForFrame } from './callGraphUtils';
import type { GraphNode } from './callGraphUtils';
import type { TraceItem } from './callTraceTypes';

type Props = {
  root: TraceNode;
  structLog?: FilteredStructLog[];
  allLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>;
  stateDiffs?: AddressStateDiff[];
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  tokenAddresses?: string[];
  selectedNodeId?: string | null;
};

type CallGraphNode = {
  id: string;
  data: {
    label: string;
    address?: string | null;
    contract?: string;
    count: number;
  };
  position: { x: number; y: number };
  type: string;
};

type CallGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  markerEnd?: { type: MarkerType; width?: number; height?: number; color?: string };
  style?: { stroke?: string; strokeWidth?: number; opacity?: number; strokeDasharray?: string };
  data?: { count: number };
};

const NODE_H = 42;
const CHAR_W = 7.2;        // approx px per char at 11px sans-serif
const NODE_PAD_X = 24;     // total horizontal padding inside each function row
const MIN_FN_W = 120;      // minimum function node / contract box width
const CONTRACT_GAP = 48;
const CONTRACT_HEADER = 40;
const CONTRACT_VPAD = 0;
const ROW_GAP = 0;
const DIVIDER_H = 22;      // height of the external/internal section divider


function CallGraphNode({ data, selected }: {
  data: CallGraphNode['data'] & { isInternal?: boolean; callRole?: string };
  selected?: boolean;
}) {
  return (
    <div className={[
      styles.callGraphNode,
      data.isInternal ? styles.callGraphNodeInternal : '',
      data.callRole === 'source' ? styles.callGraphNodeSource : '',
      data.callRole === 'target' ? styles.callGraphNodeTarget : '',
      selected ? styles.callGraphNodeSelected : '',
    ].filter(Boolean).join(' ')}>
      <div className={styles.callGraphTitle}>{data.label}</div>
      <Handle id="target-left"   type="target" position={Position.Left}   style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
      <Handle id="source-right"  type="source" position={Position.Right}  style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
      <Handle id="source-left"   type="source" position={Position.Left}   style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
      <Handle id="target-right"  type="target" position={Position.Right}  style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
      <Handle id="target-top"    type="target" position={Position.Top}    style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
    </div>
  );
}

function ContractGroupNode({ data }: { data: { label: string; count: number } }) {
  return (
    <div className={styles.callGraphGroup}>
      <div className={styles.callGraphGroupHeader}>
        <span>{data.label}</span>
        <span className={styles.callGraphGroupCount}>×{data.count}</span>
      </div>
    </div>
  );
}

// The EOA / wallet that initiated the transaction — always the leftmost node.
function TxSenderNode({ data }: { data: { label: string; callRole?: string } }) {
  return (
    <div className={[
      styles.callGraphNodeSender,
      data.callRole === 'source' ? styles.callGraphNodeSource : '',
    ].filter(Boolean).join(' ')}>
      <div className={styles.callGraphTitle}>{data.label}</div>
      <Handle id="source-right" type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, border: 0 }} />
    </div>
  );
}

function SectionDividerNode() {
  return (
    <div className={styles.callGraphDivider}>
      <span>internal</span>
    </div>
  );
}

// Fund-flow style animated edge: static line + two dots that travel along the path.
// The second dot is offset by half the duration so dots flow continuously.
function AnimatedDotEdge({
  id, sourceX, sourceY, targetX, targetY, markerEnd, style, animated,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const dotColor = (style as { stroke?: string } | undefined)?.stroke ?? '#22d3ee';
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {animated && (
        <>
          <circle r="4" fill={dotColor} fillOpacity="0.9">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <animateMotion dur="1.2s" repeatCount="indefinite" calcMode="linear" {...{ path: edgePath } as any} />
          </circle>
          <circle r="4" fill={dotColor} fillOpacity="0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <animateMotion dur="1.2s" repeatCount="indefinite" calcMode="linear" begin="-0.6s" {...{ path: edgePath } as any} />
          </circle>
        </>
      )}
    </>
  );
}

export default function CallGraphTab({
  root,
  structLog,
  allLogs,
  stateDiffs = [],
  addressLabels = {},
  tokenLabels = {},
  tokenAddresses = [],
  selectedNodeId,
}: Props) {
  const tokenAddressSet = useMemo(
    () => new Set(tokenAddresses.map((address) => address.toLowerCase())),
    [tokenAddresses],
  );

  const traceItems = useMemo(() => {
    if (!root) return [];
    const entries = (structLog && structLog.length > 0)
      ? buildFromStructLog(structLog, root, allLogs)
      : buildFlatEntries(root, stateDiffs);
    return buildTraceTree(entries);
  }, [structLog, root, allLogs, stateDiffs]);

  const { nodes: graphNodes, edges: graphEdges, order, itemMap } = useMemo(
    () => buildCallGraph(traceItems, addressLabels, tokenLabels, tokenAddressSet, {
      includeInternalNodes: true,
      includeInternalEdges: true,
      labelFnOnly: true,
      groupBy: 'address',
      callTypes: ['CALL', 'STATICCALL', 'DELEGATECALL'],
    }),
    [traceItems, addressLabels, tokenLabels, tokenAddressSet],
  );

  const orderedNodeIds = useMemo(() => {
    const nodeIdSet = new Set(graphNodes.map((n) => n.id));
    return order.filter((id) => nodeIdSet.has(id));
  }, [order, graphNodes]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedId = selectedIndex !== null ? orderedNodeIds[selectedIndex] ?? null : null;

  // The graph node ID for the root (entry-point) call — used to wire the sender edge
  // and to resolve the root-call highlight case in graphSelectedEdge.
  const rootGraphId = useMemo(
    () => (root ? itemMap.get(root.id) ?? null : null),
    [root, itemMap],
  );

  const hoveredCallEdge = useMemo(() => {
    if (!selectedNodeId) return null;

    // Build a map: itemKey → parentKey for every frame and jump-frame.
    // TraceStep items (kind='step') have no children or stable key, so skip them.
    const parentByKey = new Map<string, string>();
    const collectParents = (items: TraceItem[], parentKey?: string) => {
      for (const item of items) {
        if (item.kind === 'step') continue;
        const key = item.kind === 'frame' ? item.entry.node.id : item.id;
        if (parentKey !== undefined) parentByKey.set(key, parentKey);
        collectParents(item.items, key);
      }
    };
    collectParents(traceItems);

    // Resolve selected item → graph node id via itemMap.
    const targetGraphId = itemMap.get(selectedNodeId) ?? null;
    if (!targetGraphId) return null;

    const parentKey = parentByKey.get(selectedNodeId);
    if (parentKey === undefined) {
      // Root frame — tx-sender is the implicit source.
      return targetGraphId === rootGraphId ? { source: 'tx-sender', target: targetGraphId } : null;
    }
    const sourceGraphId = itemMap.get(parentKey) ?? null;
    if (!sourceGraphId) return null;
    return { source: sourceGraphId, target: targetGraphId };
  }, [selectedNodeId, traceItems, itemMap, rootGraphId]);

  // Derive edge driven by a call-graph node click (selectedId).
  // If the selected node is internal, resolve to its external sibling's incoming edge.
  // If the root call node is selected (no incoming graphEdge), use tx-sender as the source.
  const graphSelectedEdge = useMemo(() => {
    if (!selectedId) return null;
    const gn = graphNodes.find((n) => n.id === selectedId);
    if (!gn) return null;
    // Determine the external target node to look up.
    let targetId = selectedId;
    if (gn.isInternal) {
      const externalSibling = graphNodes.find((n) => n.groupKey === gn.groupKey && !n.isInternal);
      if (!externalSibling) return null;
      targetId = externalSibling.id;
    }
    const incomingEdge = graphEdges.find((e) => e.target === targetId);
    if (!incomingEdge) {
      // Root call has no incoming graphEdge — tx-sender is the implicit source.
      return rootGraphId === targetId ? { source: 'tx-sender', target: targetId } : null;
    }
    return { source: incomingEdge.source, target: incomingEdge.target };
  }, [selectedId, graphNodes, graphEdges, rootGraphId]);

  // Trace-driven highlighting takes priority; call-graph clicks also drive highlighting.
  const activeEdge = hoveredCallEdge ?? graphSelectedEdge;

  const { nodes, nodeColumn } = useMemo(() => {
    const contractMap = new Map<string, GraphNode[]>();
    graphNodes.forEach((node) => {
      const key = node.groupKey;
      if (!contractMap.has(key)) contractMap.set(key, []);
      contractMap.get(key)!.push(node);
    });

    const contractOrder: string[] = [];
    orderedNodeIds.forEach((nodeId) => {
      const node = graphNodes.find((item) => item.id === nodeId);
      const key = node?.groupKey ?? 'unknown';
      if (!contractOrder.includes(key)) contractOrder.push(key);
    });

    const builtNodes: any[] = [];
    // Maps each function node id → its contract's column index (left-to-right order).
    const colMap = new Map<string, number>();

    // ── Sender node (column 0) ───────────────────────────────────────────────
    // The EOA / wallet that initiated the transaction sits at the far left.
    const senderAddr = (root?.from ?? '').toLowerCase();
    const senderLabel = addressLabels[senderAddr]
      || (senderAddr ? `${senderAddr.slice(0, 6)}…${senderAddr.slice(-4)}` : 'Sender');
    const senderW = Math.max(MIN_FN_W, Math.round(senderLabel.length * CHAR_W) + NODE_PAD_X);
    colMap.set('tx-sender', 0);
    builtNodes.push({
      id: 'tx-sender',
      type: 'txSender',
      data: { label: senderLabel },
      // Vertically align with the first function row of the first contract group.
      position: { x: 0, y: CONTRACT_HEADER },
      style: { width: senderW, height: NODE_H },
    });
    // Contract groups start after the sender node.
    let cursorX = senderW + CONTRACT_GAP;

    contractOrder.forEach((groupKey, colIndex) => {
      const allFns = contractMap.get(groupKey) ?? [];
      if (allFns.length === 0) return;

      // Contracts occupy columns 1+ (column 0 is the sender node).
      allFns.forEach((fn) => colMap.set(fn.id, colIndex + 1));

      const externalFns = allFns
        .filter((fn) => !fn.isInternal)
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
      const internalFns = allFns
        .filter((fn) => fn.isInternal)
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
      const hasBoth = externalFns.length > 0 && internalFns.length > 0;

      const maxLabelLen = allFns.reduce((m, fn) => Math.max(m, fn.label.length), 0);
      const contractWidth = Math.max(MIN_FN_W, Math.round(maxLabelLen * CHAR_W) + NODE_PAD_X);

      const dividerH = hasBoth ? DIVIDER_H : 0;
      const totalFnRows = externalFns.length + internalFns.length;
      const groupHeight = CONTRACT_HEADER + CONTRACT_VPAD * 2 + totalFnRows * NODE_H + dividerH;

      const contractLabel = allFns[0]?.groupLabel ?? 'UnknownContract';
      const contractId = `contract:${groupKey}`;
      const totalCount = allFns.reduce((sum, fn) => sum + fn.count, 0);
      builtNodes.push({
        id: contractId,
        type: 'contractGroup',
        data: { label: contractLabel, count: totalCount },
        position: { x: cursorX, y: 0 },
        style: { width: contractWidth, height: groupHeight },
      });

      externalFns.forEach((fn, index) => {
        const relY = CONTRACT_HEADER + CONTRACT_VPAD + index * (NODE_H + ROW_GAP);
        builtNodes.push({
          id: fn.id,
          data: { label: fn.label, address: fn.address, contract: fn.contract, count: fn.count },
          position: { x: 0, y: relY },
          type: 'callGraphNode',
          parentId: contractId,
          extent: 'parent',
          style: { width: contractWidth, height: NODE_H },
        });
      });

      if (hasBoth) {
        const dividerY = CONTRACT_HEADER + CONTRACT_VPAD + externalFns.length * (NODE_H + ROW_GAP);
        builtNodes.push({
          id: `divider:${groupKey}`,
          type: 'sectionDivider',
          data: {},
          position: { x: 0, y: dividerY },
          parentId: contractId,
          extent: 'parent',
          style: { width: contractWidth, height: DIVIDER_H },
          selectable: false,
          draggable: false,
        });
      }

      internalFns.forEach((fn, index) => {
        const relY = CONTRACT_HEADER + CONTRACT_VPAD + externalFns.length * (NODE_H + ROW_GAP) + dividerH + index * (NODE_H + ROW_GAP);
        builtNodes.push({
          id: fn.id,
          data: { label: fn.label, address: fn.address, contract: fn.contract, count: fn.count, isInternal: true },
          position: { x: 0, y: relY },
          type: 'callGraphNode',
          parentId: contractId,
          extent: 'parent',
          style: { width: contractWidth, height: NODE_H },
        });
      });

      cursorX += contractWidth + CONTRACT_GAP;
    });

    return { nodes: builtNodes, nodeColumn: colMap };
  }, [graphNodes, orderedNodeIds, root, addressLabels]);

  // Overlay callRole ('source' | 'target') onto node data based on the active call edge.
  // Internal nodes that share a groupKey with the source/target contract are also highlighted,
  // so clicking a jump-frame child of the targeted external function retains the target colour.
  const displayNodes = useMemo(() => {
    if (!activeEdge) return nodes;
    const { source, target } = activeEdge;
    const gnById = new Map(graphNodes.map((n) => [n.id, n]));
    const sourceGroupKey = gnById.get(source)?.groupKey ?? null;
    const targetGroupKey = gnById.get(target)?.groupKey ?? null;
    return nodes.map((n) => {
      // Highlight the tx-sender node when it is the source of the active edge.
      if (n.id === 'tx-sender') {
        return source === 'tx-sender'
          ? { ...n, data: { ...n.data, callRole: 'source' } }
          : n;
      }
      if (n.type !== 'callGraphNode') return n;
      const gn = gnById.get(n.id as string);
      if (!gn) return n;
      const callRole =
        n.id === target || (gn.isInternal && gn.groupKey === targetGroupKey) ? 'target'
          : n.id === source || (gn.isInternal && gn.groupKey === sourceGroupKey) ? 'source'
            : '';
      if (!callRole) return n;
      return { ...n, data: { ...n.data, callRole } };
    });
  }, [nodes, activeEdge, graphNodes]);

  const edges: CallGraphEdge[] = useMemo(() => {
    const isSenderEdgeActive = activeEdge?.source === 'tx-sender';
    const hasHoveredContext = !!activeEdge;
    const gnById = new Map(graphNodes.map((n) => [n.id, n]));

    const result: CallGraphEdge[] = graphEdges.map((edge) => {
      const isHoveredEdge = activeEdge && activeEdge.source === edge.source && activeEdge.target === edge.target;
      const srcGn = gnById.get(edge.source);
      const tgtGn = gnById.get(edge.target);
      // Internal edges connect an external call node to an internal (jump-frame) node
      // within the same contract group — render them vertically (top → bottom).
      const isInternalEdge = !!srcGn && !!tgtGn && srcGn.groupKey === tgtGn.groupKey;
      let sourceHandle: string;
      let targetHandle: string;
      if (isInternalEdge) {
        sourceHandle = 'source-bottom';
        targetHandle = 'target-top';
      } else {
        const srcCol = nodeColumn.get(edge.source) ?? 0;
        const tgtCol = nodeColumn.get(edge.target) ?? 0;
        const rightward = srcCol <= tgtCol;
        sourceHandle = rightward ? 'source-right' : 'source-left';
        targetHandle = rightward ? 'target-left'  : 'target-right';
      }
      return {
        id: `${edge.source}=>${edge.target}`,
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle,
        type: 'animatedDot',
        data: { count: edge.count },
        animated: !!isHoveredEdge,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: isHoveredEdge ? '#22d3ee' : isInternalEdge ? '#64748b' : '#8b97aa',
        },
        style: {
          stroke: isHoveredEdge ? '#22d3ee' : isInternalEdge ? '#64748b' : '#8b97aa',
          strokeWidth: isHoveredEdge ? 2 : 1.4,
          strokeDasharray: isInternalEdge ? '4 3' : undefined,
          opacity: hasHoveredContext ? (isHoveredEdge ? 1 : 0.18) : isInternalEdge ? 0.65 : 0.9,
        },
      };
    });

    // Synthetic edge: tx-sender → root call entry point.
    if (rootGraphId) {
      const isActive = isSenderEdgeActive && activeEdge?.target === rootGraphId;
      result.push({
        id: `tx-sender=>${rootGraphId}`,
        source: 'tx-sender',
        target: rootGraphId,
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
        type: 'animatedDot',
        animated: isActive,
        data: { count: 1 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: isActive ? '#22d3ee' : '#374151',
        },
        style: {
          stroke: isActive ? '#22d3ee' : '#374151',
          strokeWidth: isActive ? 2 : 1.2,
          opacity: hasHoveredContext ? (isActive ? 1 : 0.18) : 0.7,
        },
      });
    }

    return result;
  }, [graphEdges, activeEdge, nodeColumn, rootGraphId, graphNodes]);

  const onNodeClick = useCallback((_: any, node: CallGraphNode) => {
    const idx = orderedNodeIds.findIndex((item) => item === node.id);
    setSelectedIndex(idx >= 0 ? idx : null);
  }, [orderedNodeIds]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (orderedNodeIds.length === 0) return;
      if (e.key === 'Escape') {
        setSelectedIndex(null);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex((current) => {
          if (current === null) return orderedNodeIds.length - 1;
          return Math.max(0, current - 1);
        });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex((current) => {
          if (current === null) return 0;
          return Math.min(orderedNodeIds.length - 1, current + 1);
        });
      }
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [orderedNodeIds]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const mapped = itemMap.get(selectedNodeId) ?? null;
    if (!mapped) {
      setSelectedIndex(null);
      return;
    }
    const idx = orderedNodeIds.findIndex((item) => item === mapped);
    if (idx >= 0) setSelectedIndex(idx);
    else setSelectedIndex(null);
  }, [selectedNodeId, itemMap, orderedNodeIds]);


  // Derive display info for the step indicator bar.
  const selectedNodeInfo = useMemo(() => {
    if (selectedId === null) return null;
    const gn = graphNodes.find((n) => n.id === selectedId);
    if (!gn) return null;
    // Find sender via the edge active when this node is selected.
    const senderGn = graphSelectedEdge ? graphNodes.find((n) => n.id === graphSelectedEdge.source) : null;
    return {
      contract: gn.groupLabel,
      fn: gn.label,
      isInternal: gn.isInternal,
      step: (selectedIndex ?? 0) + 1,
      total: orderedNodeIds.length,
      senderContract: senderGn?.groupLabel ?? null,
      senderFn: senderGn?.label ?? null,
    };
  }, [selectedId, graphNodes, selectedIndex, orderedNodeIds, graphSelectedEdge]);

  if (!root) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}><span>■ CALL GRAPH</span></div>
          <div className={styles.emptyHint} style={{ padding: 16 }}>No call trace available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.callGraphPanel}>
      <div className={styles.callGraphStatus}>
        <span className={styles.callGraphStatusStep}>
          {selectedNodeInfo ? `${selectedNodeInfo.step} / ${selectedNodeInfo.total}` : `— / ${orderedNodeIds.length}`}
        </span>
        {selectedNodeInfo ? (
          <>
            {selectedNodeInfo.senderContract && (
              <>
                <span className={styles.callGraphStatusFromContract}>{selectedNodeInfo.senderContract}</span>
                <span className={styles.callGraphStatusSep}>·</span>
                <span className={styles.callGraphStatusFromFn}>{selectedNodeInfo.senderFn}</span>
                <span className={styles.callGraphStatusArrow}>→</span>
              </>
            )}
            <span className={styles.callGraphStatusContract}>{selectedNodeInfo.contract}</span>
            <span className={styles.callGraphStatusSep}>·</span>
            <span className={styles.callGraphStatusFn}>{selectedNodeInfo.fn}</span>
            {selectedNodeInfo.isInternal && (
              <span className={styles.callGraphStatusBadge}>internal</span>
            )}
          </>
        ) : (
          <span className={styles.callGraphStatusHint}>select a node</span>
        )}
      </div>
      <div className={styles.callGraphLayout}>
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={{
            contractGroup: ContractGroupNode,
            sectionDivider: SectionDividerNode,
            txSender: TxSenderNode,
            callGraphNode: (props) => (
              <CallGraphNode
                {...props}
                selected={props.id === selectedId}
              />
            ),
          }}
          edgeTypes={{
            animatedDot: AnimatedDotEdge,
          }}
          onNodeClick={onNodeClick}
          onInit={(instance) => {
            setTimeout(() => instance.fitView({ padding: 0.14 }), 50);
          }}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
