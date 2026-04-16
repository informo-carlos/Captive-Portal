'use client'

import { useState, useRef, useCallback } from 'react'
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
  const { unreadCount, runningCount } = useNotifications()
  const [panelOpen, setPanelOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)

  const handleToggle = useCallback(() => {
    setPanelOpen((v) => !v)
  }, [])

  const handleClose = useCallback(() => {
    setPanelOpen(false)
  }, [])

  if (!user) return null

  return (
    <header className="relative z-30 flex h-14 items-center justify-between border-b border-t-default bg-t-bg2/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Activity bell */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={handleToggle}
            className={`relative rounded-lg p-2 transition-colors ${
              panelOpen
                ? 'bg-t-hover text-t-secondary'
                : 'text-t-muted hover:bg-t-hover hover:text-t-secondary'
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
            </svg>
            {(unreadCount > 0 || runningCount > 0) && (
              <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                runningCount > 0
                  ? 'bg-blue-500 text-white animate-pulse'
                  : 'bg-edge-cyan text-edge-dark'
              }`}>
                {runningCount > 0 ? runningCount : unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel
            open={panelOpen}
            onClose={handleClose}
            anchorRef={bellRef}
          />
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
