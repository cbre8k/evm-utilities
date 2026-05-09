import type { TxOverview } from '@/types/explorer';
import styles from '../explorer.module.scss';

function eth(v: string) {
  try {
    const n = Number(BigInt(v)) / 1e18;
    return `${n.toFixed(8)} ETH`;
  } catch { return v; }
}
function gwei(v: string) {
  try { return `${(Number(BigInt(v)) / 1e9).toFixed(2)} Gwei`; } catch { return v; }
}
function dec(v: string) {
  try { return BigInt(v).toLocaleString(); } catch { return v; }
}

interface Props { txOverview: TxOverview }

export default function StateDiffs({ txOverview }: Props) {
  const gasCostWei = (() => {
    try { return `0x${(BigInt(txOverview.gasUsed) * BigInt(txOverview.gasPrice)).toString(16)}`; }
    catch { return '0x0'; }
  })();

  const rows = [
    {
      account: txOverview.from,
      label: 'Sender',
      delta: `−${eth(txOverview.value)} (value)  −${eth(gasCostWei)} (gas)`,
    },
    ...(txOverview.to && txOverview.value !== '0x0' ? [{
      account: txOverview.to,
      label: 'Receiver',
      delta: `+${eth(txOverview.value)}`,
    }] : []),
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>■ ETH BALANCE CHANGES</span>
        <span className={styles.panelBadge}>
          gas {dec(txOverview.gasUsed)} · {gwei(txOverview.gasPrice)}
        </span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>ROLE</th>
            <th className={styles.th}>ADDRESS</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>CHANGE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={styles.td} style={{ color: 'var(--text-tertiary)' }}>{r.label}</td>
              <td className={styles.td}>{r.account}</td>
              <td className={styles.td} style={{
                textAlign: 'right',
                color: r.delta.startsWith('+') ? '#10b981' : '#ef4444',
              }}>{r.delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
