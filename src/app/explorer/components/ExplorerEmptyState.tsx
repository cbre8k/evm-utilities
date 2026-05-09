import styles from '../explorer.module.scss';
import type { PageState } from '../utils';

interface Props {
  state: PageState;
  status: string;
}

export default function ExplorerEmptyState({ state, status }: Props) {
  return (
    <div className={styles.body}>
      {state === 'idle' && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>TRANSACTION EXPLORER</div>
          <div className={styles.emptyHint}>
            Get full call trace, decoded calldata, token transfers,<br />
            events, state diffs, fund flows, gas profile, and a share link.
          </div>
        </div>
      )}

      {state === 'loading' && (
        <div className={styles.emptyState}>
          <div className={`${styles.emptyTitle} ${styles.pulse}`}>■ FETCHING TRACE…</div>
        </div>
      )}

      {state === 'error' && (
        <div className={styles.errorBox}>✖ {status}</div>
      )}
    </div>
  );
}
