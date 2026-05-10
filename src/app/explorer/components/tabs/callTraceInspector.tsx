'use client';

import type { AddressContext, JumpFrame, TraceFrame, TraceStep } from './callTraceTypes';
import styles from '../../explorer.module.scss';
import {
  short, shortVal, decodedArgs, decodedOutputs,
  nodeContractName, nodeFunctionName, argLabel, compactValue,
  decodeEventName, shortSlot, deriveJumpContext,
} from './callTraceUtils';

export function TraceInspector({
  frame,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  totalGas,
}: {
  frame: TraceFrame;
  totalGas: number;
} & AddressContext) {
  const { node, gasUsed } = frame.entry;
  const args = decodedArgs(node);
  const outputs = decodedOutputs(node);
  const contractName = nodeContractName(node, addressLabels, tokenLabels, tokenAddresses);
  const fnName = nodeFunctionName(node) || '(fallback)';
  const gasPct = totalGas > 0 ? ((gasUsed / totalGas) * 100).toFixed(1) : '0';
  const valueLabel = compactValue(node.value);

  return (
    <aside className={styles.traceInspector}>
      <div className={styles.traceInspectorHeader}>
        <span className={styles.traceInspectorKind}>{node.error ? 'REVERTED CALL' : node.type}</span>
        <span className={styles.traceInspectorTitle}>{contractName}.{fnName}</span>
      </div>

      <div className={styles.traceInspectorStats}>
        <div>
          <span>Gas</span>
          <strong>{gasUsed > 0 ? gasUsed.toLocaleString() : '—'}</strong>
          <small>{gasPct}% total</small>
        </div>
        <div>
          <span>Value</span>
          <strong>{valueLabel || '0 ETH'}</strong>
          <small>{node.call_type ?? node.type}</small>
        </div>
      </div>

      <InspectorKV
        label="From"
        value={node.from}
        display={short(node.from, addressLabels, tokenLabels, tokenAddresses)}
      />
      <InspectorKV
        label="To"
        value={node.to ?? ''}
        display={short(node.to, addressLabels, tokenLabels, tokenAddresses)}
      />
      {node.function_line_number && (
        <InspectorKV label="Source" value={`line ${node.function_line_number}`} />
      )}
      {node.caller_op && <InspectorKV label="Caller op" value={node.caller_op} />}
      {node.error && (
        <InspectorKV label="Error" value={node.revertReason ?? node.error} danger />
      )}

      <InspectorArgs
        title="Decoded input"
        values={args.map((arg, index) => ({ name: argLabel(arg, index), value: arg.value }))}
        empty="No decoded input."
      />
      <InspectorArgs
        title="Decoded output"
        values={outputs.map((output, index) => ({ name: output.name || `out${index}`, value: output.value }))}
        empty={frame.returnValue?.value || 'No decoded output.'}
      />

      <InspectorKV label="Raw input" value={node.input || '0x'} />
      <InspectorKV label="Raw output" value={node.output || '0x'} />
    </aside>
  );
}

function InspectorKV({
  label,
  value,
  display,
  danger = false,
}: {
  label: string;
  value: string;
  display?: string;
  danger?: boolean;
}) {
  return (
    <div className={styles.traceInspectorKV}>
      <span>{label}</span>
      <strong className={danger ? styles.detailError : undefined} title={value}>
        {display ?? shortVal(value)}
      </strong>
    </div>
  );
}

function InspectorArgs({
  title,
  values,
  empty,
}: {
  title: string;
  values: Array<{ name: string; value: string }>;
  empty: string;
}) {
  return (
    <div className={styles.traceInspectorBlock}>
      <div className={styles.traceInspectorBlockTitle}>{title}</div>
      {values.length > 0 ? (
        values.map((item, index) => (
          <div key={`${item.name}-${index}`} className={styles.traceInspectorArg}>
            <span>{item.name}</span>
            <strong title={item.value}>{shortVal(item.value)}</strong>
          </div>
        ))
      ) : (
        <div className={styles.traceInspectorEmpty}>{empty}</div>
      )}
    </div>
  );
}

// ── Step Inspector (events / storage / opcodes) ───────────────

