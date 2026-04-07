import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: '4Edge — Captive Portal Admin',
  description: 'Painel de gestao do Captive Portal Wi-Fi — 4Edge Datacenter',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#0a1629] font-roboto antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
