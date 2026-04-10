'use client'

import { useRef, useEffect } from 'react'
import { useNotifications, type Notification } from '../lib/notification-context'

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
}

const TYPE_ICONS: Record<string, { bg: string; icon: JSX.Element }> = {
  tenant: {
    bg: 'bg-edge-cyan/10 text-edge-cyan',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  user: {
    bg: 'bg-purple-500/10 text-purple-400',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  system: {
    bg: 'bg-amber-500/10 text-amber-400',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: () => void }) {
  const typeInfo = TYPE_ICONS[notification.type] || TYPE_ICONS.system

  return (
    <button
      onClick={onRead}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-t-hover ${
        !notification.read ? 'bg-edge-cyan/[0.03]' : ''
      }`}
    >
      <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${typeInfo.bg}`}>
        {typeInfo.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium ${!notification.read ? 'text-t-primary' : 'text-t-muted'}`}>
            {notification.message}
          </p>
          {!notification.read && (
            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-edge-cyan" />
          )}
        </div>
        {notification.detail && (
          <p className="mt-0.5 text-xs text-t-label truncate">{notification.detail}</p>
        )}
        <p className="mt-1 text-[10px] text-t-label">{formatTimeAgo(notification.created_at)}</p>
      </div>
    </button>
  )
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clear } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full mt-2 z-50 w-96 rounded-xl border border-t-default bg-t-card shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-t-default px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-t-primary">Notificacoes</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-edge-cyan/10 px-2 py-0.5 text-[10px] font-bold text-edge-cyan">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-[11px] font-medium text-edge-cyan hover:text-edge-cyan/80 transition-colors"
            >
              Marcar todas como lidas
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clear}
              className="text-[11px] font-medium text-t-label hover:text-red-400 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-t-default">
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <svg className="mx-auto h-10 w-10 text-t-label/50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <p className="mt-2 text-sm text-t-label">Nenhuma notificacao</p>
            <p className="mt-1 text-xs text-t-label/70">Alteracoes de configuracao aparecerao aqui.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={() => markAsRead(n.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
