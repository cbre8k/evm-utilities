import React from 'react';

type ScanlineOverlayProps = {
  className?: string;
  style?: React.CSSProperties;
};

export const ScanlineOverlay: React.FC<ScanlineOverlayProps> = ({
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        // Using theme variables to make scanlines dark in light theme and light in dark theme
        backgroundImage: `
          repeating-linear-gradient(
            to bottom,
            var(--border-default) 0px,
            var(--border-default) 1px,
            transparent 1px,
            transparent 4px
          )
        `,
        opacity: 0.035,
        ...style,
      }}
    />
  );
};
