'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Label } from './Text';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & UiStyleProps & {
  hint?: ReactNode;
  label?: ReactNode;
  wrapperClassName?: string;
};

export default function Input({
  className,
  color,
  fontSize,
  fontType,
  hint,
  label,
  style,
  wrapperClassName,
  ...props
}: Props) {
  const vars = uiVars({ color, fontSize, fontType });

  return (
    <label className={mergeClassName(styles.field, wrapperClassName)}>
      {label && (
        <span className={styles.labelRow}>
          <Label hint={hint}>{label}</Label>
        </span>
      )}
      <span className={styles.inputFrame} style={vars}>
        <input
          {...props}
          className={mergeClassName(styles.input, className)}
          style={{ ...vars, ...style }}
        />
      </span>
    </label>
  );
}
