'use client';

import { useState } from 'react';
import { copyWithFirework } from '@/utils/copyAnimation';
import Button from './Button';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName } from './types';

type Props = UiStyleProps & {
  className?: string;
  copiedLabel?: string;
  label?: string;
  text: string;
};

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg className={styles.copyIcon} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20 6L9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className={styles.copySparkle}
          d="M17 2l.7 2.2L20 5l-2.3.8L17 8l-.7-2.2L14 5l2.3-.8L17 2z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg className={styles.copyIcon} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="11"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5.8C5 4.8 5.8 4 6.8 4H15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CopyButton({
  className,
  copiedLabel = 'COPIED',
  label = 'COPY',
  text,
  ...styleProps
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyWithFirework(text);
    if (!ok) return;

    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Button
      {...styleProps}
      aria-label={copied ? copiedLabel : label}
      className={mergeClassName(
        styles.copyButton,
        copied && styles.copyButtonCopied,
        className,
      )}
      copied={copied}
      onClick={copy}
      title={copied ? copiedLabel : label}
      variant={copied ? 'primary' : 'default'}
    >
      <span className={styles.copyButtonInner}>
        <CopyIcon copied={copied} />
      </span>
    </Button>
  );
}
