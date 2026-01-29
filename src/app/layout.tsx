import type { Metadata } from 'next'
import { Inter, Press_Start_2P } from 'next/font/google'
import AntdRegistry from '@/components/AntdRegistry'
import MainLayout from '@/components/MainLayout'

const inter = Inter({ subsets: ['latin'] })
const pixelFont = Press_Start_2P({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
})

export const metadata: Metadata = {
  title: 'EVM Utilities',
  description: 'Transaction Trace & Simulation Tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${pixelFont.variable}`} style={{ margin: 0 }}>
        <AntdRegistry>
          <MainLayout>{children}</MainLayout>
        </AntdRegistry>
      </body>
    </html>
  )
}
