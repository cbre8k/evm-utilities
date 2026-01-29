'use client';

import { Layout, Menu } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const { Header } = Layout;

export default function Navigation() {
  const pathname = usePathname();

  return (
    <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
      <div style={{ 
        fontFamily: 'var(--font-pixel)', 
        fontSize: '20px', 
        marginRight: '48px',
        color: '#1a1a1a',
        letterSpacing: '-0.5px'
      }}>
        e^m
      </div>
      <Menu 
        mode="horizontal" 
        selectedKeys={[pathname]} 
        style={{ flex: 1, border: 'none' }}
        items={[
          {
            key: '/',
            label: <Link href="/">Simulator</Link>,
          },
          {
            key: '/signature-lookup',
            label: <Link href="/signature-lookup">Signatures</Link>,
          },
        ]}
      />
    </Header>
  );
}
