'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface Notification {
  id: string
  type: 'tenant' | 'user' | 'system'
  action: string
  message: string
  detail?: string
  read: boolean
  created_at: string
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  add: (n: Omit<Notification, 'id' | 'read' | 'created_at'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clear: () => void
}

const STORAGE_KEY = 'admin-notifications'
const MAX_NOTIFICATIONS = 50

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  add: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clear: () => {},
})

function loadNotifications(): Notification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotifications(list: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    setNotifications(loadNotifications())
  }, [])

  const persist = useCallback((list: Notification[]) => {
    setNotifications(list)
    saveNotifications(list)
  }, [])

  const add = useCallback((n: Omit<Notification, 'id' | 'read' | 'created_at'>) => {
    const newNotification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      read: false,
      created_at: new Date().toISOString(),
    }
    setNotifications((prev) => {
      const updated = [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      saveNotifications(updated)
      return updated
    })
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      saveNotifications(updated)
      return updated
    })
  }, [])

  const clear = useCallback(() => {
    persist([])
  }, [persist])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, add, markAsRead, markAllAsRead, clear }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
