'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Label } from './Text';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & UiStyleProps & {
  hint?: ReactNode;
  label?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
};

export default function Input({
  className,
  color,
  fontSize,
  fontType,
  hint,
  id,
  label,
  style,
  suffix,
  wrapperClassName,
  ...props
}: Props) {
  const vars = uiVars({ color, fontSize, fontType });
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={mergeClassName(styles.field, wrapperClassName)}>
      {label && (
        <span className={styles.labelRow}>
          <Label as="label" htmlFor={inputId} hint={hint}>{label}</Label>
        </span>
      )}
      <span className={styles.inputFrame} style={vars}>
        <input
          {...props}
          id={inputId}
          className={mergeClassName(styles.input, className)}
          style={{ ...vars, ...style }}
        />
        {suffix && <span className={styles.inputSuffix}>{suffix}</span>}
      </span>
    </div>
  );
}
