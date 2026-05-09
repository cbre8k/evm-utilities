'use client';

import type { ReactNode, TextareaHTMLAttributes } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Label } from './Text';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & UiStyleProps & {
  hint?: ReactNode;
  label?: ReactNode;
  wrapperClassName?: string;
};

export default function Textarea({
  className,
  color,
  fontSize,
  fontType,
  hint,
  label,
  rows = 4,
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
      <span className={mergeClassName(styles.inputFrame, styles.textareaFrame)} style={vars}>
        <textarea
          {...props}
          rows={rows}
          className={mergeClassName(styles.textarea, className)}
          style={{ ...vars, ...style }}
        />
      </span>
    </label>
  );
}
