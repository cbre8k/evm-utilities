'use client';

import { Layout } from 'antd';
import Navigation from './Navigation';

const { Content } = Layout;

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Navigation />
      <Content>{children}</Content>
    </Layout>
  );
}
