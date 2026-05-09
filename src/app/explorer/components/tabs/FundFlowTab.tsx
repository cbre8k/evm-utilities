import type {
  NativeTransfer,
  ERC20Transfer,
  ERC721Transfer,
  ERC1155Transfer,
  TenderlyAssetChange,
  TenderlyBalanceChange,
  TenderlyExposureChange,
} from '@/types/explorer';
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
}

function addr(v: string | null | undefined) {
  if (!v) return '—';
  return `${v.slice(0, 8)}…${v.slice(-6)}`;
}
function money(v?: string) {
  if (!v) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(4)}`;
}
function tokenSymbol(change: TenderlyAssetChange | TenderlyExposureChange, tokenLabels: Record<string, string>) {
  const info = change.token_info;
  const address = info?.contract_address?.toLowerCase();
  return info?.symbol || (address ? tokenLabels[address] : undefined) || (address ? addr(address) : 'TOKEN');
}
function tokenAmount(change: TenderlyAssetChange | TenderlyExposureChange) {
  const amount = change.amount;
  if (amount) return amount;
  const raw = change.raw_amount;
  const decimals = change.token_info?.decimals ?? 18;
  if (!raw) return '—';
  try {
    const scale = 10n ** BigInt(decimals);
    const value = BigInt(raw);
    const whole = value / scale;
    const fraction = (value % scale).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return raw;
  }
}

export default function FundFlowTab({
  nativeTransfers,
  erc20Transfers,
  erc721Transfers,
  erc1155Transfers,
  assetChanges = [],
  exposureChanges = [],
  balanceChanges = [],
  tokenLabels = {},
}: Props) {
  // Build a unique node → edges graph
  const nodes = new Map<string, { in: number; out: number; label: string }>();
  const edges: { from: string; to: string; label: string; type: string }[] = [];

  function ensureNode(a: string) {
    if (!nodes.has(a)) nodes.set(a, { in: 0, out: 0, label: addr(a) });
  }

  for (const t of nativeTransfers) {
    if (!t.to) continue;
    const val = (() => { try { return Number(BigInt(t.value)) / 1e18; } catch { return 0; } })();
    if (val === 0) continue;
    ensureNode(t.from); ensureNode(t.to);
    nodes.get(t.from)!.out += val;
    nodes.get(t.to)!.in += val;
    edges.push({ from: t.from, to: t.to, label: `${val.toFixed(4)} ETH`, type: 'native' });
  }

  for (const t of erc20Transfers) {
    ensureNode(t.from); ensureNode(t.to);
    const symbol = t.symbol || tokenLabels[t.tokenAddress.toLowerCase()] || 'ERC20';
    edges.push({ from: t.from, to: t.to, label: `${t.amount.slice(0, 8)}… ${symbol}`, type: 'erc20' });
  }

  for (const t of erc721Transfers) {
    ensureNode(t.from); ensureNode(t.to);
    edges.push({ from: t.from, to: t.to, label: `NFT #${t.tokenId}`, type: 'erc721' });
  }

  for (const t of erc1155Transfers) {
    ensureNode(t.from); ensureNode(t.to);
    edges.push({ from: t.from, to: t.to, label: t.isBatch ? 'ERC-1155 Batch' : `ERC-1155 #${t.id}`, type: 'erc1155' });
  }

  const nodeList = [...nodes.entries()];
  const orderedAssetChanges = [...assetChanges].sort((a, b) => (a.trace_absolute_position ?? 0) - (b.trace_absolute_position ?? 0));
  const hasTenderlyFlow = orderedAssetChanges.length > 0 || exposureChanges.length > 0 || balanceChanges.length > 0;

  const typeColor: Record<string, string> = {
    native: '#10b981',
    erc20:  '#3b82f6',
    erc721: '#8b5cf6',
    erc1155:'#f59e0b',
  };

  if (edges.length === 0 && !hasTenderlyFlow) {
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
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>■ FUND FLOW</span>
          <span className={styles.panelBadge}>{Math.max(edges.length, orderedAssetChanges.length)} changes</span>
        </div>
        <div className={styles.sectionBody}>
          {orderedAssetChanges.length > 0 && (
            <div className={styles.flowTimeline}>
              {orderedAssetChanges.map((change, index) => {
                const symbol = tokenSymbol(change, tokenLabels);
                const type = change.type.toLowerCase();
                const isBurn = type === 'burn';
                const isMint = type === 'mint' || (change.from ?? '').toLowerCase().endsWith('0000000000000000000000000000000000000000');
                const from = isMint ? 'mint' : addr(change.from);
                const to = isBurn ? 'burn' : addr(change.to);
                return (
                  <div key={`${change.trace_absolute_position ?? index}-${change.type}`} className={styles.flowTimelineRow}>
                    <span className={styles.flowStepIndex}>{index + 1}</span>
                    <span className={`${styles.flowChangeType} ${styles[`flowChange${change.type}`] ?? ''}`}>{change.type}</span>
                    <span className={styles.mono} title={change.from}>{from}</span>
                    <span className={styles.flowArrowThin}>→</span>
                    <span className={styles.mono} title={change.to}>{to}</span>
                    <span className={styles.flowAmount}>{tokenAmount(change)} {symbol}</span>
                    {money(change.dollar_value) && <span className={styles.flowUsd}>{money(change.dollar_value)}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {exposureChanges.length > 0 && (
            <div className={styles.flowExposureList}>
              {exposureChanges.map((change, index) => (
                <div key={`${change.owner}-${change.spender}-${index}`} className={styles.flowExposureRow}>
                  <span className={styles.flowChangeType}>{change.type}</span>
                  <span className={styles.mono} title={change.owner}>{addr(change.owner)}</span>
                  <span className={styles.muted}>approved</span>
                  <span className={styles.mono} title={change.spender}>{addr(change.spender)}</span>
                  <span className={styles.flowAmount}>{tokenAmount(change)} {tokenSymbol(change, tokenLabels)}</span>
                </div>
              ))}
            </div>
          )}

          {balanceChanges.length > 0 && (
            <div className={styles.flowNetList}>
              {balanceChanges.map((change) => (
                <div key={change.address} className={styles.flowNetRow}>
                  <span className={styles.mono} title={change.address}>{addr(change.address)}</span>
                  <span className={Number(change.dollar_value ?? 0) >= 0 ? styles.flowIn : styles.flowOut}>
                    {money(change.dollar_value) || '$0.0000'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Address legend */}
          {nodeList.length > 0 && <div className={styles.flowLegend}>
            {nodeList.map(([a, n]) => (
              <div key={a} className={styles.flowNode} title={a}>
                <span className={styles.flowNodeDot} />
                <span className={styles.mono}>{addr(a)}</span>
                {n.in > 0 && <span className={styles.flowIn}>+{n.in.toFixed(4)}</span>}
                {n.out > 0 && <span className={styles.flowOut}>-{n.out.toFixed(4)}</span>}
              </div>
            ))}
          </div>}

          {/* Edge list */}
          {edges.length > 0 && <div className={styles.flowEdges}>
            {edges.map((e, i) => (
              <div key={i} className={styles.flowEdge}>
                <span className={styles.mono} style={{ color: 'var(--text-secondary)' }}>{addr(e.from)}</span>
                <span className={styles.flowArrow} style={{ color: typeColor[e.type] ?? '#888' }}>
                  ──{e.label}──▶
                </span>
                <span className={styles.mono} style={{ color: 'var(--text-secondary)' }}>{addr(e.to)}</span>
                <span className={styles.flowType} style={{ background: typeColor[e.type] + '22', color: typeColor[e.type] }}>
                  {e.type.toUpperCase()}
                </span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>
  );
}
