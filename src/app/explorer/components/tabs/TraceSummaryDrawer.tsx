'use client';

import { useState, useEffect } from 'react';
import styles from '../../explorer.module.scss';
import type { TraceItem } from './callTraceTypes';

// ── Trace serialiser ──────────────────────────────────────────────────────────

function serializeTrace(items: TraceItem[], indent = 0): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);
  for (const item of items) {
    if (item.kind === 'frame') {
      const e = item.entry;
      const op = e.node.type;
      const from = e.node.from ?? '?';
      const to = e.node.to ?? '?';
      const sel = e.selector ? ` .${e.selector}` : '';
      const gas = e.gasUsed;
      const revert = item.returnValue?.reverted ? ' [REVERT]' : '';
      lines.push(`${pad}${op} ${from}→${to}${sel} (gas: ${gas})${revert}`);
      lines.push(...serializeTrace(item.items, indent + 1).split('\n').filter(Boolean));
    } else if (item.kind === 'jump-frame') {
      lines.push(`${pad}JUMP ${item.address ?? '?'} (gas: ${item.gasUsed})`);
      lines.push(...serializeTrace(item.items, indent + 1).split('\n').filter(Boolean));
    } else {
      const e = item.entry;
      if (e.kind === 'event') {
        lines.push(`${pad}LOG ${e.name ?? e.opcode} @ ${e.address}`);
      } else if (e.kind === 'storage' && e.opcode === 'SSTORE') {
        lines.push(`${pad}SSTORE slot=${e.slot}`);
      }
    }
  }
  return lines.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  items: TraceItem[];
  chainId: number;
  onClose: () => void;
}

export default function TraceSummaryDrawer({ items, chainId, onClose }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSummary() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const traceText = serializeTrace(items);
      const res = await fetch('/api/trace-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traceText, chainId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? '(no summary returned)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch summary');
    } finally {
      setLoading(false);
    }
  }

  // Kick off on mount
  useEffect(() => { fetchSummary(); }, []);

  return (
    <div className={styles.summaryDrawer}>
      <div className={styles.summaryDrawerHeader}>
        <span>✦ TRACE SUMMARY</span>
        <button className={styles.summaryDrawerClose} onClick={onClose} title="Close">✕</button>
      </div>
      <div className={styles.summaryDrawerBody}>
        {loading && (
          <div className={styles.summaryLoading}>
            <span className={styles.summarySpinner} />
            Analysing trace…
          </div>
        )}
        {error && <div className={styles.summaryError}>⚠ {error}</div>}
        {summary && (
          <pre className={styles.summaryText}>{summary}</pre>
        )}
      </div>
      {!loading && (
        <button className={styles.summaryRetry} onClick={fetchSummary}>↻ Regenerate</button>
      )}
    </div>
  );
}
