'use client';

import { useMemo, type CSSProperties } from 'react';
import type { AddressContext, EventEntry, JumpFrame, NonCallEntry, OpcodeEntry, StorageEntry } from './callTraceTypes';
import { getOpcodeStyle } from '@/utils/opcodes';
import styles from '../../explorer.module.scss';
import { MAX_INLINE_EVENT_ARGS } from './callTraceConstants';
import {
  short, shortSlot, shortVal, argLabel,
  isTruthyHex, decodeEventName, deriveJumpContext,
  opcodeShortLabel, compactValue,
  decodedArgs, decodedOutputs, nodeContractName, nodeFunctionName, previewArgs,
} from './callTraceUtils';

// ── Depth guide lines (CSS-drawn tree connectors) ─────────────

function DepthGuides({ connectors, isLast }: { connectors: boolean[]; isLast: boolean }) {
  if (connectors.length === 0) return null;
  return (
    <span className={styles.depthGuides} aria-hidden="true">
      {connectors.map((active, i) => (
        <span key={i} className={active ? styles.guideLineActive : styles.guideLine} />
      ))}
      <span className={isLast ? styles.guideTurn : styles.guideFork} />
    </span>
  );
}

// ── Return row ────────────────────────────────────────────────

export function ReturnRow({
  depth,
  value,
  reverted,
  connectors,
}: {
  depth: number;
  value: string;
  reverted: boolean;
  connectors: boolean[];
}) {
  const rowStyle = { '--trace-depth': depth } as CSSProperties;
  return (
    <div className={`${styles.traceListRow} ${styles.traceListRowReturn}`} style={rowStyle}>
      <div className={styles.traceListOp}></div>
      <div className={styles.traceListGas} />
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={true} />
        <span className={reverted ? styles.traceRevTag : styles.traceReturn}>{value}</span>
      </div>
    </div>
  );
}

// ── Leaf row (event / storage / opcode) ───────────────────────

export function LeafRow({
  entry,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
}: {
  entry: NonCallEntry;
  connectors: boolean[];
  isLast: boolean;
} & AddressContext) {
  if (entry.kind === 'event') {
    return (
      <EventRow
        entry={entry}
        addressLabels={addressLabels}
        tokenLabels={tokenLabels}
        tokenAddresses={tokenAddresses}
        connectors={connectors}
        isLast={isLast}
      />
    );
  }

  if (entry.kind === 'storage') {
    return (
      <StorageRow
        entry={entry}
        addressLabels={addressLabels}
        tokenLabels={tokenLabels}
        tokenAddresses={tokenAddresses}
        connectors={connectors}
        isLast={isLast}
      />
    );
  }

  return <OpcodeRow entry={entry} depth={entry.depth} connectors={connectors} isLast={isLast} />;
}

// ── Event leaf ────────────────────────────────────────────────

