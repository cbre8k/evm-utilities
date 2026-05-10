'use client';

import { useState } from 'react';
import styles from './share.module.scss';
import TxOverview from '../../explorer/components/TxOverview';
import CallTraceTree from '../../explorer/components/CallTraceTree';
import TokenTransfers from '../../explorer/components/TokenTransfers';
import DecodedCalldata from '../../explorer/components/DecodedCalldata';
import type { ShareData } from '@/types/share';

// Reuse explorer styles for panels
import explorerStyles from '../../explorer/explorer.module.scss';

interface Props {
  hash: string;
  initialShare: ShareData | null;
}

export default function SharePageClient({ hash, initialShare }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!initialShare) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <div>✖ SHARE NOT FOUND</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Hash <code>{hash}</code> does not exist or was never created.
          </div>
        </div>
      </div>
    );
  }

  const share = initialShare;
  const isTrace = share.type === 'trace';
  const createdAt = new Date(share.createdAt).toUTCString();
  const tokenTransfers = isTrace ? share.tokenTransfers ?? [] : [];

  return (
    <div className={styles.page}>
      {/* ── Read-only banner ── */}
      <div className={styles.readonlyBanner}>
        <div className={styles.bannerLeft}>
          <span>■ SHARED VIEW</span>
          <span className={styles.bannerHash}>{hash}</span>
          <span className={styles.bannerDate}>{createdAt}</span>
          <span className={styles.bannerViews}>👁 {share.viewCount}</span>
        </div>
        <button
          className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
          onClick={handleCopy}
        >
          {copied ? '✓ COPIED' : '⎘ COPY LINK'}
        </button>
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>
        {isTrace ? (
          <>
            {share.txOverview && (
              <TxOverview data={share.txOverview}/>
            )}
            {share.decodedCalldata && (
              <DecodedCalldata data={share.decodedCalldata} />
            )}
            {tokenTransfers.length > 0 && (
              <TokenTransfers transfers={tokenTransfers} />
            )}
            {share.normalizedTrace && (
              <CallTraceTree root={share.normalizedTrace} />
            )}
          </>
        ) : (
          <>
            {/* Simulate share */}
            <div className={explorerStyles.panel}>
              <div className={explorerStyles.panelHeader}>
                <span className={explorerStyles.panelTitle}>■ SIMULATION INPUTS</span>
                <span>
                  {share.simulateSuccess
                    ? <span className={styles.successBadge}>SUCCESS</span>
                    : <span className={styles.failedBadge}>FAILED</span>
                  }
                </span>
              </div>
              <div className={styles.simulateInputs}>
                {share.simulateInputs && Object.entries(share.simulateInputs)
                  .filter(([, v]) => v !== '' && v !== false && v !== '0')
                  .map(([k, v]) => (
                    <div className={styles.inputRow} key={k}>
                      <div className={styles.inputKey}>{k.toUpperCase()}</div>
                      <div className={styles.inputVal}>{String(v)}</div>
                    </div>
                  ))}
              </div>
            </div>

            <div className={explorerStyles.panel}>
              <div className={explorerStyles.panelHeader}>
                <span className={explorerStyles.panelTitle}>■ FORGE OUTPUT</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  exit {share.simulateExitCode ?? '—'}
                </span>
              </div>
              <pre className={styles.simulateOutput}>
                {share.simulateOutput ?? '(no output)'}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
