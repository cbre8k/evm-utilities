import React from 'react';

type DividerPattern = 'dash' | 'slash' | 'colon' | 'diamond' | 'custom';

type AsciiDividerProps = {
  pattern?: DividerPattern;
  customChar?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
};

const PATTERNS: Record<DividerPattern, string> = {
  dash: '-',
  slash: '/',
  colon: ':',
  diamond: '<>',
  custom: '-',
};

export const AsciiDivider: React.FC<AsciiDividerProps> = ({
  pattern = 'dash',
  customChar,
  label,
  className,
  style,
}) => {
  const char = pattern === 'custom' ? customChar || '-' : PATTERNS[pattern];
  const repeatCount = Math.max(10, Math.floor(60 / char.length));
  const separator = char.repeat(repeatCount);

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        margin: '12px 0',
        fontFamily: 'monospace',
        fontSize: '10px',
        color: 'var(--text-tertiary)',
        opacity: 0.7,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        ...style,
      }}
    >
      {label ? (
        <>
          <span style={{ marginRight: '8px' }}>{separator.slice(0, Math.floor(repeatCount / 2))}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
            [ {label} ]
          </span>
          <span style={{ marginLeft: '8px' }}>{separator.slice(0, Math.floor(repeatCount / 2))}</span>
        </>
      ) : (
        <span>{separator}</span>
      )}
    </div>
  );
};
