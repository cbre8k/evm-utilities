import type { TxOverview as TxOverviewData } from '@/types/explorer';
import styles from '../explorer.module.scss';

function hex(v: string) {
  try { return BigInt(v).toLocaleString(); } catch { return v; }
}
function eth(v: string) {
  try {
    const n = Number(BigInt(v)) / 1e18;
    return n === 0 ? '0 ETH' : `${n.toFixed(6)} ETH`;
  } catch { return v; }
}
function gwei(v: string) {
  try { return `${(Number(BigInt(v)) / 1e9).toFixed(2)} Gwei`; } catch { return v; }
}
function addr(v: string | null) {
  if (!v) return 'Contract Create';
  return v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-8)}` : v;
}

interface Props { data: TxOverviewData }

export default function TxOverview({ data }: Props) {
  const isSuccess = data.status === 'success';

  const rows = [
    ['STATUS', <span key="s" className={isSuccess ? styles.statusSuccess : styles.statusFailed}>{data.status.toUpperCase()}</span>],
    ['BLOCK',  data.blockNumber.toLocaleString()],
    ['FROM',   <span key="f" className={styles.mono}>{addr(data.from)}</span>],
    ['TO',     <span key="t" className={styles.mono}>{addr(data.to)}</span>],
    ['VALUE',  eth(data.value)],
    ['GAS USED', hex(data.gasUsed)],
    ['GAS LIMIT', hex(data.gasLimit)],
    ['GAS PRICE', gwei(data.gasPrice)],
    ['NONCE',  data.nonce],
    ['TX IDX', data.txIndex],
  ] as const;

  return (
    <div className={styles.overviewSection}>
      <div className={styles.overviewSectionHeader}>■ OVERVIEW</div>
      {rows.map(([k, v]) => (
        <div key={String(k)} className={styles.overviewRow}>
          <div className={styles.overviewKey}>{k}</div>
          <div className={styles.overviewVal}>{v}</div>
        </div>
      ))}
    </div>
  );
}
