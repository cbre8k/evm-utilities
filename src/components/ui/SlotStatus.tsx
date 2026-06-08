import React, { useState, useEffect } from 'react';

type SlotStatusProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  blinkOnSettle?: boolean;
  settledClassName?: string;
};

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_-$#@*+?';

export const SlotStatus: React.FC<SlotStatusProps> = ({
  text,
  className = '',
  style,
  blinkOnSettle = false,
  settledClassName = '',
}) => {
  // Pad the text to exactly 9 characters so the width stays rigid
  const targetText = text.toUpperCase().padEnd(9, ' ');
  const [displayText, setDisplayText] = useState(targetText);
  const [isSettled, setIsSettled] = useState(false);

  useEffect(() => {
    setIsSettled(false);
    let active = true;
    const startTime = Date.now();
    const durationPerChar = 120; // Stagger delay (120ms per character)
    const totalChars = 9;

    const interval = setInterval(() => {
      if (!active) return;
      const now = Date.now();
      const elapsed = now - startTime;

      let current = '';
      for (let i = 0; i < totalChars; i++) {
        const settleTime = (i + 1) * durationPerChar;
        if (elapsed >= settleTime) {
          current += targetText[i];
        } else {
          const randIdx = Math.floor(Math.random() * CHARS.length);
          current += CHARS[randIdx];
        }
      }

      setDisplayText(current);

      const allSettled = elapsed >= totalChars * durationPerChar;
      if (allSettled) {
        setDisplayText(targetText);
        setIsSettled(true);
        clearInterval(interval);
      }
    }, 35); // Fast spin frame rate

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [text]);

  const rootClass = `${className} ${isSettled && blinkOnSettle ? settledClassName : ''}`.trim();

  return (
    <span className={rootClass} style={{ fontFamily: 'monospace', whiteSpace: 'pre', ...style }}>
      {displayText}
    </span>
  );
};
