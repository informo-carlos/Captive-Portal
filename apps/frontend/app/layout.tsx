import type { Metadata } from 'next'
import { BrandingProvider } from '../components/BrandingProvider'
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
      <body className="min-h-screen font-roboto antialiased" style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}>
        <BrandingProvider>{children}</BrandingProvider>
      </body>
    </html>
  )
}
