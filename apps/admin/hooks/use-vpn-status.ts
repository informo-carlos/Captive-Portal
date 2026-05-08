'use client'

import { useState, useEffect, useCallback } from 'react'
import { getVpnStatus } from '../lib/api'
import type { VpnStatusResponse } from '../lib/api'

export function useVpnStatus(tenantId: string, enabled = true) {
  const [status, setStatus] = useState<VpnStatusResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!enabled || !tenantId) return
    let cancel = false

    const fetchStatus = async () => {
      try {
        const data = await getVpnStatus(tenantId)
        if (!cancel) {
          setStatus(data)
          setError(null)
        }
      } catch (e) {
        if (!cancel) setError(e as Error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)

    return () => {
      cancel = true
      clearInterval(interval)
    }
    // refreshTick força re-fetch manual quando o admin clica "Verificar agora"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, enabled, refreshTick])

  return { status, error, refresh }
}
