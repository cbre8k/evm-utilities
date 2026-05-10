import type { TokenTransfer } from '@/types/explorer';
import styles from '../explorer.module.scss';

function addr(v: string) {
  return v.length > 18 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

interface Props { transfers: TokenTransfer[] }

export default function TokenTransfers({ transfers }: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>■ TOKEN TRANSFERS</span>
        <span className={styles.panelBadge}>{transfers.length}</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>TOKEN</th>
            <th className={styles.th}>FROM</th>
            <th className={styles.th}>TO</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>AMOUNT (raw)</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t, i) => (
            <tr key={i}>
              <td className={styles.td}>{addr(t.tokenAddress)}</td>
              <td className={styles.td}>{addr(t.from)}</td>
              <td className={styles.td}>{addr(t.to)}</td>
              <td className={styles.td}>{t.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
