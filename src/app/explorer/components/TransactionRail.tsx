'use client';

import type { ReactNode } from 'react';
import { Badge, CopyButton, Label } from '@/components/ui';
import type { DecodedCalldata, TraceResult, TxOverview } from '@/types/explorer';
import styles from '../explorer.module.scss';
import {
  CHAIN_NAMES,
  formatEth,
  formatGwei,
  formatTimestamp,
  formatTxType,
  quantity,
  shortHex,
} from '../utils';

interface Props {
  result?: TraceResult;
  txOverview?: TxOverview;
  chainId?: number;
  decodedCalldata?: DecodedCalldata;
  loadingTrace?: boolean;
}

export default function TransactionRail({
  result,
  txOverview: txOverviewProp,
  chainId,
  decodedCalldata,
  loadingTrace = false,
}: Props) {
  const txOverview = txOverviewProp ?? result?.txOverview;
  if (!txOverview) return null;

  const resolvedChainId = chainId ?? result?.chainId ?? 1;
  const resolvedCalldata = decodedCalldata ?? result?.decodedCalldata;
  const functionLabel = resolvedCalldata?.functionName
    ?? (loadingTrace ? 'Decoding…' : txOverview.input === '0x' ? '0x' : 'Unknown');

  return (
    <aside className={styles.txHeader}>
      <div className={styles.txHeaderTitle}>
        <Badge fontSize={10}>■ TRANSACTION</Badge>
      </div>

      <RailItem label="HASH" valueClassName={styles.mono} title={txOverview.hash} value={shortHex(txOverview.hash)}>
        <CopyButton text={txOverview.hash} />
      </RailItem>

      <RailItem label="NETWORK" value={CHAIN_NAMES[resolvedChainId] ?? `Chain ${resolvedChainId}`} />

      <RailItem
        label="STATUS"
        value={txOverview.status === 'success' ? 'Success' : 'Failed'}
        valueClassName={txOverview.status === 'success' ? styles.statusSuccess : styles.statusFailed}
      />

      <RailItem label="BLOCK" value={txOverview.blockNumber.toLocaleString()}>
        <CopyButton text={txOverview.blockNumber.toLocaleString()} />
      </RailItem>

      <RailItem label="TIMESTAMP" value={formatTimestamp(txOverview.timestamp)} />

      <RailItem label="FROM" value={shortHex(txOverview.from)} title={txOverview.from} valueClassName={styles.mono}>
        <CopyButton text={txOverview.from} />
      </RailItem>

      <RailItem label="TO" value={txOverview.to ? shortHex(txOverview.to) : 'Contract Create'} title={txOverview.to ?? ''} valueClassName={styles.mono}>
        {txOverview.to && <CopyButton text={txOverview.to} />}
      </RailItem>

      <RailItem label="FUNCTION" value={functionLabel} />
      <RailItem label="VALUE" value={formatEth(txOverview.value)} />
      <RailItem label="TX FEE" value={formatEth(quantity(txOverview.gasUsed) * quantity(txOverview.gasPrice))} />
      <RailItem label="TX TYPE" value={formatTxType(txOverview.txType)} />
      <RailItem label="GAS PRICE" value={formatGwei(txOverview.gasPrice)} />
      <RailItem label="GAS USED" value={formatGasUsed(txOverview.gasUsed, txOverview.gasLimit)} />
      <RailItem label="INDEX" value={txOverview.txIndex.toLocaleString()} />
      <RailItem label="NONCE" value={txOverview.nonce.toLocaleString()} />
    </aside>
  );
}

function formatGasUsed(gasUsed: string, gasLimit: string): string {
  const used = quantity(gasUsed);
  const limit = quantity(gasLimit);
  const percentage = limit === 0n ? '0' : Number((used * 100n) / limit).toString();
  return `${used.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)`;
}

function RailItem({
  children,
  label,
  title,
  value,
  valueClassName,
}: {
  children?: ReactNode;
  label: string;
  title?: string;
  value: string;
  valueClassName?: string;
}) {
  const valueNode = (
    <span className={`${styles.txHeaderVal} ${valueClassName ?? ''}`} title={title}>
      {value}
    </span>
  );

  return (
    <div className={styles.txHeaderItem}>
      <Label className={styles.txHeaderKey} fontSize={9}>{label}</Label>
      {children ? (
        <div className={styles.txHeaderValRow}>
          {valueNode}
          {children}
        </div>
      ) : valueNode}
    </div>
  );
}
