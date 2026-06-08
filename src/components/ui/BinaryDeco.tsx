import React from 'react';

type BinaryDecoProps = {
  length?: number;
  className?: string;
  style?: React.CSSProperties;
};

export const BinaryDeco: React.FC<BinaryDecoProps> = ({
  length = 64,
  className,
  style,
}) => {
  // A deterministic pseudo-random sequence of bits to avoid impure Math.random calls during render
  const binaryString = Array.from({ length }, (_, i) => {
    const bit = (i * 37 + 13) % 2;
    const space = i > 0 && i % 8 === 0 ? ' ' : '';
    return space + bit;
  }).join('');

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        fontFamily: 'monospace',
        fontSize: '9px',
        color: 'var(--text-tertiary)',
        opacity: 0.3,
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        letterSpacing: '0.05em',
        ...style,
      }}
    >
      {binaryString}
    </div>
  );
};
