'use client';

import { useMemo, type CSSProperties } from 'react';
import type { AddressContext, EventEntry, JumpFrame, NonCallEntry, OpcodeEntry, StorageEntry } from './callTraceTypes';
import { getOpcodeStyle } from '@/utils/opcodes';
import styles from '../../explorer.module.scss';
import { MAX_INLINE_EVENT_ARGS, ZERO_WORD } from './callTraceConstants';
import {
  short, shortSlot, argLabel,
  isTruthyHex, decodeEventName,
  opcodeShortLabel,
  decodedArgs, decodedOutputs, nodeContractName, nodeFunctionName, previewArgs, rawJumpParams,
} from './callTraceUtils';

/** Ensure a hex string has the 0x prefix */
function ensureHex(v: string) {
  if (!v) return '0x0';
  return v.startsWith('0x') ? v : `0x${v}`;
}

/** Pad a hex value to full 32-byte (64 hex chars) with 0x prefix */
function padHex(v: string) {
  if (!v || v === '0x' || v === '0x0') return '0x' + '0'.repeat(64);
  const raw = v.startsWith('0x') ? v.slice(2) : v;
  return '0x' + raw.padStart(64, '0');
}

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

export function LeafRow({
  entry,
  contractName: inheritedName,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
  onSelect,
  selected,
}: {
  entry: NonCallEntry;
  contractName?: string;
  connectors: boolean[];
  isLast: boolean;
  onSelect?: (entry: NonCallEntry) => void;
  selected?: boolean;
} & AddressContext) {
  if (entry.kind === 'event') {
    return (
      <EventRow
        entry={entry}
        contractName={inheritedName}
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
        contractName={inheritedName}
        addressLabels={addressLabels}
        tokenLabels={tokenLabels}
        tokenAddresses={tokenAddresses}
        connectors={connectors}
        isLast={isLast}
      />
    );
  }

  return (
    <OpcodeRow
      entry={entry}
      depth={entry.depth}
      connectors={connectors}
      isLast={isLast}
      onSelect={onSelect ? (entry) => onSelect(entry) : undefined}
      selected={selected}
    />
  );
}

// ── Event leaf ────────────────────────────────────────────────

function EventRow({
  entry,
  contractName: inheritedName,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
}: {
  entry: EventEntry;
  contractName?: string;
  connectors: boolean[];
  isLast: boolean;
} & AddressContext) {
  const { depth, opcode, address, topics, gasCost, name, inputs } = entry;
  const oStyle = getOpcodeStyle(opcode);
  const eventName = name || decodeEventName(topics) || (topics[0] ? topics[0].slice(0, 10) : '(anonymous)');
  // Always use the event's own address when available — it comes from the
  // context stack (storageAddress) and is the correct emitting contract.
  const contractName = address
    ? short(address, addressLabels, tokenLabels, tokenAddresses)
    : (inheritedName || '—');
  const rowStyle = { '--trace-depth': depth } as CSSProperties;

  return (
    <div
      className={`${styles.traceListRow} ${styles.traceListRowEvent}`}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>{opcode}</span>
        <span className={styles.gasBadge}>{gasCost.toLocaleString()}</span>
      </div>
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
              : <EventFallbackArgs topics={topics} data={entry.data} />
            })
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Storage leaf ──────────────────────────────────────────────

/** Renders decoded indexed topics + data words when no ABI-decoded inputs are available */
function EventFallbackArgs({ topics, data }: { topics: string[]; data: string }) {
  const parts: { label: string; value: string; full: string }[] = [];

  // Indexed topics (skip topic0 = event signature)
  for (let i = 1; i < topics.length && i <= 3; i++) {
    const raw = topics[i] || '';
    parts.push({ label: `topic${i}`, value: decodeTopicValue(raw), full: raw });
  }

  // Non-indexed data words
  if (data && data !== '0x' && data.length > 2) {
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    const wordCount = Math.floor(hex.length / 64);
    for (let i = 0; i < wordCount && parts.length < MAX_INLINE_EVENT_ARGS; i++) {
      const word = hex.slice(i * 64, (i + 1) * 64);
      parts.push({ label: `data${i}`, value: decodeTopicValue('0x' + word), full: '0x' + word });
    }
  }

  return (
    <>
      {parts.map((p, index) => (
        <span key={`${p.label}-${index}`} title={p.full}>
          {index > 0 && ', '}
          {p.label}={p.value}
        </span>
      ))}
    </>
  );
}

