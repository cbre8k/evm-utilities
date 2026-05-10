'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type {
  TxOverview, DecodedCalldata, DecodedOutput, NativeTransfer,
  ERC20Transfer, ERC721Transfer, ERC1155Transfer,
  TraceNode, AddressStateDiff, FilteredStructLog,
} from '@/types/explorer';
import { Badge, CopyButton, Label, TabBar, type TabBarItem } from '@/components/ui';
import styles from '../../explorer.module.scss';
import CallTraceTab from './CallTraceTab';

function addr(v: string | null | undefined, long = false) {
  if (!v) return '—';
  return long ? v : `${v.slice(0, 10)}…${v.slice(-8)}`;
}
function eth(v: string) {
  try {
    const n = Number(BigInt(v)) / 1e18;
    return n === 0 ? '0 ETH' : `${n.toFixed(6)} ETH`;
  } catch { return v; }
}
interface Props {
  txOverview: TxOverview;
  decodedCalldata?: DecodedCalldata;
  decodedOutput?: DecodedOutput;
  nativeTransfers: NativeTransfer[];
  erc20Transfers: ERC20Transfer[];
  erc721Transfers: ERC721Transfer[];
  erc1155Transfers: ERC1155Transfer[];
  rawOutput?: string;
  root?: TraceNode;
  structLog?: FilteredStructLog[];
  allLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>;
  addressLabels?: Record<string, string>;
  tokenLabels?: Record<string, string>;
  stateDiffs?: AddressStateDiff[];
  chainId?: number;
  shareHash?: string;
}

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

export default function SummaryTab({
  txOverview, decodedCalldata, decodedOutput, nativeTransfers,
  erc20Transfers, erc721Transfers, erc1155Transfers,
  rawOutput, root, structLog, allLogs, addressLabels, tokenLabels, stateDiffs, chainId = 1,
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
          ])
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
          ])
        ),
        null,
        2,
      )
    : rawOutputValue;

  return (
    <div className={styles.tabContent}>

      {/* ── Input / Output ── */}
      <Section title="■ INPUT / OUTPUT" badge={canDecodeInput ? decodedCalldata?.selector : undefined}>
        {canDecodeInput && decodedCalldata && (
          <div className={styles.fnName}>{decodedCalldata.functionName}</div>
        )}
        <div className={styles.ioRow}>
          {/* Input panel */}
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
              <CopyButton
                text={activeInputTab === 'decoded' ? decodedInputJson : rawInput}
              />
            </div>
            <div className={styles.ioPanelBody}>
              {activeInputTab === 'decoded' ? (
                <pre className={styles.ioPre}>{decodedInputJson}</pre>
              ) : (
                <pre className={styles.ioPre}>{rawInput}</pre>
              )}
            </div>
          </div>

          {/* Output panel */}
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
              <CopyButton
                text={activeOutputTab === 'decoded' ? decodedOutputJson : (rawOutputValue === '—' ? '' : rawOutputValue)}
              />
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
      </Section>

      {/* ── Native Transfers ── */}
      {nativeTransfers.length > 0 && (
        <Section title="■ NATIVE ETH TRANSFERS" badge={String(nativeTransfers.length)}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>TYPE</th>
                <th className={styles.th}>FROM</th>
                <th className={styles.th}>TO</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>VALUE</th>
              </tr>
            </thead>
            <tbody>
              {nativeTransfers.map((t, i) => (
                <tr key={i}>
                  <td className={styles.td}><span className={`${styles.callBadge} ${styles.CALL}`}>{t.callType}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.from}>{addr(t.from)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.to ?? ''}>{addr(t.to)}</span></td>
                  <td className={styles.td} style={{ textAlign: 'right', color: '#10b981' }}>{eth(t.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── ERC-20 Transfers ── */}
      {erc20Transfers.length > 0 && (
        <Section title="■ ERC-20 TRANSFERS" badge={String(erc20Transfers.length)}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>TOKEN</th>
                <th className={styles.th}>FROM</th>
                <th className={styles.th}>TO</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>AMOUNT (raw)</th>
              </tr>
            </thead>
            <tbody>
              {erc20Transfers.map((t, i) => (
                <tr key={i}>
                  <td className={styles.td}><span className={styles.mono} title={t.tokenAddress}>{addr(t.tokenAddress)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.from}>{addr(t.from)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.to}>{addr(t.to)}</span></td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{t.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── ERC-721 Transfers ── */}
      {erc721Transfers.length > 0 && (
        <Section title="■ ERC-721 NFT TRANSFERS" badge={String(erc721Transfers.length)}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>CONTRACT</th>
                <th className={styles.th}>FROM</th>
                <th className={styles.th}>TO</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>TOKEN ID</th>
              </tr>
            </thead>
            <tbody>
              {erc721Transfers.map((t, i) => (
                <tr key={i}>
                  <td className={styles.td}><span className={styles.mono} title={t.tokenAddress}>{addr(t.tokenAddress)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.from}>{addr(t.from)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.to}>{addr(t.to)}</span></td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>#{t.tokenId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── ERC-1155 Transfers ── */}
      {erc1155Transfers.length > 0 && (
        <Section title="■ ERC-1155 TRANSFERS" badge={String(erc1155Transfers.length)}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>CONTRACT</th>
                <th className={styles.th}>FROM</th>
                <th className={styles.th}>TO</th>
                <th className={styles.th}>ID</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {erc1155Transfers.map((t, i) => (
                <tr key={i}>
                  <td className={styles.td}><span className={styles.mono} title={t.tokenAddress}>{addr(t.tokenAddress)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.from}>{addr(t.from)}</span></td>
                  <td className={styles.td}><span className={styles.mono} title={t.to}>{addr(t.to)}</span></td>
                  <td className={styles.td}>{t.isBatch ? '(batch)' : `#${t.id}`}</td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{t.isBatch ? '(batch)' : t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {nativeTransfers.length === 0 && erc20Transfers.length === 0 &&
       erc721Transfers.length === 0 && erc1155Transfers.length === 0 && (
        <div className={styles.emptyHint} style={{ padding: '16px 0' }}>No token or ETH transfers detected in this transaction.</div>
      )}

      {/* ── Call Trace ── */}
      {root && (
        <CallTraceTab
          root={root}
          structLog={structLog}
          allLogs={allLogs}
          addressLabels={addressLabels}
          tokenLabels={tokenLabels}
          tokenAddresses={erc20Transfers.map((transfer) => transfer.tokenAddress)}
          stateDiffs={stateDiffs ?? []}
          chainId={chainId}
          embedded
        />
      )}
    </div>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span>{title}</span>
        {badge && <Badge fontSize={9}>{badge}</Badge>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}
