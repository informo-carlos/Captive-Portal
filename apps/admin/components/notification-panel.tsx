'use client'

import { useRef, useEffect, useState } from 'react'
import { useNotifications, type Activity, type ActivityStatus } from '../lib/notification-context'

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

type TabFilter = 'all' | 'running' | 'completed'

const ACTION_LABELS: Record<string, string> = {
  tenant_created: 'Provisionamento',
  tenant_updated: 'Atualizacao',
  tenant_activated: 'Ativacao',
  tenant_deactivated: 'Desativacao',
  tenant_deleted: 'Exclusao',
  user_created: 'Criacao de usuario',
  user_updated: 'Atualizacao de usuario',
  user_deleted: 'Exclusao de usuario',
  login: 'Autenticação',
}

const STATUS_CONFIG: Record<ActivityStatus, { label: string; dot: string; bg: string }> = {
  running: { label: 'Em andamento', dot: 'bg-blue-400 animate-pulse', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  completed: { label: 'Concluido', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Falhou', dot: 'bg-red-400', bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  tenant: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  ),
  user: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
  system: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atras`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atras`
  const days = Math.floor(hours / 24)
  return `${days}d atras`
}

function ActivityRow({ activity }: { activity: Activity }) {
  const statusCfg = STATUS_CONFIG[activity.status]
  const icon = TYPE_ICONS[activity.type] || TYPE_ICONS.system
  const operationLabel = ACTION_LABELS[activity.action] || activity.action

  return (
    <div
      className={`group px-4 py-3 transition-colors hover:bg-t-hover ${
        !activity.read ? 'border-l-2 border-l-edge-cyan' : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
          activity.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400'
            : activity.status === 'failed' ? 'bg-red-500/10 text-red-400'
            : 'bg-blue-500/10 text-blue-400'
        }`}>
          {activity.status === 'completed' ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : activity.status === 'failed' ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${statusCfg.bg}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
              <span className="text-[10px] text-t-label truncate">{operationLabel}</span>
            </div>
          </div>

          <p className="mt-1 text-sm text-t-primary truncate">
            {activity.message}
          </p>

          {activity.detail && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-t-muted">
              <span className="flex-shrink-0 opacity-60">{icon}</span>
              <span className="truncate">{activity.detail}</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-t-label">
            <span title={formatDateTime(activity.created_at)}>
              {formatTimeAgo(activity.created_at)}
            </span>
            {activity.completed_at && activity.status === 'completed' && (
              <span className="text-emerald-500/60">
                concluido em {formatDateTime(activity.completed_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotificationPanel({ open, onClose, anchorRef }: NotificationPanelProps) {
  const { activities, unreadCount, runningCount, markAllAsRead, clearCompleted, clear } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<TabFilter>('all')

  // Click outside handler — skip clicks on the anchor button to avoid toggle bug
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current && !panelRef.current.contains(target)
        && anchorRef.current && !anchorRef.current.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose, anchorRef])

  const filtered = activities.filter((a) => {
    if (tab === 'running') return a.status === 'running'
    if (tab === 'completed') return a.status === 'completed' || a.status === 'failed'
    return true
  })

  const completedCount = activities.filter((a) => a.status === 'completed' || a.status === 'failed').length

  if (!open) return null

  const tabs: { key: TabFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'running', label: 'Em andamento', count: runningCount },
    { key: 'completed', label: 'Concluidas', count: completedCount },
  ]

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full mt-2 z-50 w-[440px] rounded-xl border border-t-default bg-t-card shadow-2xl animate-modal-content"
    >
      {/* Header */}
      <div className="border-b border-t-default px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-t-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
            </svg>
            <h3 className="text-sm font-semibold text-t-primary">Atividades</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-edge-cyan/10 px-2 py-0.5 text-[10px] font-bold text-edge-cyan">
                {unreadCount} nova{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-t-label hover:text-t-secondary hover:bg-t-hover transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-3 pb-2.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'text-edge-cyan'
                  : 'text-t-label hover:text-t-secondary'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    tab === t.key ? 'bg-edge-cyan/15 text-edge-cyan' : 'bg-t-hover text-t-label'
                  }`}>
                    {t.count}
                  </span>
                )}
              </span>
              {tab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-edge-cyan" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Activity list */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-t-default">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            {tab === 'running' ? (
              <>
                <svg className="mx-auto h-10 w-10 text-t-label/30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="mt-2 text-sm text-t-label">Nenhuma operacao em andamento</p>
                <p className="mt-1 text-[11px] text-t-label/60">Operações ativas aparecerao aqui.</p>
              </>
            ) : (
              <>
                <svg className="mx-auto h-10 w-10 text-t-label/30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
                <p className="mt-2 text-sm text-t-label">Nenhuma atividade registrada</p>
                <p className="mt-1 text-[11px] text-t-label/60">Ações como criar tenants e usuarios aparecerao aqui.</p>
              </>
            )}
          </div>
        ) : (
          filtered.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </div>

      {/* Footer */}
      {activities.length > 0 && (
        <div className="flex items-center justify-between border-t border-t-default px-4 py-2.5">
          <span className="text-[10px] text-t-label">
            {activities.length} atividade{activities.length > 1 ? 's' : ''}
            {runningCount > 0 && ` · ${runningCount} em andamento`}
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-medium text-edge-cyan hover:text-edge-cyan/80 transition-colors"
              >
                Marcar como lidas
              </button>
            )}
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="text-[10px] font-medium text-t-label hover:text-t-secondary transition-colors"
              >
                Limpar concluidas
              </button>
            )}
            <button
              onClick={clear}
              className="text-[10px] font-medium text-t-label hover:text-red-400 transition-colors"
            >
              Limpar tudo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
