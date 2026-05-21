'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { invalidateAliasCache } from '@/lib/abi-decode';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AbiItem = Record<string, unknown>;

export interface PrivateAlias {
  address: string;  // always lowercase
  label: string;
  abi: AbiItem[];
}

interface PrivateAliasContextValue {
  aliases: PrivateAlias[];
  addAlias: (alias: PrivateAlias) => void;
  removeAlias: (address: string) => void;
  updateAlias: (address: string, patch: Partial<Omit<PrivateAlias, 'address'>>) => void;
  getAlias: (address: string) => PrivateAlias | undefined;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PrivateAliasContext = createContext<PrivateAliasContextValue | null>(null);

const STORAGE_KEY = 'private_aliases';

function load(): PrivateAlias[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PrivateAlias[]) : [];
  } catch {
    return [];
  }
}

function save(aliases: PrivateAlias[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  } catch { /* storage full or SSR */ }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function PrivateAliasProvider({ children }: { children: ReactNode }) {
  const [aliases, setAliases] = useState<PrivateAlias[]>([]);

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    setAliases(load());
  }, []);

  const update = useCallback((next: PrivateAlias[]) => {
    setAliases(next);
    save(next);
  }, []);

  const addAlias = useCallback((alias: PrivateAlias) => {
    const norm = { ...alias, address: alias.address.toLowerCase() };
    update([...aliases.filter(a => a.address !== norm.address), norm]);
  }, [aliases, update]);

  const removeAlias = useCallback((address: string) => {
    const norm = address.toLowerCase();
    invalidateAliasCache(norm);
    update(aliases.filter(a => a.address !== norm));
  }, [aliases, update]);

  const updateAlias = useCallback((address: string, patch: Partial<Omit<PrivateAlias, 'address'>>) => {
    const norm = address.toLowerCase();
    invalidateAliasCache(norm);
    update(aliases.map(a => a.address === norm ? { ...a, ...patch } : a));
  }, [aliases, update]);

  const getAlias = useCallback((address: string) => {
    return aliases.find(a => a.address === address.toLowerCase());
  }, [aliases]);

  return (
    <PrivateAliasContext.Provider value={{ aliases, addAlias, removeAlias, updateAlias, getAlias }}>
      {children}
    </PrivateAliasContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrivateAliases(): PrivateAliasContextValue {
  const ctx = useContext(PrivateAliasContext);
  if (!ctx) throw new Error('usePrivateAliases must be inside PrivateAliasProvider');
  return ctx;
}
