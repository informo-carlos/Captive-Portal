'use client'

import { AuthProvider } from '../lib/auth-context'
import { ThemeProvider } from '../lib/theme-context'
import { NotificationProvider } from '../lib/notification-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
