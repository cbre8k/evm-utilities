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

// ── Avatar — simple robot ─────────────────────────────────────────────────────

type AvatarState = 'idle' | 'talking' | 'done';

function AgentAvatar({ state }: { state: AvatarState }) {
  const [blink, setBlink] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 3000 + Math.random() * 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state !== 'talking') { setMouthOpen(false); return; }
    const t = setInterval(() => setMouthOpen(v => !v), 160);
    return () => clearInterval(t);
  }, [state]);

  const isDone = state === 'done';
  const statusColor = state === 'talking' ? '#34d399' : isDone ? '#818cf8' : '#fbbf24';

  return (
    <svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.mangaAvatarSvg}>
      {/* antenna */}
      <line x1="40" y1="10" x2="40" y2="2" stroke="#818cf8" strokeWidth="2.2"/>
      <circle cx="40" cy="2" r="3" fill="#818cf8">
        {state === 'talking' && <animate attributeName="fill" values="#818cf8;#34d399;#818cf8" dur="0.8s" repeatCount="indefinite"/>}
      </circle>

      {/* head */}
      <rect x="14" y="10" width="52" height="44" rx="10" fill="#0f172a" stroke="#818cf8" strokeWidth="2.2"/>

      {/* left eye */}
      {blink
        ? <rect x="20" y="29" width="16" height="2" rx="1" fill="#818cf8"/>
        : <rect x="20" y="22" width="16" height={isDone ? 10 : 12} rx="4" fill="#818cf8"/>
      }
      {!blink && <rect x="23" y="25" width="5" height="3" rx="1" fill="white" opacity="0.7"/>}

      {/* right eye */}
      {blink
        ? <rect x="44" y="29" width="16" height="2" rx="1" fill="#818cf8"/>
        : <rect x="44" y="22" width="16" height={isDone ? 10 : 12} rx="4" fill="#818cf8"/>
      }
      {!blink && <rect x="47" y="25" width="5" height="3" rx="1" fill="white" opacity="0.7"/>}

      {/* mouth */}
      {isDone
        /* smile: arc */
        ? <path d="M26 42 Q40 52 54 42" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : state === 'talking' && mouthOpen
          /* open rectangle */
          ? <rect x="28" y="40" width="24" height="10" rx="3" fill="#0a0f1e" stroke="#818cf8" strokeWidth="1.8"/>
          /* closed line */
          : <line x1="28" y1="44" x2="52" y2="44" stroke="#818cf8" strokeWidth="2.2" strokeLinecap="round"/>
      }
      {/* talking aura */}
      {state === 'talking' && (
        <rect x="14" y="10" width="52" height="44" rx="10" fill="none" stroke="#818cf8" strokeWidth="1" opacity="0.2">
          <animate attributeName="opacity" values="0.1;0.4;0.1" dur="0.8s" repeatCount="indefinite"/>
        </rect>
      )}

      {/* done sparkles */}
      {isDone && (
        <>
          <text x="4" y="18" fontSize="9" className={styles.mangaSparkle}>✦</text>
          <text x="68" y="16" fontSize="7" className={styles.mangaSparkle}>✦</text>
        </>
      )}
    </svg>
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

  return (
    <div className={styles.mangaOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.mangaModal}>

        {/* agent panel */}
        <div className={styles.mangaAgentPanel}>
          <div className={styles.mangaHalftone} aria-hidden />
          <div className={styles.mangaAgentWrap}>
            <div className={`${styles.mangaAvatar} ${avatarState === 'talking' ? styles.mangaAvatarActive : ''}`}>
              <AgentAvatar state={avatarState} />
            </div>
            <div className={styles.mangaAgentStatus}>
              {loading ? '⟳ Analysing…' : isTyping ? '● Speaking' : '◎ Ready'}
            </div>
          </div>
        </div>

        {/* speech panel */}
        <div className={styles.mangaSpeechPanel}>
          <div className={styles.mangaPanelHeader}>
            <span className={styles.mangaPanelTitle}>✦ TRACE ANALYSIS</span>
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
