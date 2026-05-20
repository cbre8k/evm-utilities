import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import AppLayout from '@/components/Layout';
import AntdRegistry from '@/components/AntdRegistry';
import { ThemeProvider } from '@/components/ThemeProvider';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { AgentProvider } from '@/contexts/AgentContext';
import GlobalAgent from '@/components/GlobalAgent';
import '@/styles/global.scss';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const mainFont = localFont({
  src: '../../public/fonts/main.ttf',
  variable: '--font-main',
});

const dotGothic = localFont({
  src: '../../public/fonts/dotfont.ttf',
  variable: '--font-dot-matrix',
});

export const metadata: Metadata = {
  title: 'EVM Utils',
  description: 'EVM Transaction Simulator & Developer Tools',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${dotGothic.variable} ${mainFont.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b={light:'#f4f4f5',dark:'#0e0e0e',retro:'#eee8d5',hacker:'#0c100c',cyberpunk:'#0a0118',nord:'#2a303c'};var t=localStorage.getItem('theme');if(!t||!b[t]){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t);document.body.style.background=b[t]}catch(e){}}())`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <NetworkProvider>
            <AgentProvider>
              <AntdRegistry>
                <AppLayout>{children}</AppLayout>
              </AntdRegistry>
              <GlobalAgent />
            </AgentProvider>
          </NetworkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
