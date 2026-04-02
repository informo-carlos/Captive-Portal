'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { AdminUser, AdminRole } from '@captive-portal/shared'
import { getMe, setToken, getToken, login as apiLogin } from './api'

interface AuthState {
  user: AdminUser | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (minRole: AdminRole) => boolean
}

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  viewer: 0,
  admin: 1,
  superadmin: 2,
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setState({ user: null, loading: false })
      return
    }

    getMe()
      .then((user) => setState({ user, loading: false }))
      .catch(() => {
        setToken(null)
        setState({ user: null, loading: false })
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password })
    setToken(res.token)
    const user = await getMe()
    setState({ user, loading: false })
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setState({ user: null, loading: false })
    // Hard navigation intencional para limpar todo estado client-side (cache React, refs, etc)
    window.location.href = '/login'
  }, [])

  const hasRole = useCallback(
    (minRole: AdminRole) => {
      if (!state.user) return false
      return ROLE_HIERARCHY[state.user.role] >= ROLE_HIERARCHY[minRole]
    },
    [state.user],
  )

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