/** Decode a 32-byte topic/data word into a readable value */
function decodeTopicValue(raw: string): string {
  if (!raw || raw === '0x') return '0';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (hex.length !== 64) return raw;
  // All zeros
  if (hex === '0'.repeat(64)) return '0';
  // Bool true
  if (hex === '0'.repeat(63) + '1') return 'true';
  // Try as number
  try {
    const num = BigInt('0x' + hex);
    const str = num.toString();
    if (str.length <= 20) return str;
    // Fits in 20 bytes (address-sized) — show as address
    if (hex.slice(0, 24) === '0'.repeat(24)) {
      return '0x' + hex.slice(24);
    }
    return `0x${hex}`;
  } catch {
    return `0x${hex}`;
  }
}

function StorageRow({
  entry,
  contractName: inheritedName,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  connectors,
  isLast,
}: {
  entry: StorageEntry;
  contractName?: string;
  connectors: boolean[];
  isLast: boolean;
} & AddressContext) {
  const { depth, opcode, address, slot, before, after, gasCost } = entry;
  const oStyle = getOpcodeStyle(opcode);
  // Always use the storage entry's own address — it comes from ctx.storageAddress
  // and correctly reflects the proxy for DELEGATECALL.
  const contractName = address
    ? short(address, addressLabels, tokenLabels, tokenAddresses)
    : (inheritedName || '—');
  const rowStyle = { '--trace-depth': depth } as CSSProperties;

  return (
    <div
      className={`${styles.traceListRow} ${styles.traceListRowStorage}`}
      style={rowStyle}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>{opcode}</span>
        <span className={styles.gasBadge}>{gasCost.toLocaleString()}</span>
      </div>
      <div className={styles.traceListDesc}>
        <DepthGuides connectors={connectors} isLast={isLast} />
        <div className={styles.traceCallBody}>
          <span className={styles.traceName}>{contractName}</span>
          <span className={styles.traceInlineArgs}>
            [{ensureHex(slot)}{opcode === 'SSTORE'
              ? <> = {padHex(before)} <span className={styles.traceArrow}>→</span> {padHex(after)}</>
              : <> = {ensureHex(after)}</>
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
  onSelect,
  selected,
}: {
  entry: OpcodeEntry;
  depth: number;
  connectors: boolean[];
  isLast: boolean;
  onSelect?: (entry: OpcodeEntry) => void;
  selected?: boolean;
}) {
  const {
    op, gasCost, error, jumpCondition,
    file, line, jumpTargetFile, jumpTargetLine,
    jumpTargetFunction, jumpTargetFunctionParams,
    jumpStack, jumpResolvedParams,
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
    const raw = rawJumpParams(op, jumpStack, jumpTargetFunctionParams?.length);
    return raw.length > 0 ? { params: raw } : null;
  }, [op, jumpStack, jumpTargetFunctionParams]);

  return (
    <div
      className={[
        styles.traceListRow,
        styles.traceListRowOpcode,
        selected ? styles.traceListRowSelected : '',
      ].filter(Boolean).join(' ')}
      style={rowStyle}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(entry) : undefined}
      onKeyDown={onSelect
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(entry);
            }
          }
        : undefined}
    >      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          {op}
        </span>
        <span className={styles.gasBadge}>{gasCost > 0 ? gasCost.toLocaleString() : '—'}</span>
      </div>
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
                {name}={(jumpResolvedParams?.[i]) ?? stackContext?.params[i] ?? '?'}
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
  entry,
  gasUsed,
  totalGas,
  isOpen,
  connectors,
  isLast,
  hasChildren,
  reverted: revertedProp,
  onToggle,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  onHover,
  onLeave,
}: {
  node: import('@/types/explorer').TraceNode;
  entry: import('./callTraceTypes').CallEntry;
  gasUsed: number;
  totalGas: number;
  isOpen: boolean;
  connectors: boolean[];
  isLast: boolean;
  hasChildren: boolean;
  reverted?: boolean;
  onToggle: () => void;
  onHover?: (id: string) => void;
  onLeave?: () => void;
} & AddressContext) {
  const reverted = revertedProp ?? !!node.error;
  const opcode = node.type;
  const oStyle = getOpcodeStyle(opcode);
  const valueLabel = node.value && node.value !== '0x0' ? node.value : '';
  const fnName = nodeFunctionName(node);

  // Use visibleFrom/visibleTo from the context stack (spec: Tenderly rendering).
  // For child CALL inside DELEGATECALL, visibleFrom = logic (not proxy).
  const senderName = entry.visibleFrom
    ? short(entry.visibleFrom, addressLabels, tokenLabels, tokenAddresses)
    : short(node.from, addressLabels, tokenLabels, tokenAddresses);
  const receiverName = entry.visibleTo
    ? short(entry.visibleTo, addressLabels, tokenLabels, tokenAddresses)
    : nodeContractName(node, addressLabels, tokenLabels, tokenAddresses);
  const args = decodedArgs(node);
  const outputs = decodedOutputs(node);
  const returnVal = !reverted && node.output && node.output !== '0x' ? node.output : '';
  const selectorLikeName = !!fnName && /^0x[a-fA-F0-9]{8}$/.test(fnName);
  const isLikelyInternalFn = !!fnName && fnName.startsWith('_');
  const rawInput = node.input ?? '0x';
  const rawArgs = rawInput.length > 10
    ? `0x${rawInput.startsWith('0x') ? rawInput.slice(10) : rawInput.slice(8)}`
    : '0x';
  const rowStyle = { '--trace-depth': connectors.length } as CSSProperties;

  return (
    <div
      className={[
        styles.traceListRow,
        styles.traceListRowCall,
        reverted ? styles.traceListRowError : '',
      ].filter(Boolean).join(' ')}
      style={rowStyle}
      onMouseEnter={() => onHover?.(node.id)}
      onMouseLeave={() => onLeave?.()}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          {opcodeShortLabel(opcode)}
        </span>
        <span className={styles.gasBadge}>
          {gasUsed > 0 ? gasUsed.toLocaleString() : '—'}
        </span>
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
          <span className={styles.traceName}>[{senderName} =&gt; {receiverName}]</span>
          <span className={styles.traceDot}>::</span>
          <span className={styles.traceFnName}>{fnName || '()'}</span>
          <span className={styles.traceInlineArgs}>
            ({(isLikelyInternalFn || selectorLikeName)
              ? rawArgs
              : args.length > 0
              ? args.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {a.name || `arg${i}`}={a.value}
                </span>
              ))
              : ''
            })
          </span>
          {valueLabel && <span className={styles.traceVal}> [{valueLabel}]</span>}
          {returnVal && (
            <>
              <span className={styles.traceReturnArrow}>{' => '}</span>
              <span className={styles.traceReturnValue}>
                ({outputs.length > 0
                  ? (isLikelyInternalFn
                    ? returnVal
                    : outputs.map((o, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {o.name || `output${i}`}={o.value}
                    </span>
                    ))
                  )
                  : returnVal
                })
              </span>
            </>
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
  parentContractName,
  onHover,
  onLeave,
}: {
  frame: JumpFrame;
  totalGas: number;
  isOpen: boolean;
  connectors: boolean[];
  isLast: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  parentContractName?: string;
  onHover?: (id: string) => void;
  onLeave?: () => void;
} & AddressContext) {
  const { entry, gasUsed, address } = frame;
  const oStyle = getOpcodeStyle('JUMP');
  const contractName = parentContractName
    || frame.contractName
    || (address ? short(address, addressLabels, tokenLabels, tokenAddresses) : '—');
  const fnName = entry.jumpTargetFunction || entry.jumpTargetLabel || '';

  const resolvedContext = (() => {
    const raw = rawJumpParams(entry.op, entry.jumpStack, entry.jumpTargetFunctionParams?.length);
    return raw.length > 0 ? { params: raw } : null;
  })();
  const hasResolvedParams = !!(entry.jumpResolvedParams?.length || resolvedContext);

  const rowStyle = { '--trace-depth': connectors.length } as CSSProperties;

  return (
    <div
      className={[
        styles.traceListRow,
        styles.traceListRowCall,
        styles.traceListRowJump,
      ].filter(Boolean).join(' ')}
      style={rowStyle}
      onMouseEnter={() => onHover?.(frame.id)}
      onMouseLeave={() => onLeave?.()}
    >
      <div className={styles.traceListOp}>
        <span className={styles.opcBadge} style={{ background: oStyle.bg, color: oStyle.color }}>
          JUMP
        </span>
        <span className={styles.gasBadge}>
          {gasUsed > 0 ? gasUsed.toLocaleString() : '—'}
        </span>
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
            ({entry.jumpTargetFunctionParams && hasResolvedParams
              ? entry.jumpTargetFunctionParams.map((name, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {name}={(entry.jumpResolvedParams?.[i]) ?? resolvedContext?.params[i] ?? '?'}
                </span>
              ))
              : ''
            })
          </span>
          {frame.returnStack && frame.returnStack.length > 1 && entry.jumpTargetFunctionReturnsValue && (
            <>
              <span className={styles.traceReturnArrow}>{' => '}</span>
              <span className={styles.traceReturnValue}>
                ({frame.returnStack.slice(1, 2).map(v =>
                  v === ZERO_WORD || v === '0x0' || !v ? '0' : (v.startsWith('0x') ? v : `0x${v}`)
                ).join(', ')})
              </span>
            </>
          )}
          {entry.jumpTargetFile && entry.jumpTargetLine && (
            <span className={styles.traceNameMuted}> · {entry.jumpTargetFile}:{entry.jumpTargetLine}</span>
          )}
        </div>
      </div>
    </div>
  );
}
