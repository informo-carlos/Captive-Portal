import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Captive Portal Admin',
  description: 'Painel de gestao do Captive Portal Wi-Fi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
