'use client'

import { useState } from 'react'
import { useAuth } from '../lib/auth-context'
import { useTheme } from '../lib/theme-context'
import { useNotifications } from '../lib/notification-context'
import { NotificationPanel } from './notification-panel'

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  admin: 'bg-edge-cyan/10 text-edge-cyan border-edge-cyan/20',
  viewer: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
}

export function Header() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { unreadCount } = useNotifications()
  const [panelOpen, setPanelOpen] = useState(false)

  if (!user) return null

  return (
    <header className="relative z-30 flex h-14 items-center justify-between border-b border-t-default bg-t-bg2/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="relative rounded-lg p-2 text-t-muted transition-colors hover:bg-t-hover hover:text-t-secondary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-edge-cyan px-1 text-[9px] font-bold text-[#0a0e17]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="relative rounded-lg p-2 text-t-muted transition-colors hover:bg-t-hover hover:text-t-secondary"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-t-secondary">{user.name}</p>
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[user.role] || ROLE_COLORS.viewer}`}
          >
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-edge-cyan/30 to-edge-cyan/10 flex items-center justify-center border border-edge-cyan/20">
          <span className="text-xs font-bold text-edge-cyan">{user.name.charAt(0).toUpperCase()}</span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-t-input px-3 py-1.5 text-xs font-medium text-t-muted transition-colors hover:bg-t-hover hover:text-t-secondary"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
