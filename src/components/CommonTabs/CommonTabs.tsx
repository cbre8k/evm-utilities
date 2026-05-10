'use client';

import { TabBar, type TabBarItem } from '@/components/ui';

export type CommonTabItem<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

type CommonTabsProps<T extends string> = {
  items: CommonTabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  className?: string;
};

export default function CommonTabs<T extends string>({
  items,
  activeTab,
  onChange,
  className = '',
}: CommonTabsProps<T>) {
  const tabItems: TabBarItem<T>[] = items.map(item => ({
    ...item,
    badge: item.badge !== undefined && item.badge > 0 ? item.badge : undefined,
  }));

  return (
    <TabBar
      activeTab={activeTab}
      className={className}
      items={tabItems}
      onChange={onChange}
    />
  );
}
