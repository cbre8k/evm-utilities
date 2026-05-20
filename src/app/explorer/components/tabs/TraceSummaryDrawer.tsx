'use client';

import { useState, useEffect, useRef } from 'react';
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
      const revert = item.returnValue?.reverted
        ? ` [REVERT: ${item.returnValue.value || 'unknown reason'}]`
        : '';
      const value = e.node.value && e.node.value !== '0x0' ? ` value=${e.node.value}` : '';
      lines.push(`${pad}${op} ${from}→${to}${sel}${value} (gas: ${gas})${revert}`);
      lines.push(...serializeTrace(item.items, indent + 1).split('\n').filter(Boolean));
    } else if (item.kind === 'jump-frame') {
      lines.push(`${pad}JUMP ${item.address ?? '?'} (gas: ${item.gasUsed})`);
      lines.push(...serializeTrace(item.items, indent + 1).split('\n').filter(Boolean));
    } else {
      const e = item.entry;
      if (e.kind === 'event') {
        const inputs = e.inputs?.map((i) => `${i.name}=${String(i.value)}`).join(', ') ?? '';
        lines.push(`${pad}LOG ${e.name ?? e.opcode}(${inputs}) @ ${e.address}`);
      } else if (e.kind === 'storage' && e.opcode === 'SSTORE') {
        lines.push(`${pad}SSTORE slot=${e.slot} ${e.before}→${e.after}`);
      }
    }
  }
  return lines.join('\n');
}

// ── Typewriter hook ───────────────────────────────────────────────────────────

function useTypewriter(text: string | null, speed = 8): string {
  const [displayed, setDisplayed] = useState('');
  const rafRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!text) { setDisplayed(''); indexRef.current = 0; return; }
    const safeText = text;
    indexRef.current = 0;
    setDisplayed('');

    const msPerChar = 1000 / speed;

    function tick(now: number) {
      const elapsed = now - lastTimeRef.current;
      const steps = Math.floor(elapsed / msPerChar);
      if (steps > 0) {
        lastTimeRef.current = now;
        indexRef.current = Math.min(indexRef.current + steps, safeText.length);
        setDisplayed(safeText.slice(0, indexRef.current));
      }
      if (indexRef.current < safeText.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [text, speed]);

  return displayed;
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
  const displayed = useTypewriter(summary, 18);
  const isTyping = summary !== null && displayed.length < summary.length;

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

  useEffect(() => { fetchSummary(); }, []);

  return (
    <div className={styles.summaryDrawer}>
      <div className={styles.summaryDrawerHeader}>
        <span>✦ TRACE SUMMARY</span>
        <div className={styles.summaryDrawerHeaderRight}>
          {isTyping && <span className={styles.summaryTypingDot} />}
          <button className={styles.summaryDrawerClose} onClick={onClose} title="Close">✕</button>
        </div>
      </div>
      <div className={styles.summaryDrawerBody}>
        {loading && (
          <div className={styles.summaryLoading}>
            <span className={styles.summarySpinner} />
            Analysing trace…
          </div>
        )}
        {error && <div className={styles.summaryError}>⚠ {error}</div>}
        {displayed && (
          <pre className={styles.summaryText}>
            {displayed}
            {isTyping && <span className={styles.summaryCursor}>▋</span>}
          </pre>
        )}
      </div>
      {!loading && !isTyping && (
        <button className={styles.summaryRetry} onClick={fetchSummary}>↻ Regenerate</button>
      )}
    </div>
  );
}
