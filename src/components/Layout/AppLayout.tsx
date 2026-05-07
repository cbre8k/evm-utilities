'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useNetwork } from '@/contexts/NetworkContext';
import { NETWORKS, APP_VERSION } from '@/lib/constants';
import styles from './Layout.module.scss';

const NAV_ITEMS = [
  { href: '/', label: 'Simulator' },
  { href: '/selector', label: 'Selector' },
  { href: '/converter', label: 'Converter' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoBox}>
            <img src="/logo.png" alt="EVM Logo" className={styles.logoImage} />
          </div>
          <div className={styles.brandInfo}>
            <div className={styles.brandSub}>{APP_VERSION}</div>
            <div className={styles.brandName}>EVM UTILITIES</div>
          </div>
        </div>

        <nav className={styles.navLinks}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.active : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerStats}>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>NETWORK</span>
            <div className={styles.customDropdown} ref={dropdownRef}>
              <div 
                className={styles.dropdownSelected}
                onClick={() => setIsOpen(!isOpen)}
              >
                {selectedNetwork.name}
              </div>
              {isOpen && (
                <div className={styles.dropdownMenu}>
                  {NETWORKS.map(net => (
                    <div 
                      key={net.id}
                      className={`${styles.dropdownOption} ${selectedNetwork.id === net.id ? styles.active : ''}`}
                      onClick={() => {
                        setSelectedNetwork(net);
                        setIsOpen(false);
                      }}
                    >
                      {net.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>STATUS</span>
            <span className={styles.statValueSuccess}>ONLINE</span>
          </div>
          <div className={styles.themeToggleBox}>
            <button className={styles.themeBtn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </button>
          </div>
        </div>
      </header>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
