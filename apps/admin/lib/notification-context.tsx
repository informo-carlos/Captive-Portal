'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type ActivityStatus = 'running' | 'completed' | 'failed'

export interface Activity {
  id: string
  type: 'tenant' | 'user' | 'system'
  action: string
  message: string
  detail?: string
  status: ActivityStatus
  read: boolean
  created_at: string
  completed_at?: string
}

interface NotificationContextValue {
  activities: Activity[]
  unreadCount: number
  runningCount: number
  add: (a: Omit<Activity, 'id' | 'read' | 'created_at' | 'completed_at'>) => string
  update: (id: string, patch: Partial<Pick<Activity, 'status' | 'message' | 'detail'>>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clear: () => void
  clearCompleted: () => void
}

const STORAGE_KEY = 'admin-activities'
const MAX_ACTIVITIES = 100

const NotificationContext = createContext<NotificationContextValue>({
  activities: [],
  unreadCount: 0,
  runningCount: 0,
  add: () => '',
  update: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clear: () => {},
  clearCompleted: () => {},
})

function loadActivities(): Activity[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveActivities(list: Activity[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/**
 * Gera um ID curto. Usa crypto.randomUUID() em contextos seguros (HTTPS ou
 * localhost) e cai num fallback aleatório quando a API não está disponível
 * (HTTP em IP, alguns embeds, browsers antigos).
 *
 * Sem o fallback, criar tenant/user via painel servido em http://IP quebra:
 * notify() throw TypeError não-ApiRequestError → catch genérico do modal
 * mostra "Erro inesperado" mesmo o POST tendo dado 201 Created.
 */
function generateActivityId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // randomUUID lançou (raro, geralmente em browsers antigos com poliyfill quebrado)
    }
  }
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    setActivities(loadActivities())
  }, [])

  const add = useCallback((a: Omit<Activity, 'id' | 'read' | 'created_at' | 'completed_at'>): string => {
    const id = generateActivityId()
    const newActivity: Activity = {
      ...a,
      id,
      read: false,
      created_at: new Date().toISOString(),
      completed_at: a.status === 'completed' ? new Date().toISOString() : undefined,
    }
    setActivities((prev) => {
      const updated = [newActivity, ...prev].slice(0, MAX_ACTIVITIES)
      saveActivities(updated)
      return updated
    })
    return id
  }, [])

  const update = useCallback((id: string, patch: Partial<Pick<Activity, 'status' | 'message' | 'detail'>>) => {
    setActivities((prev) => {
      const updated = prev.map((a) => {
        if (a.id !== id) return a
        const merged = { ...a, ...patch }
        if (patch.status === 'completed' || patch.status === 'failed') {
          merged.completed_at = new Date().toISOString()
        }
        return merged
      })
      saveActivities(updated)
      return updated
    })
  }, [])

  const markAsRead = useCallback((id: string) => {
    setActivities((prev) => {
      const updated = prev.map((a) => (a.id === id ? { ...a, read: true } : a))
      saveActivities(updated)
      return updated
    })
  }, [])

  const markAllAsRead = useCallback(() => {
    setActivities((prev) => {
      const updated = prev.map((a) => ({ ...a, read: true }))
      saveActivities(updated)
      return updated
    })
  }, [])

  const clear = useCallback(() => {
    setActivities([])
    saveActivities([])
  }, [])

  const clearCompleted = useCallback(() => {
    setActivities((prev) => {
      const updated = prev.filter((a) => a.status === 'running')
      saveActivities(updated)
      return updated
    })
  }, [])

  const unreadCount = activities.filter((a) => !a.read).length
  const runningCount = activities.filter((a) => a.status === 'running').length

  return (
    <NotificationContext.Provider value={{
      activities, unreadCount, runningCount,
      add, update, markAsRead, markAllAsRead, clear, clearCompleted,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}

// Backward-compat alias — existing callers use `type Notification`
export type Notification = Activity
