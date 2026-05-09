'use client';

import { useState, useMemo } from 'react';
import type { AddressStateDiff, FilteredStructLog, TraceNode } from '@/types/explorer';
import styles from '../../explorer.module.scss';
import { buildFromStructLog, buildFlatEntries, buildTraceTree, parseGas } from './callTraceBuild';
import { TraceTree } from './callTraceTree';

// ── Component ─────────────────────────────────────────────────

interface Props {
  root: TraceNode;
  structLog?: FilteredStructLog[];
  allLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>;
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  tokenAddresses?: string[];
  stateDiffs?: AddressStateDiff[];
  chainId?: number;
  embedded?: boolean;
}

export default function CallTraceTab({
  root,
  structLog,
  allLogs,
  addressLabels = {},
  tokenLabels = {},
  tokenAddresses = [],
  stateDiffs = [],
  embedded = false,
}: Props) {
  const tokenAddressSet = useMemo(
    () => new Set(tokenAddresses.map((address) => address.toLowerCase())),
    [tokenAddresses],
  );

  const allEntries = useMemo(
    () => (structLog && structLog.length > 0)
      ? buildFromStructLog(structLog, root, allLogs)
      : buildFlatEntries(root, stateDiffs),
    [root, stateDiffs, structLog, allLogs],
  );
  const treeItems = useMemo(() => buildTraceTree(allEntries), [allEntries]);
  const callCount = useMemo(
    () => allEntries.filter(entry => entry.kind === 'call').length,
    [allEntries],
  );

  const totalGas = useMemo(() => parseGas(root.gasUsed) || 1, [root.gasUsed]);
  const [openCalls, setOpenCalls] = useState<Record<string, boolean>>(() => ({ [root.id]: true }));

  return (
    <div className={embedded ? styles.traceEmbedded : styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>■ CALL TRACE</span>
          <div className={styles.traceToolbar}>
            <span className={styles.traceStatsText}>
              {callCount} calls · {allEntries.length} steps · {totalGas.toLocaleString()} gas
            </span>
          </div>
        </div>

        <div className={styles.traceTreeShell}>
          <div className={styles.traceList}>
            <div className={styles.traceListInner}>
              <TraceTree
                items={treeItems}
                addressLabels={addressLabels}
                tokenLabels={tokenLabels}
                tokenAddresses={tokenAddressSet}
                totalGas={totalGas}
                openCalls={openCalls}
                onToggle={(id) => setOpenCalls((current) => ({ ...current, [id]: !current[id] }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
