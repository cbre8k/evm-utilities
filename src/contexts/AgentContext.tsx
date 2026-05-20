'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';

// ── Action types ──────────────────────────────────────────────────────────────

export type AgentAction =
  | { type: 'navigate'; page: string }
  | { type: 'set_tx_hash'; hash: string }
  | { type: 'switch_network'; networkId: string }
  | { type: 'execute_trace' }
  | { type: 'switch_tab'; tab: string };

export type ActionHandler = (action: AgentAction) => void | Promise<void>;

// ── Context value ─────────────────────────────────────────────────────────────

interface AgentContextValue {
  isOpen: boolean;
  traceContext: string | null;
  chainId: number;
  openAgent: () => void;
  closeAgent: () => void;
  setTraceContext: (ctx: string | null, chainId?: number) => void;
  /** Register a handler for one or more action types. Returns unregister fn. */
  registerHandler: (types: AgentAction['type'][], handler: ActionHandler) => () => void;
  /** Dispatch a list of actions to registered handlers, in order. */
  dispatchActions: (actions: AgentAction[]) => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [traceContext, setTraceCtx] = useState<string | null>(null);
  const [chainId, setChainId] = useState(1);

  // Map of action type → list of handlers (last registered wins for uniqueness)
  const handlersRef = useRef<Map<string, ActionHandler>>(new Map());

  function setTraceContext(ctx: string | null, chain = 1) {
    setTraceCtx(ctx);
    setChainId(chain);
  }

  const registerHandler = useCallback((types: AgentAction['type'][], handler: ActionHandler) => {
    for (const t of types) handlersRef.current.set(t, handler);
    return () => {
      for (const t of types) {
        if (handlersRef.current.get(t) === handler) handlersRef.current.delete(t);
      }
    };
  }, []);

  const dispatchActions = useCallback(async (actions: AgentAction[]) => {
    for (const action of actions) {
      const handler = handlersRef.current.get(action.type);
      if (handler) await handler(action);
      // Small delay between actions so UI transitions are visible
      await new Promise(r => setTimeout(r, 300));
    }
  }, []);

  return (
    <AgentContext.Provider value={{
      isOpen, traceContext, chainId,
      openAgent: () => setIsOpen(true),
      closeAgent: () => setIsOpen(false),
      setTraceContext,
      registerHandler,
      dispatchActions,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
