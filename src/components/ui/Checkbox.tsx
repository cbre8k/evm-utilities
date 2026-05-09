'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Label } from './Text';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & UiStyleProps & {
  children: ReactNode;
  hint?: string;
  wrapperClassName?: string;
};

export default function Checkbox({
  children,
  className,
  color,
  fontSize,
  fontType,
  hint,
  style,
  wrapperClassName,
  ...props
}: Props) {
  return (
    <span className={mergeClassName(styles.checkboxWrapper, wrapperClassName)}>
      <Label
        as="label"
        hint={hint}
        className={mergeClassName(styles.checkbox, className)}
        style={{ ...uiVars({ color, fontSize, fontType }), ...style }}
      >
        <input type="checkbox" {...props} />
        {children}
      </Label>
    </span>
  );
}
