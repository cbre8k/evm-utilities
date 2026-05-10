'use client';

import { useMemo, useState } from 'react';
import type { FilteredStructLog, GasNode, TraceNode } from '@/types/explorer';
import styles from '../../explorer.module.scss';
import { buildFromStructLog, buildTraceTree } from './callTraceBuild';
import type { TraceItem } from './callTraceTypes';

interface Props {
  gasTree: GasNode;
  root: TraceNode;
  structLog?: FilteredStructLog[];
  allLogs?: Array<{ address: string; topics: string[]; data: string; eventName?: string }>;
  totalGas: number;
}

type FlameItem = {
  id: string;
  parentId: string | null;
  label: string;
  gasUsed: number;
  selfGas: number;
  depth: number;
  x: number;
  width: number;
  color: string;
  textColor: string;
  row: number;
  detail?: string;
  labelX?: number;
  accent?: string;
};

const DEPTH_ACCENTS = ['#5b8def', '#7c6dd8', '#e06c75', '#d19a66', '#56b6c2', '#98c379', '#c678dd'];

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  call:    { bg: '#2a3a5c', fg: '#d4dff7' },
  event:   { bg: '#2a4a3a', fg: '#c8f0d4' },
  storage: { bg: '#4a3a2a', fg: '#f0dcc8' },
  jump:    { bg: '#3a2a4a', fg: '#dcc8f0' },
  opcode:  { bg: '#3f3f3f', fg: '#cccccc' },
};

const GAS_COLORS = [
  { bg: '#3f3f3f', fg: '#ffffff' },
  { bg: '#595959', fg: '#ffffff' },
  { bg: '#737373', fg: '#ffffff' },
  { bg: '#8f8f8f', fg: '#111111' },
  { bg: '#ababab', fg: '#111111' },
  { bg: '#c7c7c7', fg: '#111111' },
];
const FLAME_ROW_HEIGHT = 50;
const MIN_STACK_WIDTH_PERCENT = 0.7;
const SELECTED_STACK_WIDTH_PERCENT = 50;
const MIN_SIDE_WIDTH_PERCENT = 12;

function buildCallItems(node: GasNode): FlameItem[] {
  const items: FlameItem[] = [];

  function walk(n: GasNode, x: number, width: number, depth: number, index: number) {
    const safeWidth = Math.max(width, 0);
    items.push({
      id: n.id,
      parentId: depth === 0 ? null : items[items.length - 1]?.id ?? null,
      label: shortCallLabel(n.label),
      gasUsed: n.gasUsed,
      selfGas: n.selfGas,
      depth,
      x,
      width: safeWidth,
      color: GAS_COLORS[(depth + index) % GAS_COLORS.length].bg,
      textColor: GAS_COLORS[(depth + index) % GAS_COLORS.length].fg,
      row: depth,
    });

    if (n.children.length === 0 || safeWidth <= 0) return;

    const childTotal = n.children.reduce((sum, child) => sum + Math.max(child.gasUsed, 0), 0) || n.gasUsed || 1;
    let cursor = x;
    n.children.forEach((child, childIndex) => {
      const childWidth = safeWidth * (Math.max(child.gasUsed, 0) / childTotal);
      walk(child, cursor, childWidth, depth + 1, childIndex);
      cursor += childWidth;
    });
  }

  walk(node, 0, 100, 0, 0);
  return items;
}

function buildTraceItems(root: TraceNode, structLog: FilteredStructLog[], allLogs?: Props['allLogs']) {
  if (structLog.length === 0) return null;
  return buildTraceTree(buildFromStructLog(structLog, root, allLogs));
}

