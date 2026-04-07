'use client'

import { useAuth } from '../lib/auth-context'

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-500/15 text-purple-400',
  admin: 'bg-[#007bbe]/15 text-[#007bbe]',
  viewer: 'bg-slate-500/15 text-slate-400',
}

export function Header() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#021327]/50 px-6 backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-200">{user.name}</p>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || ROLE_COLORS.viewer}`}
          >
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
