'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Hint, Label } from './Text';

export type DropBoxOption = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> & UiStyleProps & {
  hint?: ReactNode;
  label?: ReactNode;
  options: DropBoxOption[];
  wrapperClassName?: string;
};

export default function DropBox({
  className,
  color,
  fontSize,
  fontType,
  hint,
  label,
  options,
  style,
  wrapperClassName,
  ...props
}: Props) {
  return (
    <label className={mergeClassName(styles.field, wrapperClassName)}>
      {label && <Label>{label}</Label>}
      {hint && <Hint>{hint}</Hint>}
      <span className={styles.dropBox}>
        <select
          {...props}
          className={mergeClassName(styles.select, className)}
          style={{ ...uiVars({ color, fontSize, fontType }), ...style }}
        >
          {options.map(option => (
            <option key={option.value} disabled={option.disabled} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.dropArrow}>▾</span>
      </span>
    </label>
  );
}
