'use client';

import { TabBar, type TabBarItem } from '@/components/ui';
import type { TraceResult } from '@/types/explorer';
import styles from '../explorer.module.scss';
import type { ExplorerTab } from '../utils';
import EventsTab from './tabs/EventsTab';
import FundFlowTab from './tabs/FundFlowTab';
import GasProfilerTab from './tabs/GasProfilerTab';
import StateTab from './tabs/StateTab';
import SummaryTab from './tabs/SummaryTab';

interface Props {
  activeTab: ExplorerTab;
  result: TraceResult;
  shareHash?: string;
  tabItems: TabBarItem<ExplorerTab>[];
  totalGas: number;
  onTabChange: (tab: ExplorerTab) => void;
  onOpenAgent: () => void;
}

export default function ExplorerResultWorkspace({
  activeTab,
  result,
  shareHash,
  tabItems,
  totalGas,
  onTabChange,
  onOpenAgent,
}: Props) {
  return (
    <main className={styles.resultMain}>
      <div className={styles.toolbar}>
        <TabBar items={tabItems} activeTab={activeTab} onChange={onTabChange} fontSize={10} />
      </div>

      <div className={styles.body}>
        {activeTab === 'summary' && (
          <SummaryTab
            txOverview={result.txOverview}
            decodedCalldata={result.decodedCalldata}
            decodedOutput={result.decodedOutput}
            rawOutput={result.normalizedTree?.output}
            root={result.normalizedTree}
            structLog={result.structLog}
            allLogs={result.allLogs}
            addressLabels={result.addressLabels}
            tokenLabels={result.tokenLabels}
            stateDiffs={result.stateDiffs ?? []}
            chainId={result.chainId ?? 1}
            shareHash={shareHash}
            onOpenAgent={onOpenAgent}
          />
        )}

        {activeTab === 'events' && (
          <EventsTab logs={result.allLogs ?? []} />
        )}

        {activeTab === 'state' && (
          <StateTab diffs={result.stateDiffs ?? []} />
        )}

        {activeTab === 'flow' && (
          <FundFlowTab
            nativeTransfers={result.nativeTransfers ?? []}
            erc20Transfers={result.erc20Transfers ?? []}
            erc721Transfers={result.erc721Transfers ?? []}
            erc1155Transfers={result.erc1155Transfers ?? []}
            assetChanges={result.asset_changes ?? []}
            exposureChanges={result.exposure_changes ?? []}
            balanceChanges={result.balance_changes ?? []}
            tokenLabels={result.tokenLabels ?? {}}
            addressLabels={result.addressLabels ?? {}}
            txSender={result.txOverview?.from}
            transferCount={(result.nativeTransfers?.length ?? 0)
              + (result.erc20Transfers?.length ?? 0)
              + (result.erc721Transfers?.length ?? 0)
              + (result.erc1155Transfers?.length ?? 0)}
          />
        )}

        {activeTab === 'gas' && result.gasTree && (
          <GasProfilerTab
            gasTree={result.gasTree}
            root={result.normalizedTree}
            structLog={result.structLog}
            allLogs={result.allLogs}
            totalGas={totalGas}
          />
        )}
        {activeTab === 'gas' && !result.gasTree && (
          <div className={styles.tabContent}>
            <div className={styles.emptyHint} style={{ padding: 32, textAlign: 'center' }}>
              Gas profiling data is not available for this transaction.
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
