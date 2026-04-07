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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#007bbe] border-t-transparent" />
      </div>
    )
  }

  if (!hasRole(minRole)) {
    return null
  }

  return <>{children}</>
}
