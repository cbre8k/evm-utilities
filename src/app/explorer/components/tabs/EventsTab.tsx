import type { EventLog } from '@/types/explorer';
import { Badge } from '@/components/ui';
import { copyWithFirework } from '@/utils/copyAnimation';
import styles from '../../explorer.module.scss';

interface Props { logs: EventLog[] }

function splitDataWords(data: string): string[] {
  if (!data || data === '0x' || data.length <= 2) return [];
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 64) {
    words.push('0x' + hex.slice(i, i + 64));
  }
  return words;
}

// ── Tab component ─────────────────────────────────────────────

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
          <Badge fontSize={9}>{logs.length}</Badge>
        </div>
        <div className={`${styles.sectionBody} ${styles.sectionBodyScroll}`} style={{ padding: 0 }}>
          {logs.map((log, i) => (
            <EventCard key={i} log={log} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventCard({ log }: { log: EventLog }) {
  const hasDecoded = log.decoded && Object.keys(log.decoded).length > 0;
  const dataWords = splitDataWords(log.data);

  return (
    <div className={styles.eventCard}>
      {/* Header: badge index + event name + emitter address */}
      <div className={styles.eventHeader}>
        <Badge fontSize={9}>#{log.logIndex}</Badge>
        <span className={styles.eventName}>{log.eventName ?? 'Unknown Event'}</span>
        <span className={styles.eventAddr} title={log.address} style={{ cursor: 'pointer' }} onClick={() => copyWithFirework(log.address)}>
          {log.address}
        </span>
      </div>

      {/* Decoded parameters — JSON object style */}
      {hasDecoded && (
        <div className={styles.eventObjBlock}>
          <pre className={styles.eventObjPre}>
            {'{'}
            {Object.entries(log.decoded!).map(([k, v], i, arr) => (
              <div key={k} className={styles.eventObjRow}>
                {'  '}<span className={styles.eventObjKey}>{k}</span>
                {': '}
                <span className={styles.eventObjVal}>{String(v)}</span>
                {i < arr.length - 1 ? ',' : ''}
              </div>
            ))}
            {'}'}
          </pre>
        </div>
      )}

      {/* Raw topics + data */}
        <div className={styles.eventRaw}>
          {log.topics.map((t, ti) => (
            <div key={ti} className={styles.eventRawRow}>
              <span className={styles.eventRawLabel}>topic[{ti}]</span>
              <span className={styles.eventRawValue}>{t}</span>
            </div>
          ))}
        {dataWords.length > 0 && dataWords.map((w, wi) => (
          <div key={`d${wi}`} className={styles.eventRawRow}>
            <span className={styles.eventRawLabel}>data[{wi}]</span>
            <span className={styles.eventRawValue} title={w}>{w}</span>
            </div>
        ))}
        </div>
    </div>
  );
}
