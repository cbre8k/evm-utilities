'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgent, type AgentAction } from '@/contexts/AgentContext';
import styles from './GlobalAgent.module.scss';

// ── Typewriter ────────────────────────────────────────────────────────────────

function useTypewriter(text: string | null, speed: number): string {
  const [displayed, setDisplayed] = useState('');
  const rafRef   = useRef<number | null>(null);
  const indexRef = useRef(0);
  const lastRef  = useRef(0);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!text) { setDisplayed(''); indexRef.current = 0; return; }
    const safe = text;
    indexRef.current = 0;
    setDisplayed('');
    const msPer = 1000 / Math.max(1, speed);
    function tick(now: number) {
      const steps = Math.floor((now - lastRef.current) / msPer);
      if (steps > 0) {
        lastRef.current = now;
        indexRef.current = Math.min(indexRef.current + steps, safe.length);
        setDisplayed(safe.slice(0, indexRef.current));
      }
      if (indexRef.current < safe.length) rafRef.current = requestAnimationFrame(tick);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [text, speed]);

  return displayed;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function AgentAvatar({ talking }: { talking: boolean }) {
  return (
    <div className={`${styles.mangaAvatar} ${talking ? styles.mangaAvatarActive : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/idle.webp" alt="Agent" className={`${styles.mangaAvatarImg} ${!talking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/talking.webp" alt="Agent talking" className={`${styles.mangaAvatarImg} ${talking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`} />
    </div>
  );
}

// ── Action label helper ───────────────────────────────────────────────────────

function actionLabel(a: AgentAction): string {
  switch (a.type) {
    case 'navigate':      return `📂 Navigate → ${a.page}`;
    case 'switch_network': return `🌐 Switch network → ${a.networkId}`;
    case 'set_tx_hash':   return `🔗 Set tx → ${a.hash.slice(0, 10)}…`;
    case 'execute_trace': return `⚡ Execute trace`;
    case 'switch_tab':    return `🗂 Switch tab → ${a.tab}`;
    default:              return `▶ ${(a as AgentAction).type}`;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string; actions?: AgentAction[]; id: number };

const QUICK_ACTIONS_TRACE = [
  { label: '📋 Summarize',    prompt: 'Summarize this transaction in 3-4 bullet points.' },
  { label: '⛽ Gas tips',     prompt: 'Analyze the gas usage and suggest concrete optimizations.' },
  { label: '⚠ Reverts',      prompt: 'Were there any reverts? Explain what failed and why.' },
  { label: '🔒 Security',     prompt: 'Are there suspicious patterns or security concerns in this trace?' },
  { label: '📊 Step by step', prompt: 'Explain this transaction step by step in plain English.' },
];

const QUICK_ACTIONS_GENERAL = [
  { label: '⛽ Gas tips',       prompt: 'What are best practices to reduce gas costs in Solidity?' },
  { label: '🔒 Security',       prompt: 'What are the most common EVM smart contract vulnerabilities?' },
  { label: '🔄 Reentrancy',     prompt: 'Explain reentrancy attacks and how to prevent them.' },
  { label: '📦 Storage',        prompt: 'Explain EVM storage layout and how to optimize it.' },
  { label: '🛠 Debugging',      prompt: 'How do I debug a failed EVM transaction?' },
];

const SPEEDS = [
  { label: '1×',  value: 20 },
  { label: '2×',  value: 60 },
  { label: 'MAX', value: 99999 },
];

let msgId = 0;

// ── Drawer ────────────────────────────────────────────────────────────────────

function AgentDrawer({ onClose }: { onClose: () => void }) {
  const { traceContext, chainId, dispatchActions } = useAgent();
  const hasTrace = Boolean(traceContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [runningActions, setRunningActions] = useState<AgentAction[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const speed = SPEEDS[speedIdx].value;
  const displayed = useTypewriter(streamingText, speed);
  const isTyping   = streamingText !== null && displayed.length < (streamingText?.length ?? 0);
  const isTalking  = loading || isTyping || runningActions.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, displayed]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || isTyping) return;

    const userMsg: Message = { role: 'user', content: trimmed, id: ++msgId };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setStreamingText(null);

    const history = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, traceContext: traceContext ?? undefined, chainId }),
      });
      const data = await res.json();
      const actions: AgentAction[] = Array.isArray(data.actions) ? data.actions : [];
      const reply: string = data.reply ?? '(no response)';

      setLoading(false);
      setStreamingText(reply);

      // Execute actions after a short delay to let typewriter start
      if (actions.length > 0) {
        setTimeout(async () => {
          setRunningActions(actions);
          await dispatchActions(actions);
          setRunningActions([]);
        }, 600);
      }
    } catch (err) {
      setLoading(false);
      const errMsg = err instanceof Error ? err.message : 'Request failed';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠ ${errMsg}`, id: ++msgId }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isTyping, traceContext, chainId, dispatchActions]);

  // Auto-greet on mount
  useEffect(() => {
    const intro = hasTrace
      ? 'Summarize this transaction in a few bullet points.'
      : 'Introduce yourself briefly and tell me what you can do and what actions you can perform in this app.';
    sendMessage(intro);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commit streaming text
  useEffect(() => {
    if (streamingText !== null && !isTyping) {
      const finalText = streamingText;
      setStreamingText(null);
      setMessages(prev => [...prev, { role: 'assistant', content: finalText, id: ++msgId }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  const statusLabel = runningActions.length > 0
    ? `⚡ ${actionLabel(runningActions[0])}`
    : loading ? '⟳ Thinking…'
    : isTyping ? '● Speaking'
    : '◎ Ready';

  const quickActions = hasTrace ? QUICK_ACTIONS_TRACE : QUICK_ACTIONS_GENERAL;

  return (
    <div className={styles.mangaOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.agentChatModal}>

        {/* avatar panel */}
        <div className={styles.mangaAgentPanel}>
          <AgentAvatar talking={isTalking} />
          <div className={styles.mangaAgentStatus}>{statusLabel}</div>
          <div className={styles.agentSpeedBox}>
            <span className={styles.mangaSpeedLabel}>SPD</span>
            {SPEEDS.map((s, i) => (
              <button key={s.label}
                className={`${styles.mangaSpeedBtn} ${i === speedIdx ? styles.mangaSpeedBtnActive : ''}`}
                onClick={() => setSpeedIdx(i)}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* chat panel */}
        <div className={styles.mangaSpeechPanel}>
          <div className={styles.mangaPanelHeader}>
            <span className={styles.mangaPanelTitle}>
              ▸ AI AGENT {hasTrace ? '— TX ANALYSIS' : '— EVM ASSISTANT'}
            </span>
            <button className={styles.mangaClose} onClick={onClose}>✕</button>
          </div>

          <div className={styles.agentChips}>
            {quickActions.map(a => (
              <button key={a.label} className={styles.agentChip}
                onClick={() => sendMessage(a.prompt)} disabled={loading || isTyping}>
                {a.label}
              </button>
            ))}
          </div>

          <div className={styles.agentMessages}>
            {messages.map(m => (
              <div key={m.id} className={`${styles.agentMessageRow} ${m.role === 'user' ? styles.agentMessageRowUser : ''}`}>
                <div className={`${styles.agentBubble} ${m.role === 'user' ? styles.agentBubbleUser : styles.agentBubbleAssistant}`}>
                  <pre className={styles.mangaText}>{m.content}</pre>
                </div>
              </div>
            ))}

            {(loading || isTyping) && (
              <div className={styles.agentMessageRow}>
                <div className={`${styles.agentBubble} ${styles.agentBubbleAssistant}`}>
                  {loading && !isTyping && (
                    <div className={styles.mangaThinking}>
                      <span className={styles.mangaDot} style={{ animationDelay: '0s' }} />
                      <span className={styles.mangaDot} style={{ animationDelay: '0.2s' }} />
                      <span className={styles.mangaDot} style={{ animationDelay: '0.4s' }} />
                    </div>
                  )}
                  {isTyping && (
                    <pre className={styles.mangaText}>{displayed}<span className={styles.mangaCursor}>▋</span></pre>
                  )}
                </div>
              </div>
            )}

            {/* Action execution progress */}
            {runningActions.length > 0 && (
              <div className={styles.agentMessageRow}>
                <div className={`${styles.agentBubble} ${styles.agentBubbleAssistant} ${styles.agentActionBubble}`}>
                  {runningActions.map((a, i) => (
                    <div key={i} className={`${styles.agentActionItem} ${i === 0 ? styles.agentActionItemActive : ''}`}>
                      {i === 0 ? '⚡' : '◦'} {actionLabel(a)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={styles.agentInputRow}>
            <textarea ref={inputRef} className={styles.agentInput} rows={2}
              placeholder='Ask anything, or say "trace 0x... on BSC"…'
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || isTyping} />
            <button className={styles.agentSendBtn}
              onClick={() => sendMessage(input)}
              disabled={loading || isTyping || !input.trim()}>▶ Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FAB ───────────────────────────────────────────────────────────────────────

export default function GlobalAgent() {
  const { isOpen, openAgent, closeAgent } = useAgent();

  return (
    <>
      {!isOpen && (
        <button className={styles.agentFab} onClick={openAgent} title="Open AI agent">
          <span className={styles.agentFabAvatar}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/idle.webp" alt="Agent" />
          </span>
          AI AGENT
        </button>
      )}
      {isOpen && <AgentDrawer onClose={closeAgent} />}
    </>
  );
}
