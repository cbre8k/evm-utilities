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
    <main className={styles.resultMain}>
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <div className={styles.toolbar}>
        <TabBar items={tabItems} activeTab={activeTab} onChange={onTabChange} fontSize={10} />
      </div>

      <div className={styles.body}>
        <div className={styles.traceLoadingState}>
          <div className={styles.emptyTitle} style={{ display: 'flex', alignItems: 'center' }}>
            <span className="retro-spinner" />
            <span>TRACING SUMMARY…</span>
          </div>
          <div className={styles.emptyHint}>
            Transaction details are ready. Building call trace, events, state diffs, fund flow, gas profile, and call graph.
          </div>
        </div>
      </div>
    </main>
  );
}
