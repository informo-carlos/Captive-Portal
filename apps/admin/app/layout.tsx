import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
})

export const metadata: Metadata = {
  title: '4Edge — Captive Portal Admin',
  description: 'Painel de gestão do Captive Portal Wi-Fi — 4Edge Datacenter',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning className={roboto.variable}>
      <body className="min-h-screen bg-t-bg font-roboto antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
