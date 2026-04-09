import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wi-Fi Login',
  description: 'Portal de autenticação Wi-Fi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#0a0e17] font-roboto antialiased">{children}</body>
    </html>
  )
}
