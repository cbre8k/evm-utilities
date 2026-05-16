'use client';

import { useMemo, useState } from 'react';
import styles from '../../explorer.module.scss';
import type { ContractSourceBundle, ContractSourceFile, SourceSelection } from './sourceMapTypes';
import { clampLine, lineRange, linesFromSource } from './sourceMapUtils';

type Props = {
  selection: SourceSelection | null;
  bundle: ContractSourceBundle | null;
  isLoading: boolean;
  error?: string | null;
  onClose?: () => void;
};

type TabId = 'source' | 'meta';

export default function SourceMapInspector({
  selection,
  bundle,
  isLoading,
  error,
  onClose,
}: Props) {
  const [tab, setTab] = useState<TabId>('source');
  const selectedFile = selection?.file;
  const source = selectedFile?.content ?? '';
  const lines = useMemo(() => linesFromSource(source), [source]);
  const safeLine = clampLine(selection?.line, lines.length);
  const range = lineRange(safeLine, lines.length, 6);

  const fileList = bundle?.sources ?? [];

  const isEmpty = !selection || !bundle || !selectedFile;
  const showMeta = tab === 'meta';

  return (
    <aside className={styles.traceInspector}>
      <div className={styles.traceInspectorHeader}>
        <span className={styles.traceInspectorKind}>SOURCE MAP</span>
        <span className={styles.traceInspectorTitle}>
          {selectedFile ? selectedFile.name : 'No opcode selected'}
        </span>
      </div>

      <div className={styles.sourceToolbar}>
        <div className={styles.sourceTabs}>
          <button
            type="button"
            className={tab === 'source' ? styles.sourceTabActive : styles.sourceTab}
            onClick={() => setTab('source')}
          >
            Source
          </button>
          <button
            type="button"
            className={tab === 'meta' ? styles.sourceTabActive : styles.sourceTab}
            onClick={() => setTab('meta')}
          >
            Meta
          </button>
        </div>
        {onClose && (
          <button type="button" className={styles.sourceClose} onClick={onClose}>
            Close
          </button>
        )}
      </div>

      {isLoading && (
        <div className={styles.sourcePlaceholder}>Loading contract source…</div>
      )}

      {!isLoading && error && (
        <div className={styles.sourcePlaceholder}>{error}</div>
      )}

      {!isLoading && !error && isEmpty && (
        <div className={styles.sourcePlaceholder}>Select an opcode row to view mapped source.</div>
      )}

      {!isLoading && !error && !isEmpty && !showMeta && (
        <div className={styles.sourceBody}>
          <div className={styles.sourceFileList}>
            {fileList.map((file) => (
              <div
                key={file.path}
                className={file.path === selectedFile?.path ? styles.sourceFileActive : styles.sourceFile}
                title={file.path}
              >
                {file.name}
              </div>
            ))}
          </div>
          <div className={styles.sourceCode}>
            <div className={styles.sourceCodeHeader}>
              <span>{selectedFile?.path}</span>
              {safeLine && <span>Line {safeLine}</span>}
            </div>
            <pre className={styles.sourcePre}>
              {lines.slice(range.start - 1, range.end).map((lineText, idx) => {
                const lineNo = range.start + idx;
                const active = safeLine === lineNo;
                return (
                  <div
                    key={lineNo}
                    className={active ? styles.sourceLineActive : styles.sourceLine}
                  >
                    <span className={styles.sourceLineNo}>{lineNo.toString().padStart(4, ' ')}</span>
                    <span className={styles.sourceLineText}>{lineText || ' '}</span>
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      )}

      {!isLoading && !error && !isEmpty && showMeta && (
        <div className={styles.traceInspectorBlock}>
          <div className={styles.traceInspectorBlockTitle}>Selection</div>
          <div className={styles.traceInspectorKV}>
            <span>Opcode</span>
            <strong>{selection?.opcode ?? '—'}</strong>
          </div>
          <div className={styles.traceInspectorKV}>
            <span>PC</span>
            <strong>{selection?.pc ?? '—'}</strong>
          </div>
          <div className={styles.traceInspectorKV}>
            <span>File</span>
            <strong>{selectedFile?.path ?? '—'}</strong>
          </div>
          <div className={styles.traceInspectorKV}>
            <span>Line</span>
            <strong>{selection?.line ?? '—'}</strong>
          </div>
          <div className={styles.traceInspectorKV}>
            <span>Start</span>
            <strong>{selection?.start ?? '—'}</strong>
          </div>
          <div className={styles.traceInspectorKV}>
            <span>Length</span>
            <strong>{selection?.length ?? '—'}</strong>
          </div>
        </div>
      )}
    </aside>
  );
}
