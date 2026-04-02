'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { AdminRole } from '@captive-portal/shared'
import { useAuth } from '../lib/auth-context'

interface RequireRoleProps {
  minRole: AdminRole
  children: React.ReactNode
}

export function RequireRole({ minRole, children }: RequireRoleProps) {
  const { hasRole, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !hasRole(minRole)) {
      router.replace('/dashboard')
    }
  }, [loading, hasRole, minRole, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!hasRole(minRole)) {
    return (
      <div className="rounded-lg bg-yellow-50 p-6 text-center">
        <p className="text-sm text-yellow-700">
          Voce nao tem permissao para acessar esta pagina.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
