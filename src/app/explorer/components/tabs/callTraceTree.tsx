'use client';

import type { AddressContext, TraceItem } from './callTraceTypes';
import { FrameRow, JumpFrameRow, LeafRow } from './callTraceRows';

interface TraceTreeProps extends AddressContext {
  items: TraceItem[];
  totalGas: number;
  openCalls: Record<string, boolean>;
  onToggle: (id: string) => void;
  connectors?: boolean[];
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

          return (
            <div key={node.id}>
              <FrameRow
                node={node}
                gasUsed={gasUsed}
                totalGas={totalGas}
                isOpen={isOpen}
                connectors={connectors}
                isLast={isLast}
                hasChildren={hasChildren}
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
                />
              )}
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
                />
              )}
            </div>
          );
        }

        return (
          <LeafRow
            key={item.id}
            entry={item.entry}
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
