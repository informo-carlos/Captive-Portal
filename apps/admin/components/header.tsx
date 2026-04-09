'use client'

import { useAuth } from '../lib/auth-context'

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

  if (!user) return null

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#080c14]/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-200">{user.name}</p>
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
          className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
