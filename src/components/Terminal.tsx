'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Card, Flex } from 'antd';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  write: (data: string) => void;
  clear: () => void;
}

const Terminal = forwardRef<TerminalHandle, {}>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      xtermRef.current?.write(data);
    },
    clear: () => {
      xtermRef.current?.clear();
    }
  }));

  useEffect(() => {
    const initTerminal = async () => {
      if (!containerRef.current || xtermRef.current) return;

      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      const term = new XTerm({
        theme: {
          background: '#0a0a0a',
          foreground: '#ffffff',
          cursor: 'transparent',
          selectionBackground: 'rgba(0, 212, 255, 0.3)',
        },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.2,
        cursorBlink: false,
        convertEol: true, // Treat \n as \r\n
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      
      term.open(containerRef.current);
      fitAddon.fit();

      xtermRef.current = term;

      // Resize observer
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(containerRef.current);
      
      return () => {
        resizeObserver.disconnect();
        term.dispose();
      };
    };

    initTerminal();
  }, []);

  const trafficLights = (
    <Flex gap="small">
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
    </Flex>
  );

  return (
    <Card 
      title={trafficLights}
      styles={{ 
        header: { 
          backgroundColor: '#1f1f1f', 
          borderBottom: '1px solid #303030',
          minHeight: '40px',
        },
        body: { 
          padding: '12px', 
          backgroundColor: '#0a0a0a',
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }
      }}
      style={{ 
        overflow: 'hidden', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column' 
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '300px', flex: 1 }} />
    </Card>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;