export function StepInspector({
  step,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  totalGas,
}: {
  step: TraceStep;
  totalGas: number;
} & AddressContext) {
  const { entry } = step;

  if (entry.kind === 'event') {
    const eventName = entry.name || decodeEventName(entry.topics);
    const contractName = entry.address
      ? short(entry.address, addressLabels, tokenLabels, tokenAddresses)
      : '—';
    return (
      <aside className={styles.traceInspector}>
        <div className={styles.traceInspectorHeader}>
          <span className={styles.traceInspectorKind}>{entry.opcode}</span>
          <span className={styles.traceInspectorTitle}>{eventName}</span>
        </div>
        <InspectorKV label="Contract" value={entry.address} display={contractName} />
        <InspectorKV label="Gas cost" value={entry.gasCost.toLocaleString()} />
        <InspectorArgs
          title="Topics"
          values={entry.topics.map((t, i) => ({ name: i === 0 ? 'signature' : `topic${i}`, value: t }))}
          empty="No topics."
        />
        {entry.inputs && entry.inputs.length > 0 && (
          <InspectorArgs
            title="Decoded args"
            values={entry.inputs.map((input, i) => ({ name: argLabel(input, i), value: input.value }))}
            empty="No decoded args."
          />
        )}
        <InspectorKV label="Data" value={entry.data || '0x'} />
      </aside>
    );
  }

  if (entry.kind === 'storage') {
    const contractName = entry.address
      ? short(entry.address, addressLabels, tokenLabels, tokenAddresses)
      : '—';
    return (
      <aside className={styles.traceInspector}>
        <div className={styles.traceInspectorHeader}>
          <span className={styles.traceInspectorKind}>{entry.opcode}</span>
          <span className={styles.traceInspectorTitle}>{contractName}</span>
        </div>
        <InspectorKV label="Gas cost" value={entry.gasCost.toLocaleString()} />
        <InspectorKV label="Slot" value={entry.slot} />
        {entry.opcode === 'SSTORE' && (
          <>
            <InspectorKV label="Before" value={entry.before} />
            <InspectorKV label="After" value={entry.after} />
          </>
        )}
        {entry.opcode === 'SLOAD' && (
          <InspectorKV label="Value" value={entry.after} />
        )}
      </aside>
    );
  }

  // Opcode entry
  return (
    <aside className={styles.traceInspector}>
      <div className={styles.traceInspectorHeader}>
        <span className={styles.traceInspectorKind}>OPCODE</span>
        <span className={styles.traceInspectorTitle}>{entry.op}</span>
      </div>
      <InspectorKV label="PC" value={entry.pc.toString()} />
      <InspectorKV label="Gas cost" value={entry.gasCost > 0 ? entry.gasCost.toLocaleString() : '—'} />
      {entry.file && entry.line && (
        <InspectorKV label="Source" value={`${entry.file}:${entry.line}`} />
      )}
      {entry.sourceLabel && (
        <InspectorKV label="Label" value={entry.sourceLabel} />
      )}
      {entry.jumpTargetLabel && (
        <InspectorKV label="Jump to" value={entry.jumpTargetLabel} />
      )}
      {entry.jumpTargetFunction && (
        <InspectorKV label="Function" value={entry.jumpTargetFunction} />
      )}
      {entry.jumpCondition && (
        <InspectorKV label="Condition" value={entry.jumpCondition} />
      )}
      {entry.error && <InspectorKV label="Error" value={entry.error} danger />}
      {entry.jumpStack && entry.jumpStack.length > 0 && (
        <InspectorArgs
          title="Stack"
          values={entry.jumpStack.map((v, i) => ({ name: `[${i}]`, value: v }))}
          empty="Empty stack."
        />
      )}
    </aside>
  );
}

// ── Jump Frame Inspector (internal function call) ─────────────

export function JumpFrameInspector({
  frame,
  addressLabels,
  tokenLabels,
  tokenAddresses,
  totalGas,
}: {
  frame: JumpFrame;
  totalGas: number;
} & AddressContext) {
  const { entry, address, gasUsed } = frame;
  const contractName = address
    ? short(address, addressLabels, tokenLabels, tokenAddresses)
    : '—';
  const fnName = entry.jumpTargetFunction || entry.jumpTargetLabel || entry.op;
  const gasPct = totalGas > 0 ? ((gasUsed / totalGas) * 100).toFixed(1) : '0';

  const stackContext = deriveJumpContext(
    entry.op,
    entry.jumpStack,
    entry.jumpTargetFunctionParams?.length,
  );

  return (
    <aside className={styles.traceInspector}>
      <div className={styles.traceInspectorHeader}>
        <span className={styles.traceInspectorKind}>JUMP</span>
        <span className={styles.traceInspectorTitle}>{contractName}.{fnName}</span>
      </div>
      <InspectorKV label="Contract" value={address} display={contractName} />
      <InspectorKV label="Function" value={fnName} />
      <InspectorKV label="Gas used" value={`${gasUsed.toLocaleString()} (${gasPct}%)`} />
      <InspectorKV label="PC" value={entry.pc.toString()} />
      {entry.jumpTargetFile && entry.jumpTargetLine && (
        <InspectorKV label="Source" value={`${entry.jumpTargetFile}:${entry.jumpTargetLine}`} />
      )}
      {entry.jumpTargetFunctionParams && stackContext && (
        <InspectorArgs
          title="Parameters"
          values={entry.jumpTargetFunctionParams.map((name, i) => ({
            name,
            value: stackContext.params[i] || '?',
          }))}
          empty="No parameters."
        />
      )}
      {entry.jumpStack && entry.jumpStack.length > 0 && (
        <InspectorArgs
          title="Stack"
          values={entry.jumpStack.map((v, i) => ({ name: `[${i}]`, value: v }))}
          empty="Empty stack."
        />
      )}
    </aside>
  );
}