function buildPrimaryTraceItems(traceItems: TraceItem[]): FlameItem[] {
  const items: FlameItem[] = [];
  let idCounter = 0;

  function itemGas(item: TraceItem): number {
    if (item.kind === 'frame') return Math.max(item.entry.gasUsed, 1);
    if (item.kind === 'jump-frame') return Math.max(item.gasUsed, 1);
    const entry = item.entry;
    return Math.max(entry.kind === 'opcode' ? entry.gasCost : entry.gasCost, 1);
  }

  function walk(traceList: TraceItem[], x: number, width: number, depthOffset: number, parentId: string | null) {
    if (traceList.length === 0 || width <= 0) return;

    const totalGas = traceList.reduce((sum, it) => sum + itemGas(it), 0) || 1;
    let cursor = x;

    for (const item of traceList) {
      const gas = itemGas(item);
      const itemWidth = width * (gas / totalGas);
      const row = item.depth + depthOffset;
      const accent = DEPTH_ACCENTS[row % DEPTH_ACCENTS.length];

      if (item.kind === 'frame') {
        const node = item.entry.node;
        const label = node.function_name || node.decodedFunction || node.type;
        const myId = `trace-${idCounter++}`;
        const cat = CATEGORY_COLORS.call;
        items.push({
          id: myId,
          parentId,
          label,
          gasUsed: item.entry.gasUsed,
          selfGas: item.entry.gasUsed,
          depth: row,
          x: cursor,
          width: itemWidth,
          color: cat.bg,
          textColor: cat.fg,
          row,
          accent,
          detail: [
            node.type,
            node.contract_name,
            item.returnValue?.value ? `=> ${item.returnValue.value}` : undefined,
          ].filter(Boolean).join(' · '),
        });
        walk(item.items, cursor, itemWidth, depthOffset, myId);
      } else if (item.kind === 'jump-frame') {
        const label = item.entry.jumpTargetFunction || item.entry.jumpTargetLabel || item.entry.op;
        const myId = `trace-${idCounter++}`;
        const cat = CATEGORY_COLORS.jump;
        items.push({
          id: myId,
          parentId,
          label,
          gasUsed: Math.max(item.gasUsed, 1),
          selfGas: Math.max(item.gasUsed, 1),
          depth: row,
          x: cursor,
          width: itemWidth,
          color: cat.bg,
          textColor: cat.fg,
          row,
          accent,
          detail: [
            item.entry.op,
            item.contractName,
            item.entry.jumpTargetFile && item.entry.jumpTargetLine ? `${item.entry.jumpTargetFile}:${item.entry.jumpTargetLine}` : undefined,
          ].filter(Boolean).join(' · '),
        });
        walk(item.items, cursor, itemWidth, depthOffset, myId);
      } else {
        const entry = item.entry;
        let label = '';
        let detail = '';
        let cat = CATEGORY_COLORS.opcode;
        if (entry.kind === 'storage') {
          label = entry.opcode;
          detail = `${entry.address} · ${entry.slot}`;
          cat = CATEGORY_COLORS.storage;
        } else if (entry.kind === 'event') {
          label = entry.name ? `emit ${entry.name}` : entry.opcode;
          detail = `${entry.opcode} · ${entry.address}`;
          cat = CATEGORY_COLORS.event;
        } else if (entry.kind === 'opcode') {
          label = entry.jumpTargetFunction || entry.jumpTargetLabel || entry.op;
          detail = [entry.op, entry.error, entry.file && entry.line ? `${entry.file}:${entry.line}` : undefined, entry.address].filter(Boolean).join(' · ');
        }
        if (label) {
          items.push({
            id: `trace-${idCounter++}`,
            parentId,
            label,
            gasUsed: Math.max(entry.gasCost, 1),
            selfGas: Math.max(entry.gasCost, 1),
            depth: row,
            x: cursor,
            width: itemWidth,
            color: cat.bg,
            textColor: cat.fg,
            row,
            accent,
            detail,
          });
        }
      }

      cursor += itemWidth;
    }
  }

  walk(traceItems, 0, 100, 0, null);
  return items.sort((a, b) => a.row - b.row || a.x - b.x);
}

function distributeStacks(
  items: FlameItem[],
  startX: number,
  totalWidth: number,
  layout: Map<string, { x: number; width: number }>,
) {
  if (items.length === 0 || totalWidth <= 0) return startX;

  const totalGas = items.reduce((sum, item) => sum + Math.max(item.gasUsed, 1), 0) || 1;
  const minWidth = items.length * MIN_STACK_WIDTH_PERCENT >= totalWidth
    ? totalWidth / items.length
    : MIN_STACK_WIDTH_PERCENT;
  const distributableWidth = Math.max(0, totalWidth - items.length * minWidth);
  let cursor = startX;

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const proportional = minWidth + (Math.max(item.gasUsed, 1) / totalGas) * distributableWidth;
    const width = isLast ? startX + totalWidth - cursor : proportional;
    layout.set(item.id, { x: cursor, width });
    cursor += width;
  });

  return cursor;
}

