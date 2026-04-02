'use client'

import { useAuth } from '../lib/auth-context'

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

export function Header() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{user.name}</p>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || ROLE_COLORS.viewer}`}
          >
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
