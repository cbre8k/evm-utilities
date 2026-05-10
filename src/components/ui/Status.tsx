import type { ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';

export type StatusTone = 'idle' | 'loading' | 'success' | 'error' | 'info';

type Props = UiStyleProps & {
  children: ReactNode;
  className?: string;
  tone?: StatusTone;
};

export default function Status({
  children,
  className,
  color,
  fontSize,
  fontType,
  tone = 'idle',
}: Props) {
  return (
    <span
      className={mergeClassName(
        styles.status,
        tone === 'loading' && styles.statusLoading,
        tone === 'success' && styles.statusSuccess,
        tone === 'error' && styles.statusError,
        tone === 'info' && styles.statusInfo,
        className,
      )}
      style={uiVars({ color, fontSize, fontType })}
    >
      <span className={styles.statusDot} />
      <span>{children}</span>
    </span>
  );
}
