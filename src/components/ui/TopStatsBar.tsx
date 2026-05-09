import type { ReactNode } from 'react';
import styles from './Ui.module.scss';
import type { UiCssVars, UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';

export type TopStatItem = UiStyleProps & {
  hint?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

type Props = UiStyleProps & {
  className?: string;
  columns?: string;
  gap?: string | number;
  items: TopStatItem[];
  padX?: string | number;
  padY?: string | number;
};

export default function TopStatsBar({
  className,
  color,
  columns,
  fontSize,
  fontType,
  gap,
  items,
  padX,
  padY,
}: Props) {
  const style: UiCssVars = uiVars({ color, fontSize, fontType });
  if (columns) style['--ui-columns'] = columns;
  if (gap !== undefined) style['--ui-gap'] = typeof gap === 'number' ? `${gap}px` : gap;
  if (padX !== undefined) style['--ui-pad-x'] = typeof padX === 'number' ? `${padX}px` : padX;
  if (padY !== undefined) style['--ui-pad-y'] = typeof padY === 'number' ? `${padY}px` : padY;

  return (
    <div className={mergeClassName(styles.topStatsBar, className)} style={style}>
      {items.map((item, index) => (
        <div key={index} className={styles.statItem} style={uiVars(item)}>
          <span className={styles.statLabel}>{item.label}</span>
          <span className={styles.statValue}>{item.value}</span>
          {item.hint && <span className={styles.hint}>{item.hint}</span>}
        </div>
      ))}
    </div>
  );
}
