import { TabBar, type TabBarItem } from '@/components/ui';
import styles from '../explorer.module.scss';
import type { ExplorerTab } from '../utils';

interface Props {
  activeTab: ExplorerTab;
  tabItems: TabBarItem<ExplorerTab>[];
  onTabChange: (tab: ExplorerTab) => void;
}

export default function ExplorerTraceLoadingWorkspace({
  activeTab,
  tabItems,
  onTabChange,
}: Props) {
  return (
    <main className={styles.resultMain}>
      <div className={styles.toolbar}>
        <TabBar items={tabItems} activeTab={activeTab} onChange={onTabChange} fontSize={12} />
      </div>

        <div className={styles.body}>
          <div className={styles.traceLoadingState}>
            <div className={`${styles.emptyTitle} ${styles.pulse}`}>■ TRACING SUMMARY…</div>
            <div className={styles.emptyHint}>
              Transaction details are ready. Building call trace, events, state diffs, fund flow, gas profile, and call graph.
            </div>
          </div>
        </div>
    </main>
  );
}
