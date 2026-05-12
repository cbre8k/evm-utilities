'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  Handle,
  Position,
  MarkerType,
  EdgeLabelRenderer,
  BaseEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  NativeTransfer,
  ERC20Transfer,
  ERC721Transfer,
  ERC1155Transfer,
  TenderlyAssetChange,
  TenderlyExposureChange,
  TenderlyBalanceChange,
} from '@/types/explorer';
import { copyWithFirework } from '@/utils/copyAnimation';
import styles from '../../explorer.module.scss';

interface Props {
  nativeTransfers: NativeTransfer[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
  assetChanges?: TenderlyAssetChange[];
  exposureChanges?: TenderlyExposureChange[];
  balanceChanges?: TenderlyBalanceChange[];
  tokenLabels?: Record<string, string>;
  addressLabels?: Record<string, string>;
  txSender?: string;
}

function shortAddr(v: string | null | undefined) {
  if (!v) return '—';
  return `${v.slice(0, 8)}…${v.slice(-6)}`;
}

function formatDecimal(raw: string, decimals: number): string {
  try {
    const scale = 10n ** BigInt(decimals);
    const value = BigInt(raw);
    const whole = value / scale;
    const frac = (value % scale).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch { return raw; }
}

function tokenAmount(change: TenderlyAssetChange | TenderlyExposureChange) {
  const decimals = change.token_info?.decimals ?? 18;
  // Always try raw_amount first for precise decimal conversion
  if (change.raw_amount) return formatDecimal(change.raw_amount, decimals);
  // Fallback: if amount looks like a raw integer and we have decimals, convert it
  const amount = change.amount;
  if (!amount) return '—';
  if (decimals > 0 && /^\d+$/.test(amount) && amount.length > 6) {
    return formatDecimal(amount, decimals);
  }
  return amount;
}

const EDGE_COLORS = [
  'hsl(12, 74%, 46%)',
  'hsl(210, 70%, 50%)',
  'hsl(314, 70%, 48%)',
  'hsl(48, 74%, 46%)',
  'hsl(150, 60%, 40%)',
  'hsl(270, 60%, 55%)',
  'hsl(30, 80%, 50%)',
  'hsl(180, 60%, 40%)',
];

// Max parallel edges per pair — determines how many handles we create
const MAX_HANDLES: number = 6;

type FlowEdgeData = {
  color?: string;
  stepNum?: number;
  amount?: string;
  symbol?: string;
  routeY?: number;
  items?: { stepNum: number; amount: string; symbol: string; color: string }[];
};

// ── Custom Node ──
function AddressNode({ data }: NodeProps) {
  const d = data as {
    address: string; label: string; isSender?: boolean; isContract?: boolean; logo?: string;
  };

  // Generate handles on both sides for forward and back edges
  // Right side: s-{i} (source), tr-{i} (target for back-edges)
  // Left side:  t-{i} (target), sl-{i} (source for back-edges)
  const handles = [];
  for (let i = 0; i < MAX_HANDLES; i++) {
    const pct = MAX_HANDLES === 1 ? 50 : 15 + (i * 70) / (MAX_HANDLES - 1);
    handles.push(
      <Handle key={`t-${i}`} type="target" position={Position.Left} id={`t-${i}`}
        style={{ top: `${pct}%`, opacity: 0 }} />,
      <Handle key={`s-${i}`} type="source" position={Position.Right} id={`s-${i}`}
        style={{ top: `${pct}%`, opacity: 0 }} />,
      <Handle key={`sl-${i}`} type="source" position={Position.Left} id={`sl-${i}`}
        style={{ top: `${pct}%`, opacity: 0 }} />,
      <Handle key={`tr-${i}`} type="target" position={Position.Right} id={`tr-${i}`}
        style={{ top: `${pct}%`, opacity: 0 }} />,
    );
  }

  return (
    <div className={styles.ffNode}>
      {d.isSender && <div className={styles.ffNodeBadge}>Sender</div>}
      {handles}
      <div className={styles.ffNodeInner}>
        <div className={styles.ffNodeIcon}>
          {d.logo
            ? <img src={d.logo} width={16} height={16} alt="" />
            : d.isContract
              ? <span style={{ fontSize: 10 }}>📄</span>
              : <span style={{ fontSize: 10 }}>👛</span>
          }
        </div>
        <div className={styles.ffNodeInfo}>
          <div className={styles.ffNodeLabel}>{d.label}</div>
          <div className={styles.ffNodeAddr} onClick={() => copyWithFirework(d.address)} title={d.address}>
            {shortAddr(d.address)}
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { addressNode: AddressNode };

// ── Custom Edge with HTML label ──
function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd, data } = props;
  const d = data as FlowEdgeData;
  const dotColor = d?.color || 'var(--accent-primary)';
  const leftX = Math.min(sourceX, targetX);
  const rightX = Math.max(sourceX, targetX);
  const direction = sourceX <= targetX ? 1 : -1;
  const routeY = d?.routeY ?? (sourceY + targetY) / 2;
  const labelX = (sourceX + targetX) / 2;
  const labelY = routeY;
  const availableX = Math.max(1, rightX - leftX);
  const edgeGap = Math.min(56, Math.max(20, availableX * 0.16));
  const minX = leftX + edgeGap;
  const maxX = rightX - edgeGap;
  const p1Base = sourceX + direction * availableX * 0.25;
  const p4Base = sourceX + direction * availableX * 0.75;
  const p1X = sourceX <= targetX
    ? Math.min(Math.max(p1Base, minX), maxX)
    : Math.max(Math.min(p1Base, maxX), minX);
  const p4X = sourceX <= targetX
    ? Math.min(Math.max(p4Base, minX), maxX)
    : Math.max(Math.min(p4Base, maxX), minX);
  const canBeStraight = Math.abs(sourceY - targetY) < 1 && Math.abs(routeY - sourceY) < 1;
  const edgePath = canBeStraight
    ? `M ${sourceX},${sourceY} L ${targetX},${targetY}`
    : [
        `M ${sourceX},${sourceY}`,
        `C ${p1X},${sourceY} ${p1X},${routeY} ${labelX},${routeY}`,
        `C ${p4X},${routeY} ${p4X},${targetY} ${targetX},${targetY}`,
      ].join(' ');
  const labelItems = d?.items?.length
    ? d.items
    : [{ stepNum: d?.stepNum ?? 0, amount: d?.amount ?? '', symbol: d?.symbol ?? '', color: dotColor }];

  return (
    <>
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <path
        className="ffDot"
        d={edgePath}
        fill="none"
        stroke={dotColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1 40"
      />
      <EdgeLabelRenderer>
        <div
          className="ffEdgeLabel"
          data-edge-id={id}
          data-step={d?.stepNum}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--bg-primary)',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
            maxWidth: 360,
            overflowX: 'auto',
          }}
        >
          {labelItems.map((item) => (
            <span key={item.stepNum} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                className={`ffStep ffStep-${item.stepNum}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'var(--text-tertiary)',
                  transition: 'all 0.15s',
                }}
              >{item.stepNum + 1}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)'}}>{item.amount}</span>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 10 }}>{item.symbol}</span>
            </span>
          ))}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { flowEdge: FlowEdge };

// ── Layout: step-based column assignment ──
// Each transfer step places its source and target in successive columns,
// ensuring a strict left-to-right flow that follows transfer order.
function layeredLayout(
  addresses: string[],
  transfers: { from: string; to: string }[],
): Record<string, { col: number; row: number }> {
  const colOf = new Map<string, number>();

  // Assign columns by processing transfers in order.
  // Each transfer's "from" gets a column if not yet assigned,
  // then "to" is placed at least one column to the right of "from".
  for (const t of transfers) {
    if (!colOf.has(t.from)) {
      // New source node: place in column 0 or find a suitable column
      colOf.set(t.from, 0);
    }
    const fromCol = colOf.get(t.from)!;
    const existing = colOf.get(t.to);
    if (existing === undefined) {
      // New target node: always one column right of its source
      colOf.set(t.to, fromCol + 1);
    } else if (existing <= fromCol) {
      // Target already placed but at same or earlier column — it's a back-edge, keep it
      // Don't move it, the back-edge rendering handles this
    }
  }

  // Assign any unvisited addresses
  for (const a of addresses) {
    if (!colOf.has(a)) colOf.set(a, 0);
  }

  // Group by column
  const colGroups = new Map<number, string[]>();
  for (const a of addresses) {
    const c = colOf.get(a)!;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c)!.push(a);
  }

  // Build adjacency for barycenter ordering
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const a of addresses) {
    outgoing.set(a, new Set());
    incoming.set(a, new Set());
  }
  for (const t of transfers) {
    outgoing.get(t.from)?.add(t.to);
    incoming.get(t.to)?.add(t.from);
  }

  // Initial row assignment: order by first appearance in transfers
  const firstAppearance = new Map<string, number>();
  transfers.forEach((t, i) => {
    if (!firstAppearance.has(t.from)) firstAppearance.set(t.from, i);
    if (!firstAppearance.has(t.to)) firstAppearance.set(t.to, i);
  });
  for (const [, addrs] of colGroups) {
    addrs.sort((a, b) => (firstAppearance.get(a) ?? 0) - (firstAppearance.get(b) ?? 0));
  }

  // Assign initial row positions
  const rowOf = new Map<string, number>();
  for (const [, addrs] of colGroups) {
    addrs.forEach((a, i) => rowOf.set(a, i));
  }

  // Barycenter heuristic: sweep to minimize crossings
  const sortedCols = [...colGroups.keys()].sort((a, b) => a - b);
  for (let sweep = 0; sweep < 4; sweep++) {
    const cols = sweep % 2 === 0 ? sortedCols : [...sortedCols].reverse();
    for (const col of cols) {
      const addrs = colGroups.get(col)!;
      const bary = new Map<string, number>();
      for (const a of addrs) {
        const neighbors: number[] = [];
        for (const n of outgoing.get(a) ?? []) {
          if (rowOf.has(n)) neighbors.push(rowOf.get(n)!);
        }
        for (const n of incoming.get(a) ?? []) {
          if (rowOf.has(n)) neighbors.push(rowOf.get(n)!);
        }
        if (neighbors.length > 0) {
          bary.set(a, neighbors.reduce((s, v) => s + v, 0) / neighbors.length);
        } else {
          bary.set(a, rowOf.get(a) ?? 0);
        }
      }
      addrs.sort((a, b) => bary.get(a)! - bary.get(b)!);
      addrs.forEach((a, i) => rowOf.set(a, i));
    }
  }

  const positions: Record<string, { col: number; row: number }> = {};
  for (const a of addresses) {
    positions[a] = { col: colOf.get(a)!, row: rowOf.get(a)! };
  }
  return positions;
}

// ── Build graph ──
type Transfer = {
  from: string; to: string; label: string; symbol: string;
  amount: string; tokenName?: string; tokenLogo?: string; dollarValue?: string;
  type: string; // 'Transfer' | 'Mint' | 'Burn' etc.
};

type NodeRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function handleRatio(handleId: string | null | undefined) {
  if (!handleId) return 0.5;
  const index = Number(handleId.split('-')[1]);
  if (!Number.isFinite(index)) return 0.5;
  const pct = MAX_HANDLES === 1 ? 50 : 15 + (Math.min(index, MAX_HANDLES - 1) * 70) / (MAX_HANDLES - 1);
  return pct / 100;
}

/** Sample the full double-cubic Bezier path at N points and check if ANY sample hits a node rect. */
function curveCrossesNode(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  routeY: number,
  rects: NodeRect[], clearance: number,
) {
  // Reproduce the same control-point math used by FlowEdge
  const leftX = Math.min(sourceX, targetX);
  const rightX = Math.max(sourceX, targetX);
  const direction = sourceX <= targetX ? 1 : -1;
  const availableX = Math.max(1, rightX - leftX);
  const edgeGap = Math.min(56, Math.max(20, availableX * 0.16));
  const minX = leftX + edgeGap;
  const maxX = rightX - edgeGap;
  const p1Base = sourceX + direction * availableX * 0.25;
  const p4Base = sourceX + direction * availableX * 0.75;
  const p1X = sourceX <= targetX
    ? Math.min(Math.max(p1Base, minX), maxX)
    : Math.max(Math.min(p1Base, maxX), minX);
  const p4X = sourceX <= targetX
    ? Math.min(Math.max(p4Base, minX), maxX)
    : Math.max(Math.min(p4Base, maxX), minX);
  const midX = (sourceX + targetX) / 2;

  // Sample both cubic segments (source→mid, mid→target)
  const SAMPLES = 12;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const it = 1 - t;
    // First cubic: (sourceX,sourceY) → ctrl(p1X,sourceY) → ctrl(p1X,routeY) → (midX,routeY)
    const x1 = it * it * it * sourceX + 3 * it * it * t * p1X + 3 * it * t * t * p1X + t * t * t * midX;
    const y1 = it * it * it * sourceY + 3 * it * it * t * sourceY + 3 * it * t * t * routeY + t * t * t * routeY;
    // Second cubic: (midX,routeY) → ctrl(p4X,routeY) → ctrl(p4X,targetY) → (targetX,targetY)
    const x2 = it * it * it * midX + 3 * it * it * t * p4X + 3 * it * t * t * p4X + t * t * t * targetX;
    const y2 = it * it * it * routeY + 3 * it * it * t * routeY + 3 * it * t * t * targetY + t * t * t * targetY;

    for (const rect of rects) {
      if (
        x1 > rect.left - clearance && x1 < rect.right + clearance &&
        y1 > rect.top - clearance && y1 < rect.bottom + clearance
      ) return true;
      if (
        x2 > rect.left - clearance && x2 < rect.right + clearance &&
        y2 > rect.top - clearance && y2 < rect.bottom + clearance
      ) return true;
    }
  }
  return false;
}

function edgeRouteY(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  blockerRects: NodeRect[],
  edgeIndex: number,
) {
  const directY = (sourceY + targetY) / 2;
  const clearance = 40;
  if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, directY, blockerRects, clearance)) return directY;

  const laneStep = 50;
  const sideFirst = edgeIndex % 2 === 0 ? -1 : 1;
  for (let lane = 1; lane <= 14; lane++) {
    const first = directY + sideFirst * lane * laneStep;
    if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, first, blockerRects, clearance)) return first;

    const second = directY - sideFirst * lane * laneStep;
    if (!curveCrossesNode(sourceX, sourceY, targetX, targetY, second, blockerRects, clearance)) return second;
  }

  const leftX = Math.min(sourceX, targetX);
  const rightX = Math.max(sourceX, targetX);
  const crossingRects = blockerRects.filter((rect) => rect.left - clearance < rightX && rect.right + clearance > leftX);
  if (crossingRects.length === 0) return directY;

  const above = Math.min(...crossingRects.map(rect => rect.top)) - clearance - 30;
  const below = Math.max(...crossingRects.map(rect => rect.bottom)) + clearance + 30;
  return Math.abs(above - directY) <= Math.abs(below - directY) ? above : below;
}

function collectTransfers(props: Props): Transfer[] {
  const { nativeTransfers, erc20Transfers, erc721Transfers, erc1155Transfers, assetChanges = [], tokenLabels = {} } = props;
  const transfers: Transfer[] = [];

  if (assetChanges.length > 0) {
    const sorted = [...assetChanges].sort((a, b) => (a.trace_absolute_position ?? 0) - (b.trace_absolute_position ?? 0));
    for (const c of sorted) {
      const sym = c.token_info?.symbol || (c.token_info?.contract_address ? tokenLabels[c.token_info.contract_address.toLowerCase()] : undefined) || 'TOKEN';
      const amt = tokenAmount(c);
      const from = c.from?.toLowerCase() || '0x0000000000000000000000000000000000000000';
      const to = c.to?.toLowerCase() || '0x0000000000000000000000000000000000000000';
      transfers.push({
        from, to, label: `${amt} ${sym}`, symbol: sym,
        amount: amt, tokenName: c.token_info?.name, tokenLogo: c.token_info?.logo,
        dollarValue: c.dollar_value, type: c.type,
      });
    }
  } else {
    for (const t of nativeTransfers) {
      if (!t.to) continue;
      const val = (() => { try { return Number(BigInt(t.value)) / 1e18; } catch { return 0; } })();
      if (val === 0) continue;
      transfers.push({ from: t.from.toLowerCase(), to: t.to.toLowerCase(), label: `${val.toFixed(4)} ETH`, symbol: 'ETH', amount: val.toFixed(4), type: 'Transfer' });
    }
    for (const t of erc20Transfers) {
      const sym = t.symbol || tokenLabels[t.tokenAddress.toLowerCase()] || 'ERC20';
      const dec = t.decimals ?? 18;
      const amt = formatDecimal(t.amount, dec);
      transfers.push({ from: t.from.toLowerCase(), to: t.to.toLowerCase(), label: `${amt} ${sym}`, symbol: sym, amount: amt, type: t.type || 'Transfer' });
    }
    for (const t of erc721Transfers) {
      transfers.push({ from: t.from.toLowerCase(), to: t.to.toLowerCase(), label: `NFT #${t.tokenId}`, symbol: 'NFT', amount: `#${t.tokenId}`, type: 'Transfer' });
    }
    for (const t of erc1155Transfers) {
      transfers.push({ from: t.from.toLowerCase(), to: t.to.toLowerCase(), label: t.isBatch ? 'ERC-1155 Batch' : `#${t.id}`, symbol: 'ERC1155', amount: t.isBatch ? 'Batch' : `#${t.id}`, type: 'Transfer' });
    }
  }
  return transfers;
}

function buildGraph(
  props: Props,
): { nodes: Node[]; edges: Edge[]; transfers: Transfer[]; addressLabels: Record<string, string>; symbolColors: Record<string, string>; stepEdgeIds: string[] } {
  const { assetChanges = [], tokenLabels = {}, addressLabels: propAddressLabels = {} } = props;
  const transfers = collectTransfers(props);
  if (transfers.length === 0) return { nodes: [], edges: [], transfers, addressLabels: {}, symbolColors: {}, stepEdgeIds: [] };

  // Unique addresses in order
  const addressOrder: string[] = [];
  const seen = new Set<string>();
  for (const t of transfers) {
    if (!seen.has(t.from)) { seen.add(t.from); addressOrder.push(t.from); }
    if (!seen.has(t.to)) { seen.add(t.to); addressOrder.push(t.to); }
  }

  // Labels & logos — start with parent-provided addressLabels
  const addressLabels: Record<string, string> = {};
  const addressLogos: Record<string, string> = {};

  // 1. Copy in parent addressLabels (contract names from trace)
  for (const [addr, label] of Object.entries(propAddressLabels)) {
    addressLabels[addr.toLowerCase()] = label;
  }

  // 2. Copy in tokenLabels
  for (const [addr, label] of Object.entries(tokenLabels)) {
    if (!addressLabels[addr.toLowerCase()]) addressLabels[addr.toLowerCase()] = label;
  }

  // 3. Enrich from asset changes (token_info names & logos)
  for (const c of assetChanges) {
    if (c.token_info?.contract_address) {
      const a = c.token_info.contract_address.toLowerCase();
      if (c.token_info.name && !addressLabels[a]) addressLabels[a] = c.token_info.name;
      if (c.token_info.logo && !addressLogos[a]) addressLogos[a] = c.token_info.logo;
    }
  }

  // Symbol → color
  const symbolSet = [...new Set(transfers.map(t => t.symbol))];
  const symbolColors: Record<string, string> = {};
  symbolSet.forEach((s, i) => { symbolColors[s] = EDGE_COLORS[i % EDGE_COLORS.length]; });

  const senderAddr = props.txSender?.toLowerCase() || transfers[0]?.from;
  const contractAddrs = new Set<string>();
  for (const c of assetChanges) {
    if (c.token_info?.contract_address) contractAddrs.add(c.token_info.contract_address.toLowerCase());
  }

  // ── Layered layout (BFS columns, no overlap) ──
  const NODE_W = 260;
  const NODE_H = 70;
  const GAP_X = 240;
  const GAP_Y = 120;

  const positions = layeredLayout(addressOrder, transfers);

  // Center rows within each column
  const colGroups = new Map<number, string[]>();
  for (const a of addressOrder) {
    const { col } = positions[a];
    if (!colGroups.has(col)) colGroups.set(col, []);
    colGroups.get(col)!.push(a);
  }
  const maxRows = Math.max(...[...colGroups.values()].map(g => g.length));
  for (const [, addrs] of colGroups) {
    const offset = (maxRows - addrs.length) / 2;
    addrs.forEach((a, i) => { positions[a].row = i + offset; });
  }

  const nodes: Node[] = addressOrder.map((addr) => {
    const { col, row } = positions[addr];
    return {
      id: addr,
      type: 'addressNode',
      position: { x: col * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) },
      data: {
        address: addr,
        label: addressLabels[addr] || tokenLabels[addr] || shortAddr(addr),
        isSender: addr === senderAddr,
        isContract: contractAddrs.has(addr),
        logo: addressLogos[addr],
      },
      style: { width: NODE_W, transition: 'opacity 0.2s' },
    };
  });
  const nodeRects: NodeRect[] = nodes.map((node) => ({
    id: node.id,
    left: node.position.x,
    right: node.position.x + NODE_W,
    top: node.position.y,
    bottom: node.position.y + NODE_H,
  }));
  const nodeById = new Map(nodes.map(node => [node.id, node]));

  // ── Edges: one rendered line per address pair ──
  const groupedTransfers = new Map<string, { from: string; to: string; steps: number[] }>();
  transfers.forEach((t, i) => {
    const key = `${t.from}->${t.to}`;
    const group = groupedTransfers.get(key);
    if (group) {
      group.steps.push(i);
    } else {
      groupedTransfers.set(key, { from: t.from, to: t.to, steps: [i] });
    }
  });

  const stepEdgeIds = Array.from<string>({ length: transfers.length });

  // Track how many edges connect from/to each node to distribute handles
  const nodeSourceCount = new Map<string, number>();
  const nodeTargetCount = new Map<string, number>();

  const edges: Edge[] = [...groupedTransfers.values()].map((group, groupIndex) => {
    const firstStep = group.steps[0];
    const firstTransfer = transfers[firstStep];
    const edgeId = `e-${firstStep}`;

    // Distribute handles so multiple edges from/to the same node don't overlap
    const sIdx = nodeSourceCount.get(group.from) ?? 0;
    const tIdx = nodeTargetCount.get(group.to) ?? 0;
    nodeSourceCount.set(group.from, sIdx + 1);
    nodeTargetCount.set(group.to, tIdx + 1);

    const color = symbolColors[firstTransfer.symbol];
    const sourceNode = nodeById.get(group.from);
    const targetNode = nodeById.get(group.to);

    // Determine if this is a back-edge (target is left of or same column as source)
    const srcX = sourceNode ? sourceNode.position.x : 0;
    const tgtX = targetNode ? targetNode.position.x : srcX + NODE_W + GAP_X;
    const isBackEdge = tgtX <= srcX;

    // For forward edges: source right (s-*) → target left (t-*)
    // For back edges: source left (sl-*) → target right (tr-*)
    let sourceX: number, targetX: number;
    let sHandle: string, tHandle: string;
    if (isBackEdge) {
      sourceX = sourceNode ? sourceNode.position.x : 0;               // left side
      targetX = targetNode ? targetNode.position.x + NODE_W : srcX;    // right side
      sHandle = `sl-${Math.min(sIdx, MAX_HANDLES - 1)}`;
      tHandle = `tr-${Math.min(tIdx, MAX_HANDLES - 1)}`;
    } else {
      sourceX = sourceNode ? sourceNode.position.x + NODE_W : 0;      // right side
      targetX = targetNode ? targetNode.position.x : sourceX + GAP_X;  // left side
      sHandle = `s-${Math.min(sIdx, MAX_HANDLES - 1)}`;
      tHandle = `t-${Math.min(tIdx, MAX_HANDLES - 1)}`;
    }

    const sourceY = sourceNode ? sourceNode.position.y + NODE_H * handleRatio(sHandle) : 0;
    const targetY = targetNode ? targetNode.position.y + NODE_H * handleRatio(tHandle) : sourceY;
    const blockerRects = nodeRects.filter(rect => rect.id !== group.from && rect.id !== group.to);
    const routeY = edgeRouteY(sourceX, sourceY, targetX, targetY, blockerRects, groupIndex);
    const items = group.steps.map((stepNum) => {
      const transfer = transfers[stepNum];
      stepEdgeIds[stepNum] = edgeId;
      return {
        stepNum,
        amount: transfer.amount,
        symbol: transfer.symbol,
        color: symbolColors[transfer.symbol],
      };
    });

    return {
      id: edgeId,
      source: group.from,
      target: group.to,
      sourceHandle: sHandle,
      targetHandle: tHandle,
      type: 'flowEdge',
      zIndex: 1,
      style: {
        stroke: color,
        strokeWidth: 1,
        transition: 'opacity 0.2s, stroke-width 0.2s',
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      data: {
        color,
        stepNum: firstStep,
        amount: firstTransfer.amount,
        symbol: firstTransfer.symbol,
        routeY,
        items,
      },
    };
  });

  return { nodes, edges, transfers, addressLabels, symbolColors, stepEdgeIds };
}

// ── Step Detail Sidebar ──
function StepDetail({
  step, total, transfer, addressLabels, tokenLabels,
  onClose, onPrev, onNext,
}: {
  step: number; total: number; transfer: Transfer;
  addressLabels: Record<string, string>; tokenLabels: Record<string, string>;
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  const fromLabel = addressLabels[transfer.from] || tokenLabels[transfer.from] || shortAddr(transfer.from);
  const toLabel = addressLabels[transfer.to] || tokenLabels[transfer.to] || shortAddr(transfer.to);
  const isBurn = transfer.type.toLowerCase() === 'burn';
  const isMint = transfer.type.toLowerCase() === 'mint';

  return (
    <div className={styles.ffSidebar}>
      <div className={styles.ffSidebarHeader}>
        <span className={styles.ffSidebarTitle}>Transfers</span>
        <button className={styles.ffSidebarClose} onClick={onClose} aria-label="Close sidebar">✕</button>
      </div>
      <div className={styles.ffSidebarBody}>
        {/* Step badge */}
        <div className={styles.ffStepBadge}>
          <span>Step {step + 1}</span>
          {isBurn && <span title="Burn">🔥</span>}
          {isMint && <span title="Mint">✨</span>}
        </div>

        {/* From address */}
        <div className={styles.ffStepAddr} onClick={() => copyWithFirework(transfer.from)} title={transfer.from}>
          <span className={styles.ffStepAddrIcon}>{isMint ? '✦' : '↑'}</span>
          <span className={styles.ffStepAddrName}>{isMint ? 'Mint' : fromLabel}</span>
        </div>

        {/* Connector */}
        <div className={styles.ffStepConnector}>↓</div>

        {/* Transfer amount */}
        <div className={styles.ffStepTransfer}>
          {transfer.tokenLogo && (
            <img src={transfer.tokenLogo} width={22} height={22} alt="" className={styles.ffStepTokenLogo} />
          )}
          <div className={styles.ffStepAmountBlock}>
            <div className={styles.ffStepAmountRow}>
              <span className={styles.ffStepAmount}>{transfer.amount}</span>
              <span className={styles.ffStepSymbol}>{transfer.symbol}</span>
            </div>
            {transfer.dollarValue && (
              <span className={styles.ffStepUsd}>${Number(transfer.dollarValue).toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Connector */}
        <div className={styles.ffStepConnector}>↓</div>

        {/* To address */}
        <div className={styles.ffStepAddr} onClick={() => copyWithFirework(transfer.to)} title={transfer.to}>
          <span className={styles.ffStepAddrIcon}>{isBurn ? '✦' : '↓'}</span>
          <span className={styles.ffStepAddrName}>{isBurn ? 'Burn' : toLabel}</span>
        </div>

        {/* Nav */}
        <div className={styles.ffStepNav}>
          <button onClick={onPrev} disabled={step === 0} className={styles.ffStepNavBtn}>← Prev</button>
          <span className={styles.ffStepNavCount}>{step + 1} / {total}</span>
          <button onClick={onNext} disabled={step === total - 1} className={styles.ffStepNavBtn}>Next →</button>
        </div>
      </div>
    </div>
  );
}

export default function FundFlowTab(props: Props) {
  const [hoveredAddr, setHoveredAddr] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredAddr(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHoveredAddr(null), []);

  // Build graph structure only when props change — never on hover
  const { nodes, edges, transfers, addressLabels, symbolColors, stepEdgeIds } = useMemo(() => buildGraph(props), [props]);

  // Edge click → open step detail
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const idx = parseInt(edge.id.replace('e-', ''), 10);
    if (!isNaN(idx) && idx >= 0 && idx < transfers.length) {
      setSelectedStep(idx);
    }
  }, [transfers]);

  // Keyboard: Esc to close, ← → to navigate (works even without sidebar open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (transfers.length === 0) return;
      // Check if the Fund Flow tab is visible
      if (!containerRef.current) return;

      if (e.key === 'Escape' && selectedStep !== null) {
        setSelectedStep(null); e.preventDefault(); e.stopPropagation();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        if (selectedStep === null) { setSelectedStep(transfers.length - 1); }
        else if (selectedStep > 0) { setSelectedStep(selectedStep - 1); }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        if (selectedStep === null) { setSelectedStep(0); }
        else if (selectedStep < transfers.length - 1) { setSelectedStep(selectedStep + 1); }
      }
    };
    window.addEventListener('keydown', handler, true); // capture phase to beat ReactFlow
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedStep, transfers.length, transfers]);

  // Build CSS-only hover + selection styles (no node/edge mutation)
  const hoverCss = useMemo(() => {
    let css = '';

    // Hover styles
    if (hoveredAddr) {
      const connected = new Set<string>([hoveredAddr]);
      const connStepByEdgeId = new Map<string, number[]>();
      transfers.forEach((t, i) => {
        if (t.from === hoveredAddr || t.to === hoveredAddr) {
          connected.add(t.from);
          connected.add(t.to);
          const edgeId = stepEdgeIds[i] ?? `e-${i}`;
          const stepNums = connStepByEdgeId.get(edgeId) ?? [];
          stepNums.push(i);
          connStepByEdgeId.set(edgeId, stepNums);
        }
      });
      css += `.react-flow__node { opacity: 0.25 !important; transition: opacity 0.2s; }\n`;
      for (const id of connected) {
        css += `.react-flow__node[data-id="${id}"] { opacity: 1 !important; }\n`;
      }
      css += `.react-flow__node[data-id="${hoveredAddr}"] .${styles.ffNode} { border-color: var(--accent-primary); box-shadow: 0 0 12px color-mix(in srgb, var(--accent-primary) 35%, transparent); }\n`;
      css += `.react-flow__edge path:not(.ffDot), .react-flow__edge .react-flow__edge-interaction { opacity: 0.12; transition: opacity 0.2s; }\n`;
      css += `.ffEdgeLabel { opacity: 0 !important; transition: opacity 0.2s; }\n`;
      for (const [id, stepNums] of connStepByEdgeId) {
        css += `.react-flow__edge[data-id="${id}"] path:not(.ffDot) { opacity: 1; stroke-width: 1.5px; }\n`;
        css += `.react-flow__edge[data-id="${id}"] .ffDot { opacity: 1; animation: ffDotFlow 0.8s linear infinite; }\n`;
        css += `.react-flow__edge[data-id="${id}"] .react-flow__edge-interaction { opacity: 1; }\n`;
        css += `.ffEdgeLabel[data-edge-id="${id}"] { opacity: 1 !important; }\n`;
        for (const stepNum of stepNums) {
          const edgeColor = transfers[stepNum] ? symbolColors[transfers[stepNum].symbol] : 'var(--accent-primary)';
          css += `.ffStep-${stepNum} { background: ${edgeColor} !important; color: #fff !important; }\n`;
        }
      }
    }

    // Selected step highlight
    if (selectedStep !== null) {
      const t = transfers[selectedStep];
      if (t) {
        const selEdge = stepEdgeIds[selectedStep] ?? `e-${selectedStep}`;
        // Dim unrelated edges
        css += `.react-flow__edge:not([data-id="${selEdge}"]) path:not(.ffDot) { opacity: 0.15 !important; }\n`;
        css += `.ffEdgeLabel:not([data-edge-id="${selEdge}"]) { opacity: 0.15 !important; }\n`;
        // Highlight selected edge
        const selColor = symbolColors[t.symbol] || 'var(--accent-primary)';
        css += `.react-flow__edge[data-id="${selEdge}"] path:not(.ffDot) { stroke-width: 2px; }\n`;
        css += `.react-flow__edge[data-id="${selEdge}"] .ffDot { opacity: 1; animation: ffDotFlow 0.8s linear infinite; }\n`;
        css += `.ffStep-${selectedStep} { background: ${selColor} !important; color: #fff !important; }\n`;
        // Dim unrelated nodes
        css += `.react-flow__node { opacity: 0.3 !important; }\n`;
        css += `.react-flow__node[data-id="${t.from}"] { opacity: 1 !important; }\n`;
        css += `.react-flow__node[data-id="${t.to}"] { opacity: 1 !important; }\n`;
        css += `.react-flow__node[data-id="${t.from}"] .${styles.ffNode}, .react-flow__node[data-id="${t.to}"] .${styles.ffNode} { border-color: var(--accent-primary); }\n`;
      }
    }

    // Make edges clickable with wider hit area
    css += `.react-flow__edge { cursor: pointer; }\n`;
    css += `.react-flow__edge .react-flow__edge-interaction { stroke-width: 20px !important; }\n`;
    css += `.react-flow__edge .ffDot { opacity: 0; }\n`;
    css += `@keyframes ffDotFlow { to { stroke-dashoffset: -41; } }\n`;

    return css;
  }, [hoveredAddr, selectedStep, transfers, symbolColors, stepEdgeIds]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 50);
  }, []);

  if (nodes.length === 0) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}><span>■ FUND FLOW</span></div>
          <div className={styles.emptyHint} style={{ padding: 16 }}>No fund flows detected in this transaction.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tabContent} ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {hoverCss && <style>{hoverCss}</style>}
      <div className={styles.section} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className={styles.sectionHeader}>
          <span>■ FUND FLOW</span>
          <div className={styles.ffNavHint}>
            <span>Navigate [← | → | Esc]</span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 420, width: '100%', display: 'flex', position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={onInit}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onEdgeClick={onEdgeClick}
              fitView
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
            </ReactFlow>
          </div>
          {selectedStep !== null && transfers[selectedStep] && (
            <StepDetail
              step={selectedStep}
              total={transfers.length}
              transfer={transfers[selectedStep]}
              addressLabels={addressLabels}
              tokenLabels={props.tokenLabels ?? {}}
              onClose={() => setSelectedStep(null)}
              onPrev={() => setSelectedStep(Math.max(0, selectedStep - 1))}
              onNext={() => setSelectedStep(Math.min(transfers.length - 1, selectedStep + 1))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
