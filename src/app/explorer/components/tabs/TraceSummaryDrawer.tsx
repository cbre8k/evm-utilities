'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../../explorer.module.scss';
import type { TraceItem } from './callTraceTypes';

// ── Serialiser ────────────────────────────────────────────────────────────────

function serializeTrace(items: TraceItem[], indent = 0): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);
  for (const item of items) {
    if (item.kind === 'frame') {
      const e = item.entry;
      const value = e.node.value && e.node.value !== '0x0' ? ` value=${e.node.value}` : '';
      const revert = item.returnValue?.reverted
        ? ` [REVERT: ${item.returnValue.value || 'unknown reason'}]`
        : '';
      lines.push(`${pad}${e.node.type} ${e.node.from ?? '?'}→${e.node.to ?? '?'}${e.selector ? ` .${e.selector}` : ''}${value} (gas: ${e.gasUsed})${revert}`);
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

// ── Typewriter ────────────────────────────────────────────────────────────────

function useTypewriter(text: string | null, speed: number): string {
  const [displayed, setDisplayed] = useState('');
  const rafRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!text) { setDisplayed(''); indexRef.current = 0; return; }
    const safe = text;
    indexRef.current = 0;
    setDisplayed('');
    const msPer = 1000 / Math.max(1, speed);
    function tick(now: number) {
      const steps = Math.floor((now - lastTimeRef.current) / msPer);
      if (steps > 0) {
        lastTimeRef.current = now;
        indexRef.current = Math.min(indexRef.current + steps, safe.length);
        setDisplayed(safe.slice(0, indexRef.current));
      }
      if (indexRef.current < safe.length) rafRef.current = requestAnimationFrame(tick);
    }
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [text, speed]);
  return displayed;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

type AvatarState = 'idle' | 'talking' | 'done';

function AgentAvatar({ state }: { state: AvatarState }) {
  const isTalking = state === 'talking';
  return (
    <div className={`${styles.mangaAvatar} ${isTalking ? styles.mangaAvatarActive : ''}`}>
      {/* Both images are always in DOM; CSS opacity crossfades — no remount, no flash */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/idle.webp"
        alt="Agent"
        className={`${styles.mangaAvatarImg} ${!isTalking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/talking.webp"
        alt="Agent talking"
        className={`${styles.mangaAvatarImg} ${isTalking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`}
      />
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props { items: TraceItem[]; chainId: number; onClose: () => void; }

const SPEEDS = [
  { label: '1×', value: 18 },
  { label: '2×', value: 40 },
  { label: '4×', value: 100 },
  { label: 'MAX', value: 99999 },
];

export default function TraceSummaryModal({ items, chainId, onClose }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEEDS[speedIdx].value;
  const displayed = useTypewriter(summary, speed);
  const isTyping = summary !== null && displayed.length < summary.length;

  const avatarState: AvatarState = loading ? 'idle' : isTyping ? 'talking' : summary ? 'done' : 'idle';

  async function fetchSummary() {
    setLoading(true); setError(null); setSummary(null);
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

  const statusLabel = loading ? '⟳ Analysing…' : isTyping ? '● Speaking' : '◎ Ready';

  return (
    <div className={styles.mangaOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.mangaModal}>

        {/* agent panel */}
        <div className={styles.mangaAgentPanel}>
          <AgentAvatar state={avatarState} />
          <div className={styles.mangaAgentStatus}>{statusLabel}</div>
        </div>

        {/* speech panel */}
        <div className={styles.mangaSpeechPanel}>
          <div className={styles.mangaPanelHeader}>
            <span className={styles.mangaPanelTitle}>▸ AGENT ANALYSIS</span>
            <button className={styles.mangaClose} onClick={onClose}>✕</button>
          </div>

          <div className={styles.mangaBubbleWrap}>
            <div className={styles.mangaBubbleTail} />
            <div className={styles.mangaBubble}>
              {loading && (
                <div className={styles.mangaThinking}>
                  <span className={styles.mangaDot} style={{ animationDelay: '0s' }} />
                  <span className={styles.mangaDot} style={{ animationDelay: '0.2s' }} />
                  <span className={styles.mangaDot} style={{ animationDelay: '0.4s' }} />
                </div>
              )}
              {error && <p className={styles.mangaError}>⚠ {error}</p>}
              {displayed && (
                <pre className={styles.mangaText}>
                  {displayed}
                  {isTyping && <span className={styles.mangaCursor}>▋</span>}
                </pre>
              )}
            </div>
          </div>

          <div className={styles.mangaFooter}>
            <div className={styles.mangaSpeedBox}>
              <span className={styles.mangaSpeedLabel}>SPEED</span>
              {SPEEDS.map((s, i) => (
                <button
                  key={s.label}
                  className={`${styles.mangaSpeedBtn} ${i === speedIdx ? styles.mangaSpeedBtnActive : ''}`}
                  onClick={() => setSpeedIdx(i)}
                >{s.label}</button>
              ))}
            </div>
            <button
              className={styles.mangaRegenBtn}
              onClick={fetchSummary}
              disabled={loading || isTyping}
            >↻ Regenerate</button>
          </div>
        </div>

      </div>
    </div>
  );
}
