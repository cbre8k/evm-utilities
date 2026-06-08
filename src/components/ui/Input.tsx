'use client';

import { useId, useState, useEffect, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';
import { Label } from './Text';
import { NETWORKS } from '@/lib/constants';

function cleanUrl(url: string): string {
  let u = url.trim().toLowerCase();
  if (u.endsWith('/')) {
    u = u.slice(0, -1);
  }
  return u;
}

function isSystemRpcUrl(url: string): boolean {
  if (!url) return false;
  const cleaned = cleanUrl(url);
  for (const net of NETWORKS) {
    if (net.id === 'custom') continue;
    for (const rpc of net.archiveRpcUrls) {
      if (rpc && cleanUrl(rpc) === cleaned) return true;
    }
    for (const rpc of net.fullnodeRpcUrls) {
      if (rpc && cleanUrl(rpc) === cleaned) return true;
    }
  }
  return false;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & UiStyleProps & {
  hint?: ReactNode;
  label?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
  sensitive?: boolean;
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
  sensitive = false,
  ...props
}: Props) {
  const vars = uiVars({ color, fontSize, fontType });
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [isFocused, setIsFocused] = useState(false);
  const [scrambledValue, setScrambledValue] = useState('');

  const realValue = props.value !== undefined ? String(props.value) : '';
  const isSystemRpc = sensitive && isSystemRpcUrl(realValue);

  useEffect(() => {
    if (!sensitive || isFocused || !props.value) {
      return;
    }
    
    const scramble = () => {
      let res = '';
      for (let i = 0; i < 200; i++) {
        res += Math.random() > 0.5 ? '1' : '0';
      }
      return res;
    };

    setScrambledValue(scramble());

    const interval = setInterval(() => {
      setScrambledValue(scramble());
    }, 180);

    return () => clearInterval(interval);
  }, [sensitive, isFocused, props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (props.onChange) {
      const customEvent = {
        ...e,
        target: {
          ...e.target,
          value: val,
        },
        currentTarget: {
          ...e.currentTarget,
          value: val,
        }
      } as React.ChangeEvent<HTMLInputElement>;
      props.onChange(customEvent);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    const target = e.target;
    if (isSystemRpc) {
      requestAnimationFrame(() => {
        target.select();
      });
    }
    props.onFocus?.(e);
  };

  return (
    <div className={mergeClassName(styles.field, wrapperClassName)}>
      {label && (
        <span className={styles.labelRow}>
          <Label as="label" htmlFor={inputId} hint={hint}>{label}</Label>
        </span>
      )}
      <span className={styles.inputFrame} style={{ ...vars, position: 'relative' }}>
        <input
          {...props}
          value={props.value}
          onChange={handleChange}
          id={inputId}
          className={mergeClassName(styles.input, className)}
          style={{
            ...vars,
            ...style,
            color: sensitive && !isFocused && props.value ? 'transparent' : 'inherit',
            caretColor: sensitive && !isFocused && props.value ? 'transparent' : 'inherit',
            userSelect: sensitive ? 'none' : 'auto',
            WebkitUserSelect: sensitive ? 'none' : 'auto',
          }}
          onFocus={handleFocus}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          onCopy={(e) => {
            if (sensitive) e.preventDefault();
          }}
          onCut={(e) => {
            if (sensitive) e.preventDefault();
          }}
          onSelect={(e) => {
            if (sensitive) e.preventDefault();
          }}
        />
        {sensitive && !isFocused && props.value && (
          <div
            style={{
              position: 'absolute',
              left: '8px',
              right: '8px',
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            onCopy={(e) => e.preventDefault()}
          >
            {scrambledValue}
          </div>
        )}
        {suffix && <span className={styles.inputSuffix}>{suffix}</span>}
      </span>
    </div>
  );
}
