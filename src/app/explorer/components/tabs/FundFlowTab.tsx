'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  Handle,
  Position,
  MarkerType,
  getBezierPath,
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
const MAX_HANDLES = 6;

// ── Custom Node ──
function AddressNode({ data }: NodeProps) {
  const d = data as {
    address: string; label: string; isSender?: boolean; isContract?: boolean; logo?: string;
  };

  // Generate multiple handles at different Y offsets for parallel edges
  const handles = [];
  for (let i = 0; i < MAX_HANDLES; i++) {
    const pct = MAX_HANDLES === 1 ? 50 : 15 + (i * 70) / (MAX_HANDLES - 1);
    handles.push(
      <Handle key={`t-${i}`} type="target" position={Position.Left} id={`t-${i}`}
        style={{ top: `${pct}%`, opacity: 0 }} />,
      <Handle key={`s-${i}`} type="source" position={Position.Right} id={`s-${i}`}
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
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const d = data as { color?: string; stepNum?: number; amount?: string; symbol?: string };
  const dotColor = d?.color || 'var(--accent-primary)';

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
          }}
        >
          <span
            className={`ffStep ffStep-${d?.stepNum ?? 0}`}
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
          >{d?.stepNum != null ? d.stepNum + 1 : ''}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)'}}>{d?.amount}</span>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 10 }}>{d?.symbol}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { flowEdge: FlowEdge };

// ── Layout: BFS layered from sources ──
function layeredLayout(
  addresses: string[],
  transfers: { from: string; to: string }[],
): Record<string, { col: number; row: number }> {
  // Build adjacency
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

  // BFS from sources (nodes with no incoming or the first node)
  const sources = addresses.filter(a => incoming.get(a)!.size === 0);
  if (sources.length === 0) sources.push(addresses[0]);

  const colOf = new Map<string, number>();
  const queue = [...sources];
  for (const s of sources) colOf.set(s, 0);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curCol = colOf.get(cur)!;
    for (const next of outgoing.get(cur) ?? []) {
      const existing = colOf.get(next);
      if (existing === undefined || existing < curCol + 1) {
        colOf.set(next, curCol + 1);
        queue.push(next);
      }
    }
  }

  // Assign any unvisited nodes
  for (const a of addresses) {
    if (!colOf.has(a)) colOf.set(a, 0);
  }

  // Group by column, assign rows
  const colGroups = new Map<number, string[]>();
  for (const a of addresses) {
    const c = colOf.get(a)!;
    if (!colGroups.has(c)) colGroups.set(c, []);
    colGroups.get(c)!.push(a);
  }

  const positions: Record<string, { col: number; row: number }> = {};
  for (const [col, addrs] of colGroups) {
    addrs.forEach((a, row) => {
      positions[a] = { col, row };
    });
  }
  return positions;
}

// ── Build graph ──
type Transfer = {
  from: string; to: string; label: string; symbol: string;
  amount: string; tokenName?: string; tokenLogo?: string; dollarValue?: string;
  type: string; // 'Transfer' | 'Mint' | 'Burn' etc.
};