function EventRow({
  entry,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
}: {
  entry: EventEntry;
  connectors: boolean[];
  isLast: boolean;
} & AddressContext) {
  const { depth, opcode, address, topics, gasCost, name, inputs } = entry;
  const oStyle = getOpcodeStyle(opcode);
  const eventName = name || decodeEventName(topics);
  const contractName = address ? short(address, addressLabels, tokenLabels, tokenAddresses) : '—';
  const rowStyle = { '--trace-depth': depth } as CSSProperties;

  return (
    <div
      className={`${styles.traceListRow} ${styles.traceListRowEvent}`}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>{opcode}</span>
      </div>
      <div className={styles.traceListGas}>{gasCost.toLocaleString()}</div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        <div className={styles.traceCallBody}>
          <span className={styles.traceEventDot}>● emit</span>
          <span className={styles.traceName}>{contractName}</span>
          <span className={styles.traceDot}>::</span>
          <span className={styles.traceFnName}>{eventName}</span>
          <span className={styles.traceInlineArgs}>
            ({inputs?.length
              ? inputs.slice(0, MAX_INLINE_EVENT_ARGS).map((input, index) => (
                <span key={`${argLabel(input, index)}-${index}`} title={input.value}>
                  {index > 0 && ', '}
                  {argLabel(input, index)}={input.value}
                </span>
              ))
              : topics.slice(1, 4).map((topic, index) => (
                <span key={`${topic}-${index}`} title={topic}>
                  {index > 0 && ', '}
                  topic{index + 1}={topic}
                </span>
              ))
            })
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Storage leaf ──────────────────────────────────────────────

function StorageRow({
  entry,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
}: {
  entry: StorageEntry;
  connectors: boolean[];
  isLast: boolean;
} & AddressContext) {
  const { depth, opcode, address, slot, before, after, gasCost } = entry;
  const oStyle = getOpcodeStyle(opcode);
  const contractName = address ? short(address, addressLabels, tokenLabels, tokenAddresses) : '—';
  const rowStyle = { '--trace-depth': depth } as CSSProperties;

  return (
    <div
      className={`${styles.traceListRow} ${styles.traceListRowStorage}`}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>{opcode}</span>
      </div>
      <div className={styles.traceListGas}>{gasCost.toLocaleString()}</div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        <div className={styles.traceCallBody}>
          <span className={styles.traceName}>{contractName}</span>
          <span className={styles.traceInlineArgs}>
            [{slot}{opcode === 'SSTORE'
              ? <> = {before} <span className={styles.traceArrow}>→</span> {after}</>
              : <> = {after}</>
            }]
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Opcode leaf ───────────────────────────────────────────────

function OpcodeRow({
  entry,
  depth,
  connectors,
  isLast,
}: {
  entry: OpcodeEntry;
  depth: number;
  connectors: boolean[];
  isLast: boolean;
}) {
  const {
    op, gasCost, error, jumpCondition,
    file, line, jumpTargetFile, jumpTargetLine,
    jumpTargetFunction, jumpTargetFunctionParams,
    jumpStack,
  } = entry;
  const oStyle = getOpcodeStyle(op);
  const rowStyle = { '--trace-depth': depth } as CSSProperties;

  const jumpState = op === 'JUMPI' && jumpCondition
    ? (isTruthyHex(jumpCondition) ? 'taken' : 'skipped')
    : undefined;

  const sourceDesc = entry.jumpTargetLabel
    ? entry.jumpTargetLabel
    : entry.sourceLabel
      ? entry.sourceLabel
      : file && line
        ? `${file}:${line}`
        : undefined;

  const sourceMeta = op === 'JUMP'
    ? jumpTargetFile && jumpTargetLine
      ? `${jumpTargetFile}:${jumpTargetLine}`
      : undefined
    : entry.jumpTargetLabel && jumpTargetFile && jumpTargetLine
      ? `${jumpTargetFile}:${jumpTargetLine}`
      : entry.sourceLabel && file && line
        ? `${file}:${line}`
        : undefined;

  const stackContext = useMemo(() => {
    if (op !== 'JUMP' && op !== 'JUMPI') return null;
    return deriveJumpContext(op, jumpStack, jumpTargetFunctionParams?.length);
  }, [op, jumpStack, jumpTargetFunctionParams]);

  return (
    <div
      className={`${styles.traceListRow} ${styles.traceListRowOpcode}`}
      style={rowStyle}
    >      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          {op}
        </span>
      </div>
      <div className={styles.traceListGas}>{gasCost > 0 ? gasCost.toLocaleString() : '—'}</div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        {sourceDesc && <span className={styles.traceFnName}>{sourceDesc}</span>}
        {jumpState && <span className={styles.traceNameMuted}> ({jumpState})</span>}
        {jumpTargetFunction && (
          <span className={styles.muted}>
            ::{jumpTargetFunction}(
            {jumpTargetFunctionParams?.map((name, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {name}={stackContext?.params[i] || '?'}
              </span>
            ))}
            )
          </span>
        )}
        {sourceMeta && !sourceDesc && <span className={styles.muted}>· {sourceMeta}</span>}
        {error && <span className={styles.traceRevTag}> ✖ {error}</span>}
      </div>
    </div>
  );
}

// ── Call frame row ────────────────────────────────────────────

export function FrameRow({
  node,
  gasUsed,
  totalGas,
  isOpen,
  connectors,
  isLast,
  hasChildren,
  onToggle,
  addressLabels,
  tokenLabels,
  tokenAddresses,
}: {
  node: import('@/types/explorer').TraceNode;
  gasUsed: number;
  totalGas: number;
  isOpen: boolean;
  connectors: boolean[];
  isLast: boolean;
  hasChildren: boolean;
  onToggle: () => void;
} & AddressContext) {
  const reverted = !!node.error;
  const opcode = reverted ? 'REVERT' : node.type;
  const oStyle = getOpcodeStyle(opcode);
  const gasPct = totalGas > 0 ? ((gasUsed / totalGas) * 100).toFixed(1) : '0';
  const valueLabel = compactValue(node.value);
  const fnName = nodeFunctionName(node);
  const isDelegateCall = node.type === 'DELEGATECALL' || node.type === 'CALLCODE';
  const senderName = short(node.from, addressLabels, tokenLabels, tokenAddresses);
  const receiverName = node.contract_name || (node.to ? short(node.to, addressLabels, tokenLabels, tokenAddresses) : 'NEW CONTRACT');
  const args = decodedArgs(node);
  const outputs = decodedOutputs(node);
  const returnVal = node.output && node.output !== '0x' ? node.output : '';
  const rowStyle = { '--trace-depth': connectors.length } as CSSProperties;

  return (
    <div
      className={[
        styles.traceListRow,
        styles.traceListRowCall,
        reverted ? styles.traceListRowError : '',
      ].filter(Boolean).join(' ')}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          {opcodeShortLabel(opcode)}
        </span>
      </div>
      <div className={styles.traceListGas}>
        <span>{gasUsed > 0 ? gasUsed.toLocaleString() : '—'}</span>
        {gasUsed > 0 && <span className={styles.traceGasPct}>{gasPct}%</span>}
        {gasUsed > 0 && (
          <div className={styles.gasBarMini}>
            <div
              className={styles.gasBarMiniFill}
              style={{ width: `${Math.min(parseFloat(gasPct), 100)}%`, background: oStyle.color + '88' }}
            />
          </div>
        )}
      </div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        {hasChildren && (
          <span
            className={`${styles.traceToggleIcon} ${isOpen ? styles.traceToggleOpen : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            role="button"
            tabIndex={0}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
        )}
        <div className={styles.traceCallBody}>
          {isDelegateCall && (
            <span className={styles.traceNameMuted}>({senderName} =&gt; {receiverName})</span>
          )}
          {!isDelegateCall && <span className={styles.traceName}>{receiverName}</span>}
          <span className={styles.traceDot}>.</span>
          <span className={styles.traceFnName}>{fnName || '()'}</span>
          <span className={styles.traceInlineArgs}>
            ({args.map((a, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {a.name || `arg${i}`}={a.value}
              </span>
            ))})
          </span>
          {valueLabel && <span className={styles.traceVal}> [{valueLabel}]</span>}
          {returnVal && (
            <>
              <span className={styles.traceReturnArrow}>{' => '}</span>
              <span className={styles.traceReturnValue}>
                ({outputs.length > 0
                  ? outputs.map((o, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {o.name || `output${i}`}={o.value}
                    </span>
                  ))
                  : returnVal
                })
              </span>
            </>
          )}
          {reverted && node.revertReason && (
            <span className={styles.traceRevTag}> ✖ {node.revertReason}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Jump frame row (internal function call) ───────────────────

export function JumpFrameRow({
  frame,
  totalGas,
  isOpen,
  connectors,
  isLast,
  hasChildren,
  onToggle,
  addressLabels,
  tokenLabels,
  tokenAddresses,
}: {
  frame: JumpFrame;
  totalGas: number;
  isOpen: boolean;
  connectors: boolean[];
  isLast: boolean;
  hasChildren: boolean;
  onToggle: () => void;
} & AddressContext) {
  const { entry, gasUsed, address, contractName: inheritedName } = frame;
  const oStyle = getOpcodeStyle('JUMP');
  const gasPct = totalGas > 0 ? ((gasUsed / totalGas) * 100).toFixed(1) : '0';
  const contractName = inheritedName
    || (address ? short(address, addressLabels, tokenLabels, tokenAddresses) : '—');
  const fnName = entry.jumpTargetFunction || entry.jumpTargetLabel || '';

  const stackContext = deriveJumpContext(
    entry.op,
    entry.jumpStack,
    entry.jumpTargetFunctionParams?.length,
  );

  const rowStyle = { '--trace-depth': connectors.length } as CSSProperties;

  return (
    <div
      className={[
        styles.traceListRow,
        styles.traceListRowCall,
        styles.traceListRowJump,
      ].filter(Boolean).join(' ')}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          JUMP
        </span>
      </div>
      <div className={styles.traceListGas}>
        <span>{gasUsed > 0 ? gasUsed.toLocaleString() : '—'}</span>
        {gasUsed > 0 && <span className={styles.traceGasPct}>{gasPct}%</span>}
        {gasUsed > 0 && (
          <div className={styles.gasBarMini}>
            <div
              className={styles.gasBarMiniFill}
              style={{ width: `${Math.min(parseFloat(gasPct), 100)}%`, background: oStyle.color + '88' }}
            />
          </div>
        )}
      </div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        {hasChildren && (
          <span
            className={`${styles.traceToggleIcon} ${isOpen ? styles.traceToggleOpen : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            role="button"
            tabIndex={0}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
        )}
        <div className={styles.traceCallBody}>
          <span className={styles.traceName}>{contractName}</span>
          <span className={styles.traceDot}>::</span>
          <span className={styles.traceFnName}>{fnName || '()'}</span>
          <span className={styles.traceInlineArgs}>
            ({entry.jumpTargetFunctionParams && stackContext
              ? entry.jumpTargetFunctionParams.map((name, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {name}={stackContext.params[i] || '?'}
                </span>
              ))
              : ''
            })
          </span>
          {entry.jumpTargetFile && entry.jumpTargetLine && (
            <span className={styles.traceNameMuted}> · {entry.jumpTargetFile}:{entry.jumpTargetLine}</span>
          )}
        </div>
      </div>
    </div>
  );
}
