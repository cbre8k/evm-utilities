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
}

export default function ExplorerResultWorkspace({
  activeTab,
  result,
  shareHash,
  tabItems,
  totalGas,
  onTabChange,
}: Props) {
  return (
    <main className={styles.resultMain}>
      <div className={styles.toolbar}>
        <TabBar items={tabItems} activeTab={activeTab} onChange={onTabChange} fontSize={12} />
      </div>

      <div className={styles.body}>
        {activeTab === 'summary' && (
          <SummaryTab
            txOverview={result.txOverview}
            decodedCalldata={result.decodedCalldata}
            decodedOutput={result.decodedOutput}
            nativeTransfers={result.nativeTransfers ?? []}
            erc20Transfers={result.erc20Transfers ?? []}
            erc721Transfers={result.erc721Transfers ?? []}
            erc1155Transfers={result.erc1155Transfers ?? []}
            rawOutput={result.normalizedTree?.output}
            root={result.normalizedTree}
            structLog={result.structLog}
            allLogs={result.allLogs}
            addressLabels={result.addressLabels}
            tokenLabels={result.tokenLabels}
            stateDiffs={result.stateDiffs ?? []}
            chainId={result.chainId ?? 1}
            shareHash={shareHash}
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
      </div>
    </main>
  );
}
