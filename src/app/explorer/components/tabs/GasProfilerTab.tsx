'use client';
import { useState } from 'react';
import type { GasNode } from '@/types/explorer';
import { Button } from '@/components/ui';
import styles from '../../explorer.module.scss';

interface Props { gasTree: GasNode; totalGas: number }

export default function GasProfilerTab({ gasTree, totalGas }: Props) {
  const [sortBy, setSortBy] = useState<'gas' | 'self'>('gas');
  const total = totalGas || gasTree.gasUsed || 1;

  // Flatten for top consumers
  const flat: GasNode[] = [];
  function flatten(n: GasNode) { flat.push(n); n.children.forEach(flatten); }
  flatten(gasTree);
  const topN = [...flat].sort((a, b) => (sortBy === 'gas' ? b.gasUsed - a.gasUsed : b.selfGas - a.selfGas)).slice(0, 20);

  return (
    <div className={styles.tabContent}>
      {/* Summary */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}><span>■ GAS PROFILER</span><span className={styles.panelBadge}>total {total.toLocaleString()}</span></div>
        <div className={styles.sectionBody}>
          <div className={styles.gasTotal}>
            <div className={styles.gasTotalBar} style={{ width: '100%' }} />
            <span>{total.toLocaleString()} gas used</span>
          </div>
        </div>
      </div>

      {/* Call tree */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}><span>■ CALL TREE</span></div>
        <div className={styles.sectionBody} style={{ padding: 0 }}>
          <GasTreeNode node={gasTree} total={total} />
        </div>
      </div>

      {/* Top consumers */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>■ TOP CONSUMERS</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant={sortBy === 'gas' ? 'primary' : 'default'} onClick={() => setSortBy('gas')}>TOTAL</Button>
            <Button variant={sortBy === 'self' ? 'primary' : 'default'} onClick={() => setSortBy('self')}>SELF</Button>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>CALL</th>
              <th className={styles.th} style={{ textAlign: 'right' }}>TOTAL GAS</th>
              <th className={styles.th} style={{ textAlign: 'right' }}>SELF GAS</th>
              <th className={styles.th} style={{ textAlign: 'right' }}>% OF TX</th>
              <th className={styles.th}>SHARE</th>
            </tr>
          </thead>
          <tbody>
            {topN.map(n => {
              const pct = ((n.gasUsed / total) * 100).toFixed(1);
              return (
                <tr key={n.id}>
                  <td className={`${styles.td} ${styles.mono}`} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {'  '.repeat(n.depth)}{n.label || n.id}
                  </td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{n.gasUsed.toLocaleString()}</td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{n.selfGas.toLocaleString()}</td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{pct}%</td>
                  <td className={styles.td}>
                    <div className={styles.gasBar}>
                      <div className={styles.gasBarFill} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GasTreeNode({ node, total }: { node: GasNode; total: number }) {
  const [open, setOpen] = useState(node.depth < 2);
  const pct = total > 0 ? (node.gasUsed / total) * 100 : 0;
  const hasKids = node.children.length > 0;

  return (
    <div>
      <div
        className={styles.gasTreeRow}
        style={{ paddingLeft: `${12 + node.depth * 16}px` }}
        onClick={() => hasKids && setOpen(o => !o)}
      >
        <span className={styles.traceToggle}>{hasKids ? (open ? '▼' : '▶') : '·'}</span>
        <span className={`${styles.mono} ${styles.gasLabel}`}>{node.label || node.id}</span>
        <div className={styles.gasBarInline}>
          <div className={styles.gasBarFill} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className={styles.gasNum}>{node.gasUsed.toLocaleString()}</span>
        <span className={styles.gasPctLabel}>{pct.toFixed(1)}%</span>
      </div>
      {open && hasKids && node.children.map(c => (
        <GasTreeNode key={c.id} node={c} total={total} />
      ))}
    </div>
  );
}
