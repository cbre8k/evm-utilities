import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiStyleProps, UiVariant } from './types';
import { mergeClassName, uiVars } from './types';

type BaseTextProps = UiStyleProps & {
  as?: 'span' | 'label';
  children: ReactNode;
  hint?: ReactNode;
};

type SpanTextProps = BaseTextProps & HTMLAttributes<HTMLSpanElement> & {
  as?: 'span';
};

type LabelTextProps = BaseTextProps & LabelHTMLAttributes<HTMLLabelElement> & {
  as: 'label';
};

type TextProps = SpanTextProps | LabelTextProps;

export function Label({ children, hint, as: Tag = 'span', className, color, fontSize, fontType, style, ...props }: TextProps) {
  const sharedStyle = { ...uiVars({ color, fontSize, fontType }), ...style };

  if (hint) {
    return (
      <Tag className={mergeClassName(styles.labelWrapper, className)} style={sharedStyle} {...props}>
        <span className={styles.label}>
          {children}<span className={styles.labelHintMarker}> [?]</span>
        </span>
        <span className={styles.labelHint}>{hint}</span>
      </Tag>
    );
  }
  return (
    <Tag
      className={mergeClassName(styles.label, className)}
      style={sharedStyle}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function Hint({ children, className, color, fontSize, fontType, style, ...props }: TextProps) {
  return (
    <span
      {...props}
      className={mergeClassName(styles.hint, className)}
      style={{ ...uiVars({ color, fontSize, fontType }), ...style }}
    >
      {children}
    </span>
  );
}

type BadgeProps = TextProps & {
  variant?: Extract<UiVariant, 'default' | 'success' | 'warning' | 'danger'>;
};

export function Badge({
  children,
  className,
  color,
  fontSize,
  fontType,
  style,
  variant = 'default',
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={mergeClassName(
        styles.badge,
        variant === 'success' && styles.badgeSuccess,
        variant === 'warning' && styles.badgeWarning,
        variant === 'danger' && styles.badgeDanger,
        className,
      )}
      style={{ ...uiVars({ color, fontSize, fontType }), ...style }}
    >
      {children}
    </span>
  );
}
