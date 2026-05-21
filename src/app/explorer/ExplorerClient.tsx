'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAgent } from '@/contexts/AgentContext';
import { usePrivateAliases } from '@/contexts/PrivateAliasContext';
import { applyPrivateAliases } from '@/lib/abi-decode';
import { NETWORKS } from '@/lib/constants';
import { type TabBarItem } from '@/components/ui';
import type { TraceResult, TxOverview } from '@/types/explorer';
import type { TraceNode } from '@/types/explorer';
import styles from './explorer.module.scss';
import ExplorerEmptyState from './components/ExplorerEmptyState';
import ExplorerInputBar from './components/ExplorerInputBar';
import ExplorerResultWorkspace from './components/ExplorerResultWorkspace';
import ExplorerStatusBar from './components/ExplorerStatusBar';
import ExplorerTraceLoadingWorkspace from './components/ExplorerTraceLoadingWorkspace';
import TransactionRail from './components/TransactionRail';
import PrivateAliasPanel from './components/PrivateAliasPanel';
import type { ExplorerTab, PageState } from './utils';

// ── Trace context builder (for global agent) ──────────────────────────────────

function serializeNode(node: TraceNode, labels: Record<string, string>, depth = 0): string {
  if (depth > 8) return '';
  const pad = '  '.repeat(depth);
  const from = labels[node.from?.toLowerCase()] ?? node.from ?? '?';
  const to   = node.to ? (labels[node.to.toLowerCase()] ?? node.to) : '?';
  const gas  = parseInt(node.gasUsed || '0x0', 16);
  const fn   = node.function_name
    ? `.${node.function_name}`
    : node.decodedFunction
      ? `.${node.decodedFunction.split('(')[0]}`
      : node.contract_name ? ` [${node.contract_name}]` : '';
  const val  = node.value && node.value !== '0x0' ? ` ETH:${node.value}` : '';
  const err  = node.error ? ` [REVERT:${node.revertReason ?? node.error}]` : '';
  const line = `${pad}${node.type} ${from}→${to}${fn}${val} gas:${gas}${err}`;
  const kids = node.children.map(c => serializeNode(c, labels, depth + 1)).filter(Boolean).join('\n');
  return kids ? `${line}\n${kids}` : line;
}

function buildTraceContext(result: TraceResult): string {
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(result.addressLabels ?? {})) labels[k.toLowerCase()] = v;
  for (const [k, v] of Object.entries(result.tokenLabels ?? {})) labels[k.toLowerCase()] = v;

  const tx = result.txOverview;
  const gasUsed  = parseInt(tx?.gasUsed ?? '0', 16);
  const gasLimit = parseInt(tx?.gasLimit ?? '0', 16);
  const status   = tx?.status === 'success' ? 'SUCCESS' : 'FAILED';

  const events = (result.allLogs ?? [])
    .filter(l => l.eventName)
    .slice(0, 15)
    .map(l => `${l.eventName}@${labels[l.address?.toLowerCase()] ?? l.address}`)
    .join(', ');

  const transfers = (result.erc20Transfers ?? []).slice(0, 8).map(t => {
    const sym  = t.symbol ?? 'TOKEN';
    const amt  = t.amount ?? '?';
    const from = labels[t.from?.toLowerCase()] ?? t.from;
    const to   = labels[t.to?.toLowerCase()] ?? t.to;
    return `${sym} ${amt} ${from}→${to}`;
  }).join('\n');

  const traceStr = result.normalizedTree ? serializeNode(result.normalizedTree, labels) : '(no trace)';

  return [
    `Chain: ${result.chainId ?? 1}  Status: ${status}`,
    `Gas: ${gasUsed.toLocaleString()} used / ${gasLimit.toLocaleString()} limit`,
    events    ? `Events: ${events}` : null,
    transfers ? `Transfers:\n${transfers}` : null,
    `\nCall trace:\n${traceStr}`,
  ].filter(Boolean).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS: TabBarItem<ExplorerTab>[] = [
  { id: 'summary', label: '[ SUMMARY ]' },
  { id: 'events',  label: '[ EVENTS ]' },
  { id: 'state',   label: '[ STATE ]' },
  { id: 'flow',    label: '[ FUND FLOW ]' },
  { id: 'gas',     label: '[ GAS PROFILER ]' },
];

interface Props {
  initialResult: TraceResult | null;
  initialShareHash?: string;
}

