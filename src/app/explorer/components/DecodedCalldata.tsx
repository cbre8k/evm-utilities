import type { DecodedCalldata as DecodedCalldataType } from '@/types/explorer';
import styles from '../explorer.module.scss';

interface Props { data: DecodedCalldataType }

export default function DecodedCalldata({ data }: Props) {
  return (
    <div className={styles.overviewSection}>
      <div className={styles.overviewSectionHeader}>
        ■ CALLDATA &nbsp;
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{data.selector}</span>
      </div>
      <div className={styles.fnSig}>{data.functionName}</div>
      {data.args.map((arg, i) => (
        <div key={i} className={styles.argRow}>
          <div className={styles.argType}>{arg.type}</div>
          <div className={styles.argVal}>{arg.value || arg.name || `arg${i}`}</div>
        </div>
      ))}
    </div>
  );
}
