'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { useTheme } from '@/components/ThemeProvider';
import '@xterm/xterm/css/xterm.css';
import styles from './Terminal.module.scss';

export interface TerminalHandle {
  write: (data: string) => void;
  clear: () => void;
}

function getTerminalColors(): { bg: string; fg: string; selection: string } {
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue('--terminal-bg').trim() || '#0a0a0a',
    fg: s.getPropertyValue('--terminal-fg').trim() || '#e5e5e5',
    selection: s.getPropertyValue('--terminal-selection').trim() || 'rgba(37,99,235,0.3)',
  };
}

const Terminal = forwardRef<TerminalHandle, object>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();

  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      xtermRef.current?.write(data);
    },
    clear: () => {
      xtermRef.current?.reset();
      fitAddonRef.current?.fit();
    },
  }));

  useEffect(() => {
    let resizeObserver: ResizeObserver | undefined;
    let disposed = false;

    const initTerminal = async () => {
      if (!containerRef.current || xtermRef.current) return;

      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      if (disposed) return;

      const colors = getTerminalColors();
      const term = new XTerm({
        theme: {
          background: colors.bg,
          foreground: colors.fg,
          cursor: 'transparent',
          selectionBackground: colors.selection,
        },
        fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
        fontSize: 12,
        lineHeight: 1.4,
        cursorBlink: false,
        convertEol: true,
        rows: 10,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Delay fit until the browser has laid out the container
      requestAnimationFrame(() => {
        if (!disposed) {
          fitAddon.fit();
        }
      });

      resizeObserver = new ResizeObserver(() => {
        if (!disposed) {
          fitAddon.fit();
        }
      });
      resizeObserver.observe(containerRef.current!);
    };

    initTerminal();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Update xterm colors when theme changes
  useEffect(() => {
    if (!xtermRef.current) return;
    // Small delay to let CSS variables update
    requestAnimationFrame(() => {
      const colors = getTerminalColors();
      const terminal = xtermRef.current;
      if (!terminal) return;
      terminal.options.theme = {
        background: colors.bg,
        foreground: colors.fg,
        cursor: 'transparent',
        selectionBackground: colors.selection,
      };
    });
  }, [theme]);

  return (
    <div className={styles.terminal}>
      <div className={styles.header}>
        <div className={styles.controls}>
          <div className={styles.square} />
          <div className={styles.square} />
          <div className={styles.square} />
        </div>
        <span className={styles.title}>TERMINAL OUTPUT</span>
      </div>
      <div className={styles.body}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', flex: 1 }} />
      </div>
    </div>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;
