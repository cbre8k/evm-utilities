import type { CSSProperties } from 'react';

export type UiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'ghost';
export type UiFont = 'mono' | 'sans' | 'dot';

export type UiStyleProps = {
  color?: string;
  fontSize?: string | number;
  fontType?: UiFont | string;
};

export type UiCssVars = CSSProperties & {
  '--ui-color'?: string;
  '--ui-size'?: string;
  '--ui-font'?: string;
  '--ui-bg'?: string;
  '--ui-border'?: string;
  '--ui-height'?: string;
  '--ui-pad-x'?: string;
  '--ui-pad-y'?: string;
  '--ui-columns'?: string;
  '--ui-gap'?: string;
};

export function uiVars({ color, fontSize, fontType }: UiStyleProps): UiCssVars {
  const style: UiCssVars = {};
  if (color) style['--ui-color'] = color;
  if (fontSize !== undefined) style['--ui-size'] = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;
  if (fontType) {
    style['--ui-font'] = fontType === 'mono'
      ? 'var(--font-mono), JetBrains Mono, SF Mono, monospace'
      : fontType === 'dot'
        ? 'var(--font-dot-matrix), Bit Dotted, VT323, monospace'
        : fontType === 'sans'
          ? 'var(--font-main), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
          : fontType;
  }
  return style;
}

export function mergeClassName(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