export default function ExplorerClient({ initialResult, initialShareHash }: Props) {
  const { rpcUrl, setRpcUrl, chainId, selectedNetwork, setSelectedNetwork } = useNetwork();
  const router = useRouter();
  const { setTraceContext, openAgent, registerHandler } = useAgent();
  const { aliases } = usePrivateAliases();

  const [txHash, setTxHash] = useState(initialResult?.txOverview.hash ?? '');
  const [state, setState] = useState<PageState>(initialResult ? 'done' : 'idle');
  const [status, setStatus] = useState(initialResult ? 'Loaded from database' : '');
  const [result, setResult] = useState<TraceResult | null>(initialResult);
  const [enrichedResult, setEnrichedResult] = useState<TraceResult | null>(initialResult);
  const [pendingOverview, setPendingOverview] = useState<TxOverview | null>(null);
  const [tab, setTab] = useState<ExplorerTab>('summary');
  const [shareHash, setShareHash] = useState<string | null>(initialShareHash ?? null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [aliasOpen, setAliasOpen] = useState(false);

  useEffect(() => {
    setResult(initialResult);
    setPendingOverview(null);
    setShareHash(initialShareHash ?? null);
    setState(initialResult ? 'done' : 'idle');
    setStatus(initialResult ? 'Loaded from database' : '');
    setTxHash(initialResult?.txOverview.hash ?? '');
    setElapsedMs(0);
    setTab('summary');
  }, [initialResult, initialShareHash]);

  // Apply private alias decoding whenever the raw result or aliases change
  useEffect(() => {
    if (!result) { setEnrichedResult(null); return; }
    if (!aliases.length) { setEnrichedResult(result); return; }
    // Deep-clone the tree so we don't mutate cached result objects
    const tree = JSON.parse(JSON.stringify(result.normalizedTree)) as TraceNode;
    const logs = JSON.parse(JSON.stringify(result.allLogs ?? []));
    applyPrivateAliases(tree, aliases, logs);
    // Merge alias labels into addressLabels so nodeContractName shows the alias label
    const addressLabels: Record<string, string> = { ...result.addressLabels };
    for (const alias of aliases) {
      if (alias.label) addressLabels[alias.address] = alias.label;
    }
    setEnrichedResult({ ...result, normalizedTree: tree, allLogs: logs, addressLabels });
  }, [result, aliases]);

  // Sync trace result into the global agent context (uses enriched/decoded tree)
  useEffect(() => {
    if (enrichedResult) {
      setTraceContext(buildTraceContext(enrichedResult), enrichedResult.chainId ?? 1);
    } else {
      setTraceContext(null);
    }
  }, [enrichedResult, setTraceContext]);

  const resolvedChainId = Number(chainId) || result?.chainId || 1;

  const handleExplore = async () => {
    const normalizedTxHash = txHash.trim().toLowerCase();
    if (!normalizedTxHash || !rpcUrl.trim() || state === 'loading') return;

    setState('loading');
    setStatus('Checking database…');
    setResult(null);
    setPendingOverview(null);
    setShareHash(null);
    setTab('summary');
    const t0 = Date.now();

    try {
      const lookupRes = await fetch(`/api/explorer/lookup?txHash=${encodeURIComponent(normalizedTxHash)}&chainId=${resolvedChainId}`);
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok) throw new Error(lookupData.error ?? 'Lookup failed');

      if (lookupData.found && lookupData.shareHash) {
        setStatus('Loaded from database');
        router.push(`/explorer?trace=${lookupData.shareHash}`);
        return;
      }

      setStatus('Loading transaction…');
      // Send fullnode URLs as fallbacks so the backend can retry if the archive RPC returns null
      const fallbackRpcUrls = selectedNetwork?.fullnodeRpcUrls?.filter(u => u && u !== rpcUrl) ?? [];
      const overviewPromise = fetch('/api/explorer/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: normalizedTxHash, rpcUrl, chainId: resolvedChainId, fallbackRpcUrls }),
      })
        .then(async (overviewRes) => {
          const overviewData = await overviewRes.json();
          if (!overviewRes.ok) throw new Error(overviewData.error ?? 'Transaction overview failed');
          setPendingOverview(overviewData.txOverview);
          setStatus('Tracing summary…');
          return overviewData;
        })
        .catch(() => {
          setStatus('Tracing…');
          return null;
        });

      setStatus('Enqueueing trace…');
      const res = await fetch('/api/explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: normalizedTxHash, rpcUrl, chainId: resolvedChainId, fallbackRpcUrls }),
      });
      const { jobId, error } = await res.json();
      if (!jobId) throw new Error(error ?? 'Failed to enqueue');

      setStatus('Tracing…');
      void overviewPromise;
      const evtSource = new EventSource(`/api/jobs/${jobId}/stream`);
      evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setElapsedMs(Date.now() - t0);
        if (data.status === 'done') {
          evtSource.close();
          setResult(data.result ?? data);
          setPendingOverview(null);
          setShareHash(data.shareHash ?? null);
          setState('done');
          setStatus('Done');
          if (data.shareHash) {
            router.push(`/explorer?trace=${data.shareHash}`);
          }
        } else if (data.status === 'failed' || data.status === 'not_found') {
          evtSource.close();
          setPendingOverview(null);
          setState('error');
          setStatus(data.error ?? data.status);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setPendingOverview(null);
        setState('error');
        setStatus('Stream error');
      };
    } catch (err: unknown) {
      setState('error');
      setPendingOverview(null);
      setStatus(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleExploreRef = useRef(handleExplore);
  handleExploreRef.current = handleExplore;

  // Register agent action handlers while on the explorer page
  useEffect(() => {
    return registerHandler(
      ['set_tx_hash', 'switch_network', 'execute_trace', 'switch_tab'],
      async (action) => {
        if (action.type === 'set_tx_hash') {
          setTxHash(action.hash);
        } else if (action.type === 'switch_network') {
          const net = NETWORKS.find(n => n.id === action.networkId);
          if (net) setSelectedNetwork(net);
        } else if (action.type === 'execute_trace') {
          // Slight delay to ensure txHash state is flushed
          await new Promise(r => setTimeout(r, 150));
          handleExploreRef.current();
        } else if (action.type === 'switch_tab') {
          setTab(action.tab as ExplorerTab);
        }
      }
    );
  }, [registerHandler, setSelectedNetwork]);

  const hasResult = state === 'done' && enrichedResult;
  const hasPendingOverview = state === 'loading' && pendingOverview;
  const totalGas = enrichedResult ? (() => { try { return Number(BigInt(enrichedResult.txOverview.gasUsed)); } catch { return 0; } })() : 0;
  const badges: Partial<Record<ExplorerTab, number>> = enrichedResult ? {
    events: enrichedResult.allLogs?.length ?? 0,
    state: enrichedResult.stateDiffs?.length ?? 0,
    flow: (enrichedResult.nativeTransfers?.length ?? 0) + (enrichedResult.erc20Transfers?.length ?? 0) +
      (enrichedResult.erc721Transfers?.length ?? 0) + (enrichedResult.erc1155Transfers?.length ?? 0),
  } : {};
  const tabItems = TABS.map(item => ({ ...item, badge: badges[item.id] }));

  return (
    <div className={styles.page}>
      <ExplorerInputBar
        rpcUrl={rpcUrl}
        state={state}
        txHash={txHash}
        onExplore={handleExplore}
        onRpcUrlChange={setRpcUrl}
        onTxHashChange={setTxHash}
        aliasCount={aliases.length}
        onAliasClick={() => setAliasOpen(v => !v)}
      />

      <ExplorerStatusBar
        elapsedMs={elapsedMs}
        state={state}
        status={status}
      />

      {!hasResult && !hasPendingOverview && <ExplorerEmptyState state={state} status={status} />}

      {hasResult && (
        <div className={styles.resultLayout}>
          <TransactionRail result={enrichedResult} />
          <ExplorerResultWorkspace
            activeTab={tab}
            result={enrichedResult}
            shareHash={shareHash ?? undefined}
            tabItems={tabItems}
            totalGas={totalGas}
            onTabChange={setTab}
            onOpenAgent={openAgent}
          />
        </div>
      )}

      {hasPendingOverview && (
        <div className={styles.resultLayout}>
          <TransactionRail
            txOverview={pendingOverview}
            chainId={resolvedChainId}
            loadingTrace
          />
          <ExplorerTraceLoadingWorkspace
            activeTab={tab}
            tabItems={tabItems}
            onTabChange={setTab}
          />
        </div>
      )}

      {aliasOpen && <PrivateAliasPanel onClose={() => setAliasOpen(false)} />}
    </div>
  );
}
