'use client';

import React from 'react';
import type { AddressContext, TraceItem } from './callTraceTypes';
import { FrameRow, JumpFrameRow, LeafRow } from './callTraceRows';
import { nodeContractName, short } from './callTraceUtils';
import { getOpcodeStyle } from '@/utils/opcodes';
import styles from '../../explorer.module.scss';

/** Check if any descendant frame has an error (for propagating reverted status up). */
function hasDescendantError(items: TraceItem[]): boolean {
  for (const item of items) {
    if (item.kind === 'frame' && item.entry.node.error) return true;
    if ((item.kind === 'frame' || item.kind === 'jump-frame') && hasDescendantError(item.items)) return true;
  }
  return false;
}

interface TraceTreeProps extends AddressContext {
  items: TraceItem[];
  totalGas: number;
  openCalls: Record<string, boolean>;
  onToggle: (id: string) => void;
  connectors?: boolean[];
  /** Inherited contract name from a parent DELEGATECALL frame */
  parentContractName?: string;
}

export function TraceTree({
  items,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  totalGas,
  openCalls,
  onToggle,
  connectors = [],
  parentContractName,
}: TraceTreeProps) {
  return (
    <>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (item.kind === 'frame') {
          const { entry } = item;
          const { node, gasUsed } = entry;
          const isOpen = !!openCalls[node.id];
          const hasChildren = item.items.length > 0;
          const childConnectors = [...connectors, !isLast];

          // For DELEGATECALL/CALLCODE, pass the proxy/storage contract name
          // to children — matches Tenderly's convention of showing the execution
          // context (proxy) for internal functions, not the implementation.
          const isDelegateCall = node.type === 'DELEGATECALL' || node.type === 'CALLCODE';
          const childContractName = isDelegateCall
            ? (entry.storageAddress
                ? short(entry.storageAddress, addressLabels, tokenLabels, tokenAddresses)
                : nodeContractName(node, addressLabels, tokenLabels, tokenAddresses))
            : undefined;

          // A frame is reverted if it has an error directly OR any descendant reverted
          const reverted = !!node.error || hasDescendantError(item.items);

          return (
            <div key={node.id}>
              <FrameRow
                node={node}
                entry={entry}
                gasUsed={gasUsed}
                totalGas={totalGas}
                isOpen={isOpen}
                connectors={connectors}
                isLast={isLast}
                hasChildren={hasChildren}
                reverted={reverted}
                onToggle={() => onToggle(node.id)}
                addressLabels={addressLabels}
                tokenLabels={tokenLabels}
                tokenAddresses={tokenAddresses}
              />

              {isOpen && hasChildren && (
                <TraceTree
                  items={item.items}
                  addressLabels={addressLabels}
                  tokenLabels={tokenLabels}
                  tokenAddresses={tokenAddresses}
                  totalGas={totalGas}
                  openCalls={openCalls}
                  onToggle={onToggle}
                  connectors={childConnectors}
                  parentContractName={childContractName}
                />
              )}
              {isOpen && !!node.error && (() => {
                const revertStyle = getOpcodeStyle('REVERT');
                return (
                <div
                  className={`${styles.traceListRow} ${styles.traceListRowError}`}
                  style={{ '--trace-depth': childConnectors.length } as React.CSSProperties}
                >
                  <div className={styles.traceListOp}>
                    <span className={styles.opcBadge} style={{ background: revertStyle.bg, color: revertStyle.color }}>
                      REVERT
                    </span>
                    <span className={styles.gasBadge}>0</span>
                  </div>
                  <div className={styles.traceListDesc}>
                    <span className={styles.depthGuides} aria-hidden="true">
                      {childConnectors.map((active, i) => (
                        <span key={i} className={active ? styles.guideLineActive : styles.guideLine} />
                      ))}
                      <span className={styles.guideTurn} />
                    </span>
                    <span className={styles.traceRevTag}>✖ {node.revertReason || node.error}</span>
                  </div>
                </div>
                );
              })()}
          </div>
        );
        }

        if (item.kind === 'jump-frame') {
          const isOpen = !!openCalls[item.id];
          const hasChildren = item.items.length > 0;
          const childConnectors = [...connectors, !isLast];

          return (
            <div key={item.id}>
              <JumpFrameRow
                frame={item}
                totalGas={totalGas}
                isOpen={isOpen}
                connectors={connectors}
                isLast={isLast}
                hasChildren={hasChildren}
                onToggle={() => onToggle(item.id)}
                addressLabels={addressLabels}
                tokenLabels={tokenLabels}
                tokenAddresses={tokenAddresses}
                parentContractName={parentContractName}
              />

              {isOpen && hasChildren && (
                <TraceTree
                  items={item.items}
                  addressLabels={addressLabels}
                  tokenLabels={tokenLabels}
                  tokenAddresses={tokenAddresses}
                  totalGas={totalGas}
                  openCalls={openCalls}
                  onToggle={onToggle}
                  connectors={childConnectors}
                  parentContractName={parentContractName}
                />
              )}
            </div>
          );
        }

        return (
          <LeafRow
            key={item.id}
            entry={item.entry}
            contractName={parentContractName}
            addressLabels={addressLabels}
            tokenLabels={tokenLabels}
            tokenAddresses={tokenAddresses}
            connectors={connectors}
            isLast={isLast}
          />
        );
      })}
    </>
  );
}
