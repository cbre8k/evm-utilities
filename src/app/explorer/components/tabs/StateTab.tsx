import type { AddressStateDiff } from '@/types/explorer';
import { Badge } from '@/components/ui';
import styles from '../../explorer.module.scss';

interface Props { diffs: AddressStateDiff[] }

function weiToEth(v?: string) {
  if (!v) return '—';
  try { return `${BigInt(v).toString()} wei`; } catch { return v; }
}

function delta(before?: string, after?: string) {
  if (!before || !after) return null;
  try {
    const diff = BigInt(after) - BigInt(before);
    if (diff === 0n) return null;
    const sign = diff > 0n ? '+' : '';
    return { label: `${sign}${(Number(diff) / 1e18).toFixed(8)} ETH`, positive: diff > 0n };
  } catch { return null; }
}

function formatSlot(slot: string): string {
  if (slot.startsWith('0x')) {
    return '0x' + slot.slice(2).padStart(64, '0');
  }
  return slot;
}

function formatValue(val: string): string {
  if (!val) return '0x' + '0'.repeat(64);
  if (val.startsWith('0x')) {
    return '0x' + val.slice(2).padStart(64, '0');
  }
  return val;
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
          <div key={diff.address} className={styles.stateCard}>
            <div className={styles.stateCardHeader}>
              <span className={styles.mono}>{diff.address}</span>
              {diff.codeChanged && <Badge fontSize={9}>CODE DEPLOYED</Badge>}
            </div>

            {balDelta && (
              <div className={styles.stateInlineRow}>
                <span className={styles.stateLabel}>BALANCE</span>
                <span className={styles.mono}>{weiToEth(diff.balanceBefore)}</span>
                <span className={styles.stateArrow}>→</span>
                <span className={styles.mono}>{weiToEth(diff.balanceAfter)}</span>
                <span className={styles.mono} style={{ color: balDelta.positive ? '#10b981' : '#ef4444' }}>
                  ({balDelta.label})
                </span>
              </div>
            )}

            {diff.nonceBefore != null && diff.nonceAfter != null && diff.nonceBefore !== diff.nonceAfter && (
              <div className={styles.stateInlineRow}>
                <span className={styles.stateLabel}>NONCE</span>
                <span className={styles.mono}>{diff.nonceBefore ?? '—'}</span>
                <span className={styles.stateArrow}>→</span>
                <span className={styles.mono}>{diff.nonceAfter ?? '—'}</span>
              </div>
            )}

            {diff.storageChanges.length > 0 && (
              <div className={styles.stateStorageBlock}>
                <div className={styles.stateLabel}>STORAGE <Badge fontSize={9}>{diff.storageChanges.length}</Badge></div>
                {diff.storageChanges.map((s, i) => (
                  <div key={i} className={styles.stateStorageRow}>
                    <span className={`${styles.mono} ${styles.muted}`}>[{formatSlot(s.slot)}]</span>
                    <span className={styles.mono} style={{ color: '#ef4444' }}>{formatValue(s.before)}</span>
                    <span className={styles.stateArrow}>→</span>
                    <span className={styles.mono} style={{ color: '#10b981' }}>{formatValue(s.after)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
