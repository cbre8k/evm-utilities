'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps, UiVariant } from './types';
import { mergeClassName, uiVars } from './types';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & UiStyleProps & {
  children: ReactNode;
  variant?: UiVariant;
  copied?: boolean;
};

export default function Button({
  children,
  className,
  color,
  copied = false,
  fontSize,
  fontType,
  style,
  type = 'button',
  variant = 'default',
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      className={mergeClassName(
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'success' && styles.buttonSuccess,
        variant === 'warning' && styles.buttonWarning,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        copied && styles.buttonCopied,
        className,
      )}
      style={{ ...uiVars({ color, fontSize, fontType }), ...style }}
    >
      {children}
    </button>
  );
}
