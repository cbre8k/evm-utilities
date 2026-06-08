import React, { useState } from 'react';

type GlitchTextProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'div' | 'span';
};

export const GlitchText: React.FC<GlitchTextProps> = ({
  text,
  className,
  style,
  as: Component = 'span',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Injected keyframes for glitch and scanning lines
  const keyframes = `
    @keyframes hgGlitch {
      0% { transform: translate(0, 0) skew(0deg); }
      10% { transform: translate(-1px, 1px) skew(-0.5deg); }
      20% { transform: translate(1px, -1px) skew(0.5deg); }
      30% { transform: translate(-1px, 0px) skew(0deg); }
      40% { transform: translate(1px, 1px) skew(0.5deg); }
      50% { transform: translate(0, 0) skew(-0.5deg); }
      100% { transform: translate(0, 0) skew(0deg); }
    }
  `;

  return (
    <span
      className={className}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'inline-block',
        fontFamily: 'monospace',
        cursor: 'default',
        ...style,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <Component
        style={{
          display: 'block',
          animation: isHovered ? 'hgGlitch 0.3s steps(2) infinite' : 'none',
          color: 'var(--text-primary)',
        }}
      >
        {text}
      </Component>
      {isHovered && (
        <>
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              color: 'var(--accent)',
              opacity: 0.7,
              clipPath: 'inset(10% 0 60% 0)',
              transform: 'translate(-2px, 0)',
              display: 'block',
              pointerEvents: 'none',
            }}
          >
            {text}
          </span>
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              color: 'var(--color-danger)',
              opacity: 0.7,
              clipPath: 'inset(50% 0 10% 0)',
              transform: 'translate(2px, 0)',
              display: 'block',
              pointerEvents: 'none',
            }}
          >
            {text}
          </span>
        </>
      )}
    </span>
  );
};
