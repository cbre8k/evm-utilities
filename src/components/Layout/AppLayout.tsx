'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAgent } from '@/contexts/AgentContext';
import { NETWORKS, APP_VERSION } from '@/lib/constants';
import { Button, ScanlineOverlay } from '@/components/ui';
import styles from './Layout.module.scss';

const NAV_ITEMS = [
  { href: '/', label: 'Simulator' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/misc', label: 'Misc' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { selectedNetwork, setSelectedNetwork, chainId, latency } = useNetwork();
  const { registerHandler } = useAgent();
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

  // Register global agent actions: navigate + network switch
  useEffect(() => {
    return registerHandler(['navigate', 'switch_network'], (action) => {
      if (action.type === 'navigate') {
        router.push(action.page);
      } else if (action.type === 'switch_network') {
        const net = NETWORKS.find(n => n.id === action.networkId);
        if (net) setSelectedNetwork(net);
      }
    });
  }, [registerHandler, router, setSelectedNetwork]);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoBox} style={{ filter: 'grayscale(100%) contrast(200%)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 1px, var(--text-tertiary) 1px, var(--text-tertiary) 2px)', zIndex: 1, mixBlendMode: 'multiply' }}></div>
            <Image src="/logo.png" alt="EVM Logo" width={32} height={32} className={styles.logoImage} />
          </div>
          <div className={styles.brandInfo}>
            <div className={styles.brandSub}>v{APP_VERSION}</div>
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
                className={`${styles.dropdownSelected} ${isOpen ? styles.dropdownSelectedOpen : ''}`}
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
          <div className={styles.themeToggleBox}>
            <Button className={styles.themeBtn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </Button>
          </div>
        </div>
      </header>

      <main className={styles.content}>
        <ScanlineOverlay />
        {children}
      </main>

      <div className={styles.mobileFallback}>
        <Image src="/please.png" alt="Please use Desktop" width={960} height={720} className={styles.mobileImage} />
      </div>
    </div>
  );
}