function gasPct(gas: number, total: number) {
  return total > 0 ? (gas / total) * 100 : 0;
}

function shortCallLabel(label: string) {
  if (!label || /^0x[a-fA-F0-9]{40}$/.test(label)) return 'CALL';
  return label;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

function colorFor(value: string) {
  return GAS_COLORS[Math.abs(hashString(value)) % GAS_COLORS.length].bg;
}

function textFor(value: string) {
  return GAS_COLORS[Math.abs(hashString(value)) % GAS_COLORS.length].fg;
}

export default function GasProfilerTab({ gasTree, root, structLog = [], allLogs, totalGas }: Props) {
  const total = gasTree.gasLimit || totalGas || gasTree.gasUsed || 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const traceItems = useMemo(() => buildTraceItems(root, structLog, allLogs), [root, structLog, allLogs]);
  const flameItems = useMemo(
    () => traceItems ? buildPrimaryTraceItems(traceItems) : buildCallItems(gasTree),
    [gasTree, traceItems],
  );
  const selected = flameItems.find(item => item.id === selectedId) ?? null;
  const selectedRow = selected?.row ?? null;
  const displayLayout = useMemo(() => {
    const layout = new Map<string, { x: number; width: number }>();
    if (selectedRow === null || !selected) return layout;

    const rowItems = flameItems
      .filter(item => item.row === selectedRow)
      .sort((a, b) => a.x - b.x);
    const selectedIndex = rowItems.findIndex(item => item.id === selected.id);
    const leftItems = rowItems.slice(0, selectedIndex);
    const rightItems = rowItems.slice(selectedIndex + 1);
    const selectedWidth = SELECTED_STACK_WIDTH_PERCENT;
    const hasLeft = leftItems.length > 0;
    const hasRight = rightItems.length > 0;
    const remainingWidth = 100 - selectedWidth;
    const leftGas = leftItems.reduce((sum, item) => sum + Math.max(item.gasUsed, 1), 0) || 1;
    const rightGas = rightItems.reduce((sum, item) => sum + Math.max(item.gasUsed, 1), 0) || 1;
    const rawLeftWidth = remainingWidth * (leftGas / (leftGas + rightGas));
    const leftWidth = hasLeft && hasRight
      ? Math.min(remainingWidth - MIN_SIDE_WIDTH_PERCENT, Math.max(MIN_SIDE_WIDTH_PERCENT, rawLeftWidth))
      : hasLeft ? remainingWidth : 0;
    const rightWidth = hasRight ? remainingWidth - leftWidth : 0;
    let cursor = 0;

    cursor = distributeStacks(leftItems, cursor, leftWidth, layout);
    layout.set(selected.id, { x: cursor, width: selectedWidth });
    cursor += selectedWidth;
    distributeStacks(rightItems, cursor, rightWidth, layout);

    return layout;
  }, [flameItems, selected, selectedRow]);
  const hovered = flameItems.find(item => item.id === hoveredId) ?? null;

  // Build ancestor/descendant sets for hover highlighting
  const hoverRelated = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const related = new Set<string>([hoveredId]);
    // ancestors
    let cur = flameItems.find(it => it.id === hoveredId);
    while (cur?.parentId) {
      related.add(cur.parentId);
      cur = flameItems.find(it => it.id === cur!.parentId);
    }
    // descendants
    const queue = [hoveredId];
    while (queue.length) {
      const pid = queue.shift()!;
      for (const it of flameItems) {
        if (it.parentId === pid && !related.has(it.id)) {
          related.add(it.id);
          queue.push(it.id);
        }
      }
    }
    return related;
  }, [hoveredId, flameItems]);

  const maxRow = flameItems.reduce((max, item) => Math.max(max, item.row), 0);
  const actualPct = gasPct(gasTree.gasUsed, total);
  const selectedPct = selected ? gasPct(selected.gasUsed, total) : 0;

  function selectItem(item: FlameItem) {
    setSelectedId(item.id);
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.gasProfilerHero}>
        <div className={styles.gasProfilerHeader}>
          <span>Total Gas - {total.toLocaleString()} Gas</span>
          <span>Actual Gas Used - {gasTree.gasUsed.toLocaleString()} Gas</span>
        </div>
        <div
          className={`${styles.gasFlameGraph} ${selectedId ? styles.gasFlameGraphHasSelection : ''}`}
          style={{ height: Math.max(240, (maxRow + 1) * FLAME_ROW_HEIGHT + 18) }}
        >
          {hovered && (
            <div className={styles.gasHoverInfo}>
              <strong>{hovered.label}</strong>
              <span>{hovered.gasUsed.toLocaleString()} Gas · {gasPct(hovered.gasUsed, total).toFixed(2)}%</span>
            </div>
          )}
          <div className={styles.gasFlameGraphInner} style={{ height: Math.max(240, (maxRow + 1) * FLAME_ROW_HEIGHT + 18) }}>
          {flameItems.map((item) => {
            const label = `${item.label} - ${item.gasUsed.toLocaleString()} Gas`;
            const isSelected = selectedId === item.id;
            const isCollapsed = selectedRow === item.row && !isSelected;
            const display = displayLayout.get(item.id);
            const isRelated = hoveredId ? hoverRelated.has(item.id) : true;
            const dimmed = hoveredId ? !isRelated : false;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selectedId === item.id}
                data-collapsed={isCollapsed ? 'true' : undefined}
                className={`${styles.gasFlameBlock} ${selectedId === item.id ? styles.gasFlameBlockSelected : ''}`}
                title={`${label}\n${item.detail ? `${item.detail}\n` : ''}${gasPct(item.gasUsed, total).toFixed(2)}% of transaction`}
                style={{
                  left: `${display?.x ?? item.x}%`,
                  width: `${Math.max(display?.width ?? item.width, 0.18)}%`,
                  top: item.row * FLAME_ROW_HEIGHT,
                  background: item.color,
                  color: item.textColor,
                  borderLeft: item.accent ? `3px solid ${item.accent}` : undefined,
                  opacity: dimmed ? 0.25 : 1,
                  transition: 'opacity 0.15s',
                }}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span>{item.label}</span>
                <small>[{item.gasUsed.toLocaleString()} Gas]</small>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div className={styles.gasProfilerGrid}>
        <section className={styles.gasProfilerPanel}>
          <h3>Gas Usage</h3>
          <p>Click a function in the stack to inspect its gas contribution.</p>
          <div className={styles.gasProfilerMetric}>
            <span>{gasTree.gasUsed.toLocaleString()}</span>
            <span>/</span>
            <span>{total.toLocaleString()} Gas Used</span>
          </div>
          <div className={styles.gasProgress}>
            <div className={styles.gasProgressFill} style={{ width: `${Math.min(actualPct, 100)}%` }}>
              {actualPct.toFixed(2)}%
            </div>
          </div>
        </section>

        <section className={styles.gasProfilerPanel}>
          {selected ? (
            <>
              <h3>{selected.label}</h3>
              <div className={styles.gasDetailLayout}>
                <div className={styles.gasDetailGrid}>
                  <span>Total Gas</span>
                  <strong>{selected.gasUsed.toLocaleString()}</strong>
                  <span>Self Gas</span>
                  <strong>{selected.selfGas.toLocaleString()}</strong>
                  <span>Depth</span>
                  <strong>{selected.depth}</strong>
                  {selected.detail && (
                    <>
                      <span>Context</span>
                      <strong>{selected.detail}</strong>
                    </>
                  )}
                </div>
                <div className={styles.gasShareChart} aria-label={`Gas share ${selectedPct.toFixed(2)}%`}>
                  <div
                    className={styles.gasShareDonut}
                    style={{ background: `conic-gradient(var(--text-primary) ${Math.min(selectedPct, 100)}%, var(--bg-tertiary) 0)` }}
                  >
                    <span>{selectedPct.toFixed(2)}%</span>
                  </div>
                  <small>Gas Share</small>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.gasEmptySelection}>
              <strong>No section selected in Gas Profiler</strong>
              <span>Select a section in the Gas Profiler to see a detailed breakdown of a function call</span>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
