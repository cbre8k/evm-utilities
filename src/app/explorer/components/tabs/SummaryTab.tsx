'use client';

import { useState } from 'react';
import type {
  TxOverview,
  TraceNode, AddressStateDiff, FilteredStructLog,
  DecodedCalldata, DecodedOutput,
} from '@/types/explorer';
import { CopyButton, Label, TabBar, type TabBarItem } from '@/components/ui';
import styles from '../../explorer.module.scss';
import CallTraceTab from './CallTraceTab';

type IoTab = 'decoded' | 'raw';
const IO_TABS: TabBarItem<IoTab>[] = [
  { id: 'decoded', label: 'DECODED' },
  { id: 'raw', label: 'RAW' },
];

function parseDecodedArgValue(type: string, value: string): string | string[] {
  if (type.endsWith('[]')) {
    if (value === '[]') return [];
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((item) => item.trim());
    }
  }

  return value === '' ? '""' : value;
}

function hasMeaningfulDecodedInput(decodedCalldata: DecodedCalldata | undefined) {
  if (!decodedCalldata?.functionName) return false;
  if (decodedCalldata.args.length === 0) return true;
  return decodedCalldata.args.some((arg) => {
    const value = arg.value.trim();
    return value !== '' && value !== '""';
  });
}

function hasMeaningfulDecodedOutput(decodedOutput: DecodedOutput | undefined) {
  if (!decodedOutput?.functionName || decodedOutput.values.length === 0) return false;
  return decodedOutput.values.some((output) => {
    const value = output.value.trim();
    return value !== '' && value !== '""';
  });
}

interface Props {
  txOverview: TxOverview;
  decodedCalldata?: DecodedCalldata;
  decodedOutput?: DecodedOutput;
  rawOutput?: string;
  root?: TraceNode;
  structLog?: FilteredStructLog[];
  allLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>;
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  stateDiffs?: AddressStateDiff[];
  chainId?: number;
  shareHash?: string;
  onOpenAgent?: () => void;
}

export default function SummaryTab({
  txOverview, decodedCalldata, decodedOutput, rawOutput,
  root, structLog, allLogs, addressLabels, tokenLabels, stateDiffs, chainId = 1,
  onOpenAgent,
}: Props) {
  const [inputTab, setInputTab] = useState<IoTab>('raw');
  const [outputTab, setOutputTab] = useState<IoTab>('raw');
  const rawInput = txOverview.input || '0x';
  const rawOutputValue = rawOutput || '—';
  const canDecodeInput = hasMeaningfulDecodedInput(decodedCalldata);
  const canDecodeOutput = hasMeaningfulDecodedOutput(decodedOutput);
  const activeInputTab: IoTab = canDecodeInput ? inputTab : 'raw';
  const activeOutputTab: IoTab = canDecodeOutput ? outputTab : 'raw';
  const inputTabItems = IO_TABS.map(item => item.id === 'decoded' ? { ...item, disabled: !canDecodeInput } : item);
  const outputTabItems = IO_TABS.map(item => item.id === 'decoded' ? { ...item, disabled: !canDecodeOutput } : item);
  const decodedInputJson = decodedCalldata
    ? JSON.stringify(
        Object.fromEntries(
          decodedCalldata.args.map((arg, index) => [
            arg.name || `arg${index}`,
            parseDecodedArgValue(arg.type, arg.value),
          ]),
        ),
        null,
        2,
      )
    : rawInput;
  const decodedOutputJson = decodedOutput
    ? JSON.stringify(
        Object.fromEntries(
          decodedOutput.values.map((output, index) => [
            output.name || `output${index}`,
            parseDecodedArgValue(output.type, output.value),
          ]),
        ),
        null,
        2,
      )
    : rawOutputValue;

  return (
    <div className={styles.tabContent}>
      <div className={`${styles.section} ${styles.summaryIoSection}`}>
        <div className={styles.sectionHeader}>
          <span>■ INPUT / OUTPUT</span>
        </div>
        <div className={styles.sectionBody}>
          {canDecodeInput && decodedCalldata && (
            <div className={styles.fnName}>{decodedCalldata.functionName}</div>
          )}
          <div className={styles.ioRow}>
            <div className={styles.ioPanel}>
              <div className={styles.ioPanelHeader}>
                <Label className={styles.ioPanelLabel} fontSize={11}>Input</Label>
                <TabBar
                  activeTab={activeInputTab}
                  className={styles.ioInnerTabs}
                  fontSize={9}
                  items={inputTabItems}
                  onChange={setInputTab}
                />
                <CopyButton text={activeInputTab === 'decoded' ? decodedInputJson : rawInput} />
              </div>
              <div className={styles.ioPanelBody}>
                {activeInputTab === 'decoded' ? (
                  <pre className={styles.ioPre}>{decodedInputJson}</pre>
                ) : (
                  <pre className={styles.ioPre}>{rawInput}</pre>
                )}
              </div>
            </div>
            <div className={styles.ioPanel}>
              <div className={styles.ioPanelHeader}>
                <Label className={styles.ioPanelLabel} fontSize={11}>Output</Label>
                <TabBar
                  activeTab={activeOutputTab}
                  className={styles.ioInnerTabs}
                  fontSize={9}
                  items={outputTabItems}
                  onChange={setOutputTab}
                />
                <CopyButton text={activeOutputTab === 'decoded' ? decodedOutputJson : (rawOutputValue === '—' ? '' : rawOutputValue)} />
              </div>
              <div className={styles.ioPanelBody}>
                {activeOutputTab === 'decoded' ? (
                  <pre className={styles.ioPre}>{decodedOutputJson}</pre>
                ) : (
                  <pre className={styles.ioPre}>{rawOutputValue}</pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Call Trace ── */}
      {root && (
        <CallTraceTab
          root={root}
          structLog={structLog}
          allLogs={allLogs}
          addressLabels={addressLabels}
          tokenLabels={tokenLabels}
          tokenAddresses={Object.keys(tokenLabels ?? {})}
          stateDiffs={stateDiffs ?? []}
          chainId={chainId}
          embedded
        />
      )}
    </div>
  );
}
