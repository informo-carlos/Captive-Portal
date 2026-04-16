import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { BrandingProvider } from '../components/BrandingProvider'
import './globals.css'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
})

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
    <html lang="pt-BR" className={roboto.variable}>
      <body className="min-h-screen font-roboto antialiased" style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}>
        <BrandingProvider>{children}</BrandingProvider>
      </body>
    </html>
  )
}
