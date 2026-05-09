import type { AddressStateDiff } from '@/types/explorer';
import styles from '../../explorer.module.scss';

interface Props { diffs: AddressStateDiff[] }

function weiToEth(v?: string) {
  if (!v) return '—';
  try { return `${(Number(BigInt(v)) / 1e18).toFixed(8)} ETH`; } catch { return v; }
}

function delta(before?: string, after?: string) {
  if (!before || !after) return null;
  try {
    const diff = BigInt(after) - BigInt(before);
    if (diff === 0n) return null;
    return { label: `${diff > 0n ? '+' : ''}${(Number(diff) / 1e18).toFixed(8)} ETH`, positive: diff > 0n };
  } catch { return null; }
}

export default function StateTab({ diffs }: Props) {
  if (!diffs.length) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}><span>■ STATE CHANGES</span></div>
          <div className={styles.emptyHint} style={{ padding: 16 }}>
            No state changes detected (prestateTracer may not be supported by this RPC).
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {diffs.map(diff => {
        const balDelta = delta(diff.balanceBefore, diff.balanceAfter);
        return (
          <div key={diff.address} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.mono}>{diff.address}</span>
              {diff.codeChanged && <span className={styles.panelBadge} style={{ background: '#fef3c7', color: '#92400e' }}>CODE DEPLOYED</span>}
            </div>
            <div className={styles.sectionBody} style={{ padding: 0 }}>
              {(diff.balanceBefore || diff.balanceAfter) && (
                <div className={styles.stateSection}>
                  <div className={styles.stateSectionTitle}>ETH BALANCE</div>
                  <div className={styles.stateRow}><span className={styles.muted}>BEFORE</span><span className={styles.mono}>{weiToEth(diff.balanceBefore)}</span></div>
                  <div className={styles.stateRow}><span className={styles.muted}>AFTER</span><span className={styles.mono}>{weiToEth(diff.balanceAfter)}</span></div>
                  {balDelta && (
                    <div className={styles.stateRow}>
                      <span className={styles.muted}>DELTA</span>
                      <span className={styles.mono} style={{ color: balDelta.positive ? '#10b981' : '#ef4444' }}>{balDelta.label}</span>
                    </div>
                  )}
                </div>
              )}
              {diff.nonceBefore !== diff.nonceAfter && diff.nonceBefore !== undefined && (
                <div className={styles.stateSection}>
                  <div className={styles.stateSectionTitle}>NONCE</div>
                  <div className={styles.stateRow}><span className={styles.muted}>BEFORE</span><span>{diff.nonceBefore}</span></div>
                  <div className={styles.stateRow}><span className={styles.muted}>AFTER</span><span>{diff.nonceAfter}</span></div>
                </div>
              )}
              {diff.storageChanges.length > 0 && (
                <div className={styles.stateSection}>
                  <div className={styles.stateSectionTitle}>STORAGE ({diff.storageChanges.length} slots)</div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>SLOT</th>
                        <th className={styles.th}>BEFORE</th>
                        <th className={styles.th}>AFTER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.storageChanges.map((s, i) => (
                        <tr key={i}>
                          <td className={`${styles.td} ${styles.mono} ${styles.muted}`}>{s.slot.slice(0, 14)}…</td>
                          <td className={`${styles.td} ${styles.mono}`} style={{ color: '#ef4444' }}>{s.before}</td>
                          <td className={`${styles.td} ${styles.mono}`} style={{ color: '#10b981' }}>{s.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