function collectTransfers(props: Props): Transfer[] {
  const { nativeTransfers, erc20Transfers, erc721Transfers, erc1155Transfers, assetChanges = [], tokenLabels = {}, addressLabels: propAddressLabels = {} } = props;
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
): { nodes: Node[]; edges: Edge[]; transfers: Transfer[]; addressLabels: Record<string, string>; symbolColors: Record<string, string> } {
  const { assetChanges = [], tokenLabels = {}, addressLabels: propAddressLabels = {} } = props;
  const transfers = collectTransfers(props);
  if (transfers.length === 0) return { nodes: [], edges: [], transfers, addressLabels: {}, symbolColors: {} };

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

  // ── Edges with parallel offset ──
  const srcCount = new Map<string, number>();
  const tgtCount = new Map<string, number>();
  const srcIndex = new Map<string, number>();
  const tgtIndex = new Map<string, number>();
  for (const t of transfers) {
    srcCount.set(t.from, (srcCount.get(t.from) ?? 0) + 1);
    tgtCount.set(t.to, (tgtCount.get(t.to) ?? 0) + 1);
  }

  const edges: Edge[] = transfers.map((t, i) => {
    const si = srcIndex.get(t.from) ?? 0;
    const ti = tgtIndex.get(t.to) ?? 0;
    srcIndex.set(t.from, si + 1);
    tgtIndex.set(t.to, ti + 1);

    const totalSrc = srcCount.get(t.from)!;
    const totalTgt = tgtCount.get(t.to)!;
    const sHandle = totalSrc > 1 ? `s-${Math.min(si, MAX_HANDLES - 1)}` : `s-${Math.floor(MAX_HANDLES / 2)}`;
    const tHandle = totalTgt > 1 ? `t-${Math.min(ti, MAX_HANDLES - 1)}` : `t-${Math.floor(MAX_HANDLES / 2)}`;

    const color = symbolColors[t.symbol];

    return {
      id: `e-${i}`,
      source: t.from,
      target: t.to,
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
      data: { color, stepNum: i, amount: t.amount, symbol: t.symbol },
    };
  });

  return { nodes, edges, transfers, addressLabels, symbolColors };
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
  const { nodes, edges, transfers, addressLabels, symbolColors } = useMemo(() => buildGraph(props), [props]);

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
      const connEdgeIds: string[] = [];
      transfers.forEach((t, i) => {
        if (t.from === hoveredAddr || t.to === hoveredAddr) {
          connected.add(t.from);
          connected.add(t.to);
          connEdgeIds.push(`e-${i}`);
        }
      });
      css += `.react-flow__node { opacity: 0.25 !important; transition: opacity 0.2s; }\n`;
      for (const id of connected) {
        css += `.react-flow__node[data-id="${id}"] { opacity: 1 !important; }\n`;
      }
      css += `.react-flow__node[data-id="${hoveredAddr}"] .${styles.ffNode} { border-color: var(--accent-primary); box-shadow: 0 0 12px color-mix(in srgb, var(--accent-primary) 35%, transparent); }\n`;
      css += `.react-flow__edge path:not(.ffDot), .react-flow__edge .react-flow__edge-interaction { opacity: 0.12; transition: opacity 0.2s; }\n`;
      css += `.ffEdgeLabel { opacity: 0 !important; transition: opacity 0.2s; }\n`;
      for (const id of connEdgeIds) {
        const edgeIdx = parseInt(id.replace('e-', ''), 10);
        const edgeColor = transfers[edgeIdx] ? symbolColors[transfers[edgeIdx].symbol] : 'var(--accent-primary)';
        css += `.react-flow__edge[data-id="${id}"] path:not(.ffDot) { opacity: 1; stroke-width: 1.5px; }\n`;
        css += `.react-flow__edge[data-id="${id}"] .ffDot { opacity: 1; animation: ffDotFlow 0.8s linear infinite; }\n`;
        css += `.react-flow__edge[data-id="${id}"] .react-flow__edge-interaction { opacity: 1; }\n`;
        css += `.ffEdgeLabel[data-step="${edgeIdx}"] { opacity: 1 !important; }\n`;
        css += `.ffStep-${edgeIdx} { background: ${edgeColor} !important; color: #fff !important; }\n`;
      }
    }

    // Selected step highlight
    if (selectedStep !== null) {
      const t = transfers[selectedStep];
      if (t) {
        const selEdge = `e-${selectedStep}`;
        // Dim unrelated edges
        css += `.react-flow__edge:not([data-id="${selEdge}"]) path:not(.ffDot) { opacity: 0.15 !important; }\n`;
        css += `.ffEdgeLabel:not([data-step="${selectedStep}"]) { opacity: 0.15 !important; }\n`;
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
  }, [hoveredAddr, selectedStep, transfers]);

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
