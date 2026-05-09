import type { EventLog } from '@/types/explorer';
import styles from '../../explorer.module.scss';

interface Props { logs: EventLog[] }

export default function EventsTab({ logs }: Props) {
  if (!logs.length) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}><span>■ EVENTS</span></div>
          <div className={styles.emptyHint} style={{ padding: 16 }}>No events emitted.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>■ EVENTS</span>
          <span className={styles.panelBadge}>{logs.length}</span>
        </div>
        <div className={styles.sectionBody} style={{ padding: 0 }}>
          {logs.map((log, i) => (
            <div key={i} className={styles.eventCard}>
              <div className={styles.eventHeader}>
                <span className={styles.eventIndex}>#{log.logIndex}</span>
                <span className={styles.eventName}>{log.eventName ?? 'Unknown Event'}</span>
                <span className={`${styles.mono} ${styles.muted}`} title={log.address}>
                  {log.address.slice(0, 12)}…{log.address.slice(-8)}
                </span>
              </div>
              <div className={styles.eventTopics}>
                {log.topics.map((t, ti) => (
                  <div key={ti} className={styles.eventTopic}>
                    <span className={styles.muted}>topic{ti}</span>
                    <span className={styles.mono}>{t}</span>
                  </div>
                ))}
                {log.data && log.data !== '0x' && (
                  <div className={styles.eventTopic}>
                    <span className={styles.muted}>data</span>
                    <span className={`${styles.mono} ${styles.muted}`} style={{ wordBreak: 'break-all' }}>
                      {log.data}
                    </span>
                  </div>
                )}
              </div>
              {log.decoded && Object.keys(log.decoded).length > 0 && (
                <div className={styles.eventDecoded}>
                  {Object.entries(log.decoded).map(([k, v]) => (
                    <div key={k} className={styles.eventDecodedRow}>
                      <span className={styles.muted}>{k}</span>
                      <span className={styles.mono}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
