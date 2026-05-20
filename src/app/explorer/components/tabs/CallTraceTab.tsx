'use client';

import { useState, useMemo, useEffect } from 'react';
import type { AddressStateDiff, FilteredStructLog, TraceNode } from '@/types/explorer';
import styles from '../../explorer.module.scss';
import { buildFromStructLog, buildFlatEntries, buildTraceTree, parseGas, collectAllFrameIds } from './callTraceBuild';
import { TraceTree } from './callTraceTree';
import TraceSummaryDrawer from './TraceSummaryDrawer';
import CallGraphTab from './CallGraphTab';
import type { ContractSourceBundle, SourceSelection } from './sourceMapTypes';
import { pickFileByName } from './sourceMapUtils';
import SourceMapInspector from './SourceMapInspector';

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

type SourceCache = Record<string, ContractSourceBundle | null>;

export default function CallTraceTab({
  root,
  structLog,
  allLogs,
  addressLabels = {},
  tokenLabels = {},
  tokenAddresses = [],
  stateDiffs = [],
  chainId = 1,
  embedded = false,
}: Props) {
  const rootNode = useMemo<TraceNode>(() => root ?? {
    id: 'missing-root',
    depth: 0,
    type: 'CALL',
    from: '',
    to: null,
    input: '0x',
    output: '0x',
    value: '0x0',
    gas: '0x0',
    gasUsed: '0x0',
    children: [],
  }, [root]);

  const tokenAddressSet = useMemo(
    () => new Set(tokenAddresses.map((address) => address.toLowerCase())),
    [tokenAddresses],
  );

  const allEntries = useMemo(
    () => (structLog && structLog.length > 0)
      ? buildFromStructLog(structLog, rootNode, allLogs)
      : buildFlatEntries(rootNode, stateDiffs),
    [rootNode, stateDiffs, structLog, allLogs],
  );
  const treeItems = useMemo(() => buildTraceTree(allEntries), [allEntries]);
  const callCount = useMemo(
    () => allEntries.filter(entry => entry.kind === 'call').length,
    [allEntries],
  );

  const totalGas = useMemo(() => parseGas(rootNode.gasUsed) || 1, [rootNode.gasUsed]);
  const [openCalls, setOpenCalls] = useState<Record<string, boolean>>(() => ({ [rootNode.id]: true }));
  const [selectedOpcodeId, setSelectedOpcodeId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [sourceCache, setSourceCache] = useState<SourceCache>({});
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [hoveredTraceId, setHoveredTraceId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const handleExpandAll = () => {
    const ids = collectAllFrameIds(treeItems);
    const map: Record<string, boolean> = {};
    for (const id of ids) map[id] = true;
    setOpenCalls(map);
  };

  const handleCollapseAll = () => {
    setOpenCalls({});
  };

  useEffect(() => {
    setSelectedOpcodeId(null);
    setSelection(null);
    setSourceLoading(false);
    setSourceError(null);
  }, [rootNode]);

  async function loadSourceBundle(address: string) {
    const key = address.toLowerCase();
    if (sourceCache[key] !== undefined) return sourceCache[key];

    setSourceLoading(true);
    setSourceError(null);
    try {
      const res = await fetch(`/api/etherscan/${chainId}/${key}`);
      if (!res.ok) throw new Error('Source not verified on Etherscan');
      const data = await res.json();
      const bundle: ContractSourceBundle = {
        address: data.address,
        contractName: data.contractName ?? null,
        compilerVersion: data.compilerVersion ?? undefined,
        sources: data.sources ?? [],
      };
      setSourceCache((current) => ({ ...current, [key]: bundle }));
      return bundle;
    } catch (err) {
      setSourceCache((current) => ({ ...current, [key]: null }));
      setSourceError(err instanceof Error ? err.message : 'Failed to load source');
      return null;
    } finally {
      setSourceLoading(false);
    }
  }

  async function handleSelectOpcode(entry: import('./callTraceTypes').OpcodeEntry, id: string) {
    setSelectedOpcodeId(id);
    setSourceError(null);
    if (!entry.address) {
      setSelection({ address: '', opcode: entry.op, pc: entry.pc });
      setSourceError('Opcode does not have a contract address.');
      return;
    }

    const bundle = await loadSourceBundle(entry.address);
    if (!bundle) {
      setSelection({ address: entry.address, opcode: entry.op, pc: entry.pc });
      return;
    }
    let file = pickFileByName(bundle, entry.file);
    let errorMessage: string | null = null;
    if (!file && bundle) {
      const fallback = bundle.sources[0];
      if (fallback) {
        file = fallback;
        errorMessage = `Source file ${entry.file ?? '(unknown)'} not found. Showing ${fallback.name}.`;
      } else {
        errorMessage = `Source file ${entry.file ?? '(unknown)'} not found in verified contract.`;
      }
    }
    setSelection({
      address: entry.address,
      file,
      line: entry.line,
      start: entry.sourceStart,
      length: entry.sourceLength,
      opcode: entry.op,
      pc: entry.pc,
    });
    if (errorMessage) setSourceError(errorMessage);
  }

  const selectedBundle = selection?.address
    ? sourceCache[selection.address.toLowerCase()] ?? null
    : null;
  const finalSelection = selection;

  return (
    <div className={embedded ? styles.traceEmbedded : styles.tabContent}>
      <div className={`${styles.section} ${styles.traceSection}`.trim()}>
        <div className={styles.sectionHeader}>
          <span>■ CALL TRACE</span>
          <div className={styles.traceToolbar}>
            <span className={styles.traceStatsText}>
              {callCount} calls · {allEntries.length} steps · {totalGas.toLocaleString()} gas
            </span>
            <button
              className={styles.traceIconBtn}
              title="Expand all"
              onClick={handleExpandAll}
            >
              {/* expand arrows */}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2h4M2 2v4M14 2h-4M14 2v4M2 14h4M2 14v-4M14 14h-4M14 14v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={styles.traceIconBtn}
              title="Collapse all"
              onClick={handleCollapseAll}
            >
              {/* collapse arrows */}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 2L2 6M10 2l4 4M6 14l-4-4M10 14l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={`${styles.traceIconBtn} ${styles.traceAgentBtn}`}
              title="Ask agent for trace summary"
              onClick={() => setSummaryOpen((v) => !v)}
            >
              {/* sparkle / agent */}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.22 3.22l2.12 2.12M10.66 10.66l2.12 2.12M3.22 12.78l2.12-2.12M10.66 5.34l2.12-2.12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
              Summary
            </button>
          </div>
        </div>

        <div className={styles.traceSplit}>
          <div className={styles.tracePane}>
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
                  onSelectOpcode={handleSelectOpcode}
                  selectedOpcodeId={selectedOpcodeId}
                  onHoverNode={(id) => setHoveredTraceId(id)}
                  onLeaveNode={() => setHoveredTraceId(null)}
                />
              </div>
            </div>
            {!embedded && (
              <div className={styles.sourcePane}>
                <SourceMapInspector
                  selection={finalSelection}
                  bundle={selectedBundle ?? null}
                  isLoading={sourceLoading}
                  error={sourceError}
                  onClose={() => setSelection(null)}
                />
              </div>
            )}
          </div>
          <div className={styles.callGraphPane}>
            <CallGraphTab
              root={rootNode}
              structLog={structLog}
              allLogs={allLogs}
              stateDiffs={stateDiffs}
              addressLabels={addressLabels}
              tokenLabels={tokenLabels}
              tokenAddresses={tokenAddresses}
              selectedNodeId={hoveredTraceId}
            />
          </div>
        </div>
      </div>
      {summaryOpen && (
        <TraceSummaryDrawer
          items={treeItems}
          chainId={chainId}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
