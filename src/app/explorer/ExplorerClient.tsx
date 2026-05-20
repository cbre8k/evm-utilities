'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNetwork } from '@/contexts/NetworkContext';
import { type TabBarItem } from '@/components/ui';
import type { TraceResult, TxOverview } from '@/types/explorer';
import styles from './explorer.module.scss';
import ExplorerEmptyState from './components/ExplorerEmptyState';
import ExplorerInputBar from './components/ExplorerInputBar';
import ExplorerResultWorkspace from './components/ExplorerResultWorkspace';
import ExplorerStatusBar from './components/ExplorerStatusBar';
import ExplorerTraceLoadingWorkspace from './components/ExplorerTraceLoadingWorkspace';
import TransactionRail from './components/TransactionRail';
import type { ExplorerTab, PageState } from './utils';

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
  const { rpcUrl, setRpcUrl, chainId, selectedNetwork } = useNetwork();
  const router = useRouter();

  const [txHash, setTxHash] = useState(initialResult?.txOverview.hash ?? '');
  const [state, setState] = useState<PageState>(initialResult ? 'done' : 'idle');
  const [status, setStatus] = useState(initialResult ? 'Loaded from database' : '');
  const [result, setResult] = useState<TraceResult | null>(initialResult);
  const [pendingOverview, setPendingOverview] = useState<TxOverview | null>(null);
  const [tab, setTab] = useState<ExplorerTab>('summary');
  const [shareHash, setShareHash] = useState<string | null>(initialShareHash ?? null);
  const [elapsedMs, setElapsedMs] = useState(0);

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

  const hasResult = state === 'done' && result;
  const hasPendingOverview = state === 'loading' && pendingOverview;
  const totalGas = result ? (() => { try { return Number(BigInt(result.txOverview.gasUsed)); } catch { return 0; } })() : 0;
  const badges: Partial<Record<ExplorerTab, number>> = result ? {
    events: result.allLogs?.length ?? 0,
    state: result.stateDiffs?.length ?? 0,
    flow: (result.nativeTransfers?.length ?? 0) + (result.erc20Transfers?.length ?? 0) +
      (result.erc721Transfers?.length ?? 0) + (result.erc1155Transfers?.length ?? 0),
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
      />

      <ExplorerStatusBar
        elapsedMs={elapsedMs}
        state={state}
        status={status}
      />

      {!hasResult && !hasPendingOverview && <ExplorerEmptyState state={state} status={status} />}

      {hasResult && (
        <div className={styles.resultLayout}>
          <TransactionRail result={result} />
          <ExplorerResultWorkspace
            activeTab={tab}
            result={result}
            shareHash={shareHash ?? undefined}
            tabItems={tabItems}
            totalGas={totalGas}
            onTabChange={setTab}
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
    </div>
  );
}
