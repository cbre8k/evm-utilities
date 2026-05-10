'use client';

import type { ReactNode } from 'react';
import styles from './Ui.module.scss';
import { Badge } from './Text';
import type { UiStyleProps } from './types';
import { mergeClassName, uiVars } from './types';

export type TabBarItem<T extends string> = {
  badge?: number | string;
  disabled?: boolean;
  id: T;
  label: ReactNode;
};

type Props<T extends string> = UiStyleProps & {
  activeTab: T;
  className?: string;
  items: TabBarItem<T>[];
  onChange: (tab: T) => void;
};

export default function TabBar<T extends string>({
  activeTab,
  className,
  color,
  fontSize,
  fontType,
  items,
  onChange,
}: Props<T>) {
  return (
    <div className={mergeClassName(styles.tabBar, className)} style={uiVars({ color, fontSize, fontType })}>
      {items.map(item => (
        <button
          key={item.id}
          className={mergeClassName(styles.tab, activeTab === item.id && styles.tabActive)}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          type="button"
        >
          <span>{item.label}</span>
          {item.badge !== undefined && item.badge !== 0 && (
            <Badge>{item.badge}</Badge>
          )}
        </button>
      ))}
    </div>
  );
}
