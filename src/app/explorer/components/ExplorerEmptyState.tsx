import { BarcodeDeco } from '@/components/ui';
import styles from '../explorer.module.scss';
import type { PageState } from '../utils';

interface Props {
  state: PageState;
  status: string;
}

export default function ExplorerEmptyState({ state, status }: Props) {
  const keyframes = `
    @keyframes asciiSpinner {
      0% { content: '[ / ]'; }
      25% { content: '[ - ]'; }
      50% { content: '[ \\\\ ]'; }
      75% { content: '[ | ]'; }
    }
    .retro-spinner::before {
      content: '[ / ]';
      animation: asciiSpinner 0.8s step-end infinite;
      font-family: monospace;
      margin-right: 8px;
    }
  `;

  return (
    <div className={styles.body}>
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
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
        <div className={styles.emptyState} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div className={styles.emptyTitle} style={{ display: 'flex', alignItems: 'center' }}>
            <span className="retro-spinner" />
            <span>LOADING DATA…</span>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '32px 16px' }}>
          <div style={{ width: '100%', maxWidth: '480px', border: '1px solid var(--color-danger)', background: 'var(--bg-primary)' }}>
            <div style={{ borderBottom: '1px solid var(--color-danger)', padding: '6px 12px', background: 'var(--color-danger)', color: 'var(--bg-primary)', fontWeight: 'bold', fontSize: '11px' }}>
              [ SYSTEM_FAULT ]
            </div>
            <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-danger)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>CODE   : EXPLOIT_OR_RPC_ERROR</div>
              <div>MODULE : TRACE_LOADER</div>
              <div>DETAILS: {status.toUpperCase()}</div>
              <div style={{ marginTop: '8px', borderTop: '1px dashed var(--color-danger)', paddingTop: '8px', color: 'var(--text-secondary)' }}>
                ACTION : RETRY SEQUENCE OR VERIFY TARGET RPC ENDPOINT
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
