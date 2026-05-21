'use client';

import { useState, useCallback } from 'react';
import { usePrivateAliases } from '@/contexts/PrivateAliasContext';
import { parseAbiJson, invalidateAliasCache } from '@/lib/abi-decode';
import styles from './PrivateAliasPanel.module.scss';

interface Props {
  onClose: () => void;
}

const EMPTY_FORM = { address: '', label: '', abiRaw: '' };

export default function PrivateAliasPanel({ onClose }: Props) {
  const { aliases, addAlias, removeAlias } = usePrivateAliases();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    setError('');
    const addr = form.address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr)) {
      setError('Invalid address — must be 0x followed by 40 hex chars');
      return;
    }
    if (!form.label.trim()) {
      setError('Label is required');
      return;
    }
    let abi;
    try {
      abi = parseAbiJson(form.abiRaw);
    } catch (e) {
      setError(`Invalid ABI: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    invalidateAliasCache(addr);
    addAlias({ address: addr, label: form.label.trim(), abi });
    setForm(EMPTY_FORM);
  }, [form, addAlias]);

  const handleRemove = useCallback((address: string) => {
    invalidateAliasCache(address);
    removeAlias(address);
    if (expanded === address) setExpanded(null);
  }, [removeAlias, expanded]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>[ PRIVATE ALIASES ]</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.body}>
        <p className={styles.hint}>
          Map unverified contract addresses to their ABI. Decoded function names and args
          appear in the trace — the raw ABI never leaves this browser.
        </p>

        {/* Alias list */}
        {aliases.length === 0 ? (
          <div className={styles.empty}>No aliases yet.</div>
        ) : (
          <ul className={styles.list}>
            {aliases.map(a => (
              <li key={a.address} className={styles.listItem}>
                <div className={styles.listRow}>
                  <div className={styles.listInfo}>
                    <span className={styles.listLabel}>{a.label}</span>
                    <span className={styles.listAddr}>{a.address}</span>
                  </div>
                  <div className={styles.listActions}>
                    <button
                      className={styles.toggleBtn}
                      onClick={() => setExpanded(expanded === a.address ? null : a.address)}
                    >
                      {expanded === a.address ? 'HIDE ABI' : 'SHOW ABI'}
                    </button>
                    <button className={styles.removeBtn} onClick={() => handleRemove(a.address)}>
                      REMOVE
                    </button>
                  </div>
                </div>
                {expanded === a.address && (
                  <pre className={styles.abiPreview}>
                    {JSON.stringify(a.abi, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add form */}
        <div className={styles.form}>
          <div className={styles.formTitle}>ADD ALIAS</div>

          <label className={styles.label}>
            Contract Address
            <input
              className={styles.input}
              placeholder="0x1234…"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              spellCheck={false}
            />
          </label>

          <label className={styles.label}>
            Label / Name
            <input
              className={styles.input}
              placeholder="MyPrivateVault"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              spellCheck={false}
            />
          </label>

          <label className={styles.label}>
            ABI (JSON array)
            <textarea
              className={styles.textarea}
              placeholder={'[\n  { "type": "function", "name": "deposit", ... }\n]'}
              value={form.abiRaw}
              onChange={e => setForm(f => ({ ...f, abiRaw: e.target.value }))}
              spellCheck={false}
              rows={8}
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.addBtn} onClick={handleAdd}>
            + ADD ALIAS
          </button>
        </div>
      </div>
    </div>
  );
}
