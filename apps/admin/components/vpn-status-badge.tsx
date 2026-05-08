'use client'

export type VpnStatus =
  | 'disabled'
  | 'pending'
  | 'awaiting_handshake'
  | 'connected'
  | 'disconnected'
  | 'error'

interface VpnStatusBadgeProps {
  status: VpnStatus
  lastHandshakeSecondsAgo?: number
  className?: string
}

interface BadgeConfig {
  icon: string
  label: string
  colorClass: string
  dotClass: string
}

function getBadgeConfig(
  status: VpnStatus,
  lastHandshakeSecondsAgo?: number,
): BadgeConfig {
  switch (status) {
    case 'disabled':
      return {
        icon: '⚫',
        label: 'VPN desabilitada',
        colorClass: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
        dotClass: 'bg-slate-400',
      }
    case 'pending':
      return {
        icon: '⏳',
        label: 'Aguardando configuração no SonicWall',
        colorClass: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        dotClass: 'bg-blue-400 animate-pulse',
      }
    case 'awaiting_handshake':
      return {
        icon: '🔄',
        label: 'Aguardando primeira conexão',
        colorClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        dotClass: 'bg-amber-400 animate-pulse',
      }
    case 'connected': {
      const timeLabel =
        lastHandshakeSecondsAgo !== undefined
          ? lastHandshakeSecondsAgo < 60
            ? `há ${lastHandshakeSecondsAgo}s`
            : `há ${Math.floor(lastHandshakeSecondsAgo / 60)}min`
          : ''
      return {
        icon: '🟢',
        label: `Conectado${timeLabel ? ` · handshake ${timeLabel}` : ''}`,
        colorClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        dotClass: 'bg-emerald-400',
      }
    }
    case 'disconnected': {
      const minsLabel =
        lastHandshakeSecondsAgo !== undefined
          ? `há ${Math.floor(lastHandshakeSecondsAgo / 60)}min`
          : ''
      return {
        icon: '🟡',
        label: `Sem handshake${minsLabel ? ` ${minsLabel}` : ''}`,
        colorClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        dotClass: 'bg-amber-400',
      }
    }
    case 'error':
      return {
        icon: '🔴',
        label: 'Erro · ver detalhes',
        colorClass: 'bg-red-500/10 text-red-400 border border-red-500/20',
        dotClass: 'bg-red-400',
      }
  }
}

export function VpnStatusBadge({
  status,
  lastHandshakeSecondsAgo,
  className = '',
}: VpnStatusBadgeProps) {
  const config = getBadgeConfig(status, lastHandshakeSecondsAgo)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.colorClass} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </span>
  )
}
