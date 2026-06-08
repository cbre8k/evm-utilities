import React from 'react';

type BarcodeDecoProps = {
  className?: string;
  style?: React.CSSProperties;
  height?: number;
};

export const BarcodeDeco: React.FC<BarcodeDecoProps> = ({
  className,
  style,
  height = 14,
}) => {
  // Array of bar widths (in pixels) representing a barcode pattern
  const bars = [2, 1, 3, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2];
  
  const keyframes = `
    @keyframes barcodeScan {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.95; }
    }
  `;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1px',
        userSelect: 'none',
        pointerEvents: 'none',
        height: `${height}px`,
        ...style,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      {bars.map((w, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-block',
            width: `${w}px`,
            height: '100%',
            background: 'currentColor',
            animation: 'barcodeScan 1.5s infinite ease-in-out',
            animationDelay: `${idx * 0.08}s`,
          }}
        />
      ))}
    </span>
  );
};
