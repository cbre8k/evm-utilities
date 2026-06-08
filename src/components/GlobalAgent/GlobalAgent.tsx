'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { useAgent, type AgentAction } from '@/contexts/AgentContext';
import styles from './GlobalAgent.module.scss';

// ── Custom ReactMarkdown components ───────────────────────────────────────────
// Replace ▋ cursor marker with a blinking <span> wherever it appears in text.

const CURSOR_MARKER = '▋';

function injectCursor(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    const idx = children.lastIndexOf(CURSOR_MARKER);
    if (idx === -1) return children;
    return (
      <>
        {children.slice(0, idx)}
        <span className={styles.mangaCursor}>{CURSOR_MARKER}</span>
      </>
    );
  }
  if (Array.isArray(children)) {
    const arr = children as React.ReactNode[];
    return arr.map((child, i) =>
      i === arr.length - 1
        ? <span key={i}>{injectCursor(child)}</span>
        : <span key={i}>{child}</span>
    );
  }
  return children;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCursor(Tag: string): Components[keyof Components] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function Comp({ children, ...props }: any) {
    return <Tag {...props}>{injectCursor(children)}</Tag>;
  };
}

const MD_COMPONENTS_TYPING: Components = {
  p:          withCursor('p') as Components['p'],
  li:         withCursor('li') as Components['li'],
  h1:         withCursor('h1') as Components['h1'],
  h2:         withCursor('h2') as Components['h2'],
  h3:         withCursor('h3') as Components['h3'],
  blockquote: withCursor('blockquote') as Components['blockquote'],
};

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
      <img src="/idle.webp" alt="" className={`${styles.mangaAvatarImg} ${!talking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/talking.webp" alt="" className={`${styles.mangaAvatarImg} ${talking ? styles.mangaAvatarVisible : styles.mangaAvatarHidden}`} />
    </div>
  );
}

// ── Action label helper ───────────────────────────────────────────────────────

function actionLabel(a: AgentAction): string {
  switch (a.type) {
    case 'navigate':       return `Navigate ${a.page}`;
    case 'switch_network': return `Switch network ${a.networkId}`;
    case 'set_tx_hash':    return `Set tx ${a.hash.slice(0, 10)}…`;
    case 'execute_trace':  return 'Execute trace';
    case 'switch_tab':     return `Switch tab ${a.tab}`;
    default:               return (a as AgentAction).type;
  }
}

// ── Session storage ───────────────────────────────────────────────────────────

type Message    = { role: 'user' | 'assistant'; content: string; id: number };
type StoredMsg  = { role: 'user' | 'assistant'; content: string };
type Session    = { id: string; title: string; updatedAt: number; messages: StoredMsg[] };

const SESSIONS_KEY = 'agent_sessions';
const MAX_SESSIONS = 50;

// Start msgId well above any plausible localStorage-hydrated ID to avoid key collisions on hot reload
let msgId = Date.now();

// Module-level: persists across drawer open/close cycles so auto-summary never fires twice for the same trace
let lastSummarizedTrace: string | null = null;

function genId() { return Math.random().toString(36).slice(2, 10); }

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch { /* quota */ }
}

function sessionTitle(messages: StoredMsg[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New session';
  return first.content.slice(0, 36) + (first.content.length > 36 ? '…' : '');
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS_TRACE = [
  { label: 'Summarize',    prompt: 'Summarize this transaction concisely — what it does, which protocols are involved, any reverts and why.' },
  { label: 'Gas tips',     prompt: 'Analyze the gas usage and suggest concrete optimizations.' },
  { label: 'Reverts',      prompt: 'Were there any reverts? Explain what failed and why.' },
  { label: 'Security',     prompt: 'Are there suspicious patterns or security concerns in this trace?' },
  { label: 'Step by step', prompt: 'Explain this transaction step by step in plain English.' },
];

const QUICK_ACTIONS_GENERAL = [
  { label: 'Gas tips',     prompt: 'What are best practices to reduce gas costs in Solidity?' },
  { label: 'Security',     prompt: 'What are the most common EVM smart contract vulnerabilities?' },
  { label: 'Reentrancy',   prompt: 'Explain reentrancy attacks and how to prevent them.' },
  { label: 'Storage',      prompt: 'Explain EVM storage layout and how to optimize it.' },
  { label: 'Debugging',    prompt: 'How do I debug a failed EVM transaction?' },
];

const SPEEDS = [
  { label: '1x', value: 20 },
  { label: '2x', value: 60 },
  { label: 'Max', value: 99999 },
];

// ── Drawer ────────────────────────────────────────────────────────────────────

function AgentDrawer({ onClose }: {
  onClose: () => void;
}) {
  const { traceContext, chainId, dispatchActions } = useAgent();
  const hasTrace = Boolean(traceContext);

  // Sessions state
  const [sessions, setSessions]       = useState<Session[]>(() => loadSessions());
  const [activeId, setActiveId]       = useState<string>(() => {
    const s = loadSessions();
    return s.length > 0 ? s[0].id : genId();
  });

  // Messages for active session
  const [messages, setMessages] = useState<Message[]>(() => {
    const s = loadSessions();
    const active = s[0];
    return active ? active.messages.map(m => ({ ...m, id: ++msgId })) : [];
  });

  const [streamingText, setStreamingText]       = useState<string | null>(null);
  const [typingMsgId, setTypingMsgId]           = useState<number | null>(null);
  const [input, setInput]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [speedIdx, setSpeedIdx]                 = useState(0);
  const [runningActions, setRunningActions]     = useState<AgentAction[]>([]);
  const [pendingActions, setPendingActions]     = useState<AgentAction[] | null>(null);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const messagesRef     = useRef<Message[]>([]);
  const activeIdRef     = useRef(activeId);
  const sendMessageRef  = useRef<((text: string) => Promise<void>) | null>(null);
  messagesRef.current  = messages;
  activeIdRef.current  = activeId;

  const speed     = SPEEDS[speedIdx].value;
  const displayed = useTypewriter(streamingText, speed);
  const isTyping  = streamingText !== null && displayed.length < (streamingText?.length ?? 0);
  const isTalking = loading || isTyping || runningActions.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, displayed]);

  // Clear typewriter state when it finishes (message was already added to history on arrival)
  useEffect(() => {
    if (streamingText !== null && !isTyping) {
      setStreamingText(null);
      setTypingMsgId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping]);

  // Persist whenever messages change — use ref to avoid stale activeId closure
  useEffect(() => {
    if (messages.length === 0) return;
    const id = activeIdRef.current;
    const stored: StoredMsg[] = messages.map(({ role, content }) => ({ role, content }));
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const updated: Session = {
        id,
        title: sessionTitle(stored),
        updatedAt: Date.now(),
        messages: stored,
      };
      const next = idx >= 0
        ? [updated, ...prev.filter(s => s.id !== id)]
        : [updated, ...prev];
      saveSessions(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function switchSession(id: string) {
    const s = sessions.find(s => s.id === id);
    if (!s) return;
    setActiveId(id);
    setMessages(s.messages.map(m => ({ ...m, id: ++msgId })));
    setStreamingText(null);
    setInput('');
  }

  function newSession() {
    const id = genId();
    setActiveId(id);
    setMessages([]);
    setStreamingText(null);
    setInput('');
  }

  function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === activeId) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        switchSession(remaining[0].id);
      } else {
        newSession();
      }
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || isTyping) return;

    const userMsg: Message = { role: 'user', content: trimmed, id: ++msgId };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setStreamingText(null);
    setTypingMsgId(null);

    const history = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, traceContext: traceContext ?? undefined, chainId }),
      });
      const data = await res.json();
      const actions: AgentAction[] = Array.isArray(data.actions) ? data.actions : [];
      const reply = data.reply ?? '(no response)';

      // Immediately add assistant message to history — stored regardless of typewriter state
      const assistantMsg: Message = { role: 'assistant', content: reply, id: ++msgId };
      setMessages(prev => [...prev, assistantMsg]);
      setLoading(false);
      setTypingMsgId(assistantMsg.id);
      setStreamingText(reply);

      if (actions.length > 0) {
        setPendingActions(actions);
      }
    } catch (err) {
      setLoading(false);
      const errMsg = err instanceof Error ? err.message : 'Request failed';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}`, id: ++msgId }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isTyping, traceContext, chainId]);

  // Keep ref updated so effects can call sendMessage without stale closure
  sendMessageRef.current = sendMessage;

  // Auto-summarize: fires when drawer opens with an unseen trace, or when a new trace arrives while open.
  useEffect(() => {
    if (!traceContext) return;
    if (traceContext === lastSummarizedTrace) return;
    lastSummarizedTrace = traceContext;
    const t = setTimeout(() => {
      sendMessageRef.current?.('Summarize this transaction concisely — what it does, which protocols are involved, any reverts and why.');
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceContext]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  const executePendingActions = useCallback(async () => {
    if (!pendingActions) return;
    const actions = pendingActions;
    setPendingActions(null);
    setRunningActions(actions);
    await dispatchActions(actions);
    setRunningActions([]);
  }, [pendingActions, dispatchActions]);

  function cancelPendingActions() {
    setPendingActions(null);
  }

  const statusLabel = runningActions.length > 0
    ? actionLabel(runningActions[0])
    : pendingActions ? 'Awaiting confirm'
    : loading ? 'Thinking'
    : isTyping ? 'Speaking'
    : 'Ready';

  const quickActions = hasTrace ? QUICK_ACTIONS_TRACE : QUICK_ACTIONS_GENERAL;

  return (
    <div className={styles.mangaOverlay}>
      <div className={styles.agentChatModal}>

        {/* avatar panel — avatar, status, speed, sessions */}
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

          {/* sessions list */}
          <div className={styles.sessionsHeader}>
            <span className={styles.sessionsTitle}>SESSIONS</span>
            <button className={styles.newSessionBtn} onClick={newSession}>[+]</button>
          </div>
          <div className={styles.sessionsList}>
            {sessions.length === 0 && (
              <div className={styles.sessionsEmpty}>No history</div>
            )}
            {sessions.map(s => (
              <div
                key={s.id}
                className={`${styles.sessionItem} ${s.id === activeId ? styles.sessionItemActive : ''}`}
                onClick={() => switchSession(s.id)}
              >
                <div className={styles.sessionItemTitle}>{s.title}</div>
                <div className={styles.sessionItemMeta}>{formatDate(s.updatedAt)}</div>
                <button
                  className={styles.sessionDeleteBtn}
                  onClick={(e) => deleteSession(s.id, e)}
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* chat panel */}
        <div className={styles.mangaSpeechPanel}>
          <div className={styles.mangaPanelHeader}>
            <span className={styles.mangaPanelTitle}>
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
            {messages.length === 0 && (
              <div className={styles.agentEmptyState}>
                Start a conversation or pick a quick action above.
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`${styles.agentMessageRow} ${m.role === 'user' ? styles.agentMessageRowUser : ''}`}>
                <div className={`${styles.agentBubble} ${m.role === 'user' ? styles.agentBubbleUser : styles.agentBubbleAssistant}`}>
                  {m.role === 'user'
                    ? <span className={styles.mangaText}>{m.content}</span>
                    : (
                      <div className={styles.mangaText}>
                        <ReactMarkdown
                          components={m.id === typingMsgId && isTyping ? MD_COMPONENTS_TYPING : undefined}
                        >
                          {m.id === typingMsgId && isTyping ? displayed + CURSOR_MARKER : m.content}
                        </ReactMarkdown>
                      </div>
                    )
                  }
                </div>
              </div>
            ))}

            {/* Loading dots — only while waiting for response (before assistant msg is added) */}
            {loading && (
              <div className={styles.agentMessageRow}>
                <div className={`${styles.agentBubble} ${styles.agentBubbleAssistant}`}>
                  <div className={styles.mangaThinking}>
                    <span className={styles.mangaDot} style={{ animationDelay: '0s' }} />
                    <span className={styles.mangaDot} style={{ animationDelay: '0.2s' }} />
                    <span className={styles.mangaDot} style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Pending actions — awaiting user confirmation */}
            {pendingActions && pendingActions.length > 0 && (
              <div className={styles.agentMessageRow}>
                <div className={`${styles.agentBubble} ${styles.agentBubbleAssistant} ${styles.agentPlanCard}`}>
                  <div className={styles.agentPlanTitle}>Action plan</div>
                  {pendingActions.map((a, i) => (
                    <div key={i} className={styles.agentPlanItem}>
                      <span className={styles.agentPlanIndex}>{i + 1}</span>
                      {actionLabel(a)}
                    </div>
                  ))}
                  <div className={styles.agentPlanBtns}>
                    <button className={styles.agentPlanAccept} onClick={executePendingActions}>Execute</button>
                    <button className={styles.agentPlanDecline} onClick={cancelPendingActions}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {runningActions.length > 0 && (
              <div className={styles.agentMessageRow}>
                <div className={`${styles.agentBubble} ${styles.agentBubbleAssistant} ${styles.agentActionBubble}`}>
                  {runningActions.map((a, i) => (
                    <div key={i} className={`${styles.agentActionItem} ${i === 0 ? styles.agentActionItemActive : ''}`}>
                      {i === 0 ? '▶' : '·'} {actionLabel(a)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={styles.agentInputRow}>
            <textarea
              className={styles.agentInput}
              rows={2}
              placeholder='Ask anything, or say "trace 0x... on BSC"'
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || isTyping}
            />
            <button className={styles.agentSendBtn}
              onClick={() => sendMessage(input)}
              disabled={loading || isTyping || !input.trim()}>Send</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── FAB ───────────────────────────────────────────────────────────────────────

export default function GlobalAgent() {
  const { isOpen, closeAgent } = useAgent();

  return (
    <>
      {isOpen && (
        <AgentDrawer
          onClose={closeAgent}
        />
      )}
    </>
  );
}
