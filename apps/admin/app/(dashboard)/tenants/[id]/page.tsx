'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TenantDetail, TenantRadiusStatus } from '@captive-portal/shared'
import { getTenant, updateTenantStatus, deleteTenant, retryTenantProvisioning, getTenantRadiusStatus } from '../../../../lib/api'
import { ApiRequestError } from '../../../../lib/api'
import { useAuth } from '../../../../lib/auth-context'
import { useNotifications } from '../../../../lib/notification-context'
import { TenantModal } from '../../../../components/tenant-modal'
import { TenantFirewallHelp } from '../../../../components/tenant-firewall-help'
import { RadiusOnlineBadge } from '../../../../components/radius-online-badge'
import { VpnStatusBadge } from '../../../../components/vpn-status-badge'
import { useVpnStatus } from '../../../../hooks/use-vpn-status'

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const canDelete = hasRole('superadmin')
  const { add: notify } = useNotifications()

  const tenantId = params.id as string

  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchTenant = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getTenant(tenantId)
      setTenant(data)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar detalhes do tenant.')
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchTenant()
  }, [fetchTenant])

  // Polling enquanto provisionando — o worker demora alguns segundos pra
  // criar o container, esse refresh dá feedback visual sem F5.
  useEffect(() => {
    if (tenant?.status !== 'provisioning') return
    const handle = setInterval(fetchTenant, 3000)
    return () => clearInterval(handle)
  }, [tenant?.status, fetchTenant])

  // Status RADIUS — active_sessions, online/offline, last_accounting_at.
  // Só faz sentido consultar pra tenants RADIUS ativos (enabled=false senão).
  // Poll de 15s — o endpoint é barato (2 queries) e o operador precisa ver
  // "online" aparecer logo depois que o firewall do cliente começa a falar.
  const [radiusStatus, setRadiusStatus] = useState<TenantRadiusStatus | null>(null)
  useEffect(() => {
    if (!tenant || tenant.auth_mode !== 'radius' || tenant.status !== 'active') {
      setRadiusStatus(null)
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const s = await getTenantRadiusStatus(tenant.id)
        if (!cancelled) setRadiusStatus(s)
      } catch {
        // silencioso — se o endpoint falhar, a UI fica sem badge (melhor que
        // piscar erros pro operador). Volta no próximo poll.
      }
    }
    poll()
    const handle = setInterval(poll, 15000)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [tenant])

  // VPN status — polling só quando tenant é sonicwall/lhm e vpn_enabled
  const vpnEnabled =
    tenant?.auth_mode === 'sonicwall' &&
    tenant?.sonicwall_config?.mode === 'lhm' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- campo vpn_enabled ainda não tipado no shared
    !!(tenant as any).vpn_enabled
  const { status: vpnStatus } = useVpnStatus(tenantId, vpnEnabled)

  const [retrying, setRetrying] = useState(false)
  const handleRetryProvisioning = async () => {
    if (!tenant) return
    setRetrying(true)
    try {
      await retryTenantProvisioning(tenant.id)
      await fetchTenant()
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message)
    } finally {
      setRetrying(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!tenant) return
    const newStatus = tenant.status === 'active' ? 'inactive' : 'active'
    setTogglingStatus(true)
    try {
      await updateTenantStatus(tenant.id, newStatus)
      notify({
        type: 'tenant',
        action: newStatus === 'active' ? 'tenant_activated' : 'tenant_deactivated',
        status: 'completed',
        message: `Tenant ${newStatus === 'active' ? 'ativado' : 'desativado'}`,
        detail: tenant.name,
      })
      await fetchTenant()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      }
    } finally {
      setTogglingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!tenant) return
    setDeleting(true)
    try {
      await deleteTenant(tenant.id)
      notify({
        type: 'tenant',
        action: 'tenant_deleted',
        status: 'completed',
        message: 'Tenant deletado',
        detail: tenant.name,
      })
      router.push('/tenants')
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      }
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  const handleModalSuccess = () => {
    setModalOpen(false)
    fetchTenant()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
      </div>
    )
  }

  if (error && !tenant) {
    return (
      <div className="space-y-4">
        <Link href="/tenants" className="text-sm text-edge-cyan hover:underline">&larr; Voltar para tenants</Link>
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      </div>
    )
  }

  if (!tenant) return null

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      provisioning: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      active: 'bg-edge-cyan/10 text-edge-cyan border border-edge-cyan/20',
      inactive: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      failed: 'bg-red-500/10 text-red-400 border border-red-500/20',
      deleted: 'bg-red-500/10 text-red-400 border border-red-500/20',
    }
    const labels: Record<string, string> = {
      provisioning: 'Provisionando...',
      active: 'Ativo',
      inactive: 'Inativo',
      failed: 'Falhou',
      deleted: 'Deletado',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${colors[status] || 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
        {status === 'provisioning' ? (
          <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
        ) : (
          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-edge-cyan' : status === 'inactive' ? 'bg-amber-400' : 'bg-red-400'}`} />
        )}
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div>
      {/* Breadcrumb + Actions */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/tenants" className="text-sm text-edge-cyan hover:underline">&larr; Voltar para tenants</Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-t-primary">{tenant.name}</h1>
            {statusBadge(tenant.status)}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                tenant.status === 'active'
                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-edge-cyan/10 text-edge-cyan hover:bg-edge-cyan/20'
              }`}
            >
              {togglingStatus ? '...' : tenant.status === 'active' ? 'Desativar' : 'Ativar'}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 transition-colors"
            >
              Editar
            </button>
            {canDelete && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Deletar
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Banner de provisioning */}
      {tenant.status === 'provisioning' && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <div>
            <p className="font-medium">Provisionando container do tenant...</p>
            <p className="mt-0.5 text-blue-700">
              O worker está criando o container Docker, rodando healthcheck e configurando o nginx.
              Essa página vai atualizar automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Banner de failure */}
      {tenant.status === 'failed' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Provisionamento falhou</p>
              {tenant.provisioning_error && (
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-red-700">
                  {tenant.provisioning_error}
                </pre>
              )}
            </div>
            {canEdit && (
              <button
                onClick={handleRetryProvisioning}
                disabled={retrying}
                className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {retrying ? 'Tentando...' : 'Tentar novamente'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stats Cards */}
        <div className="lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-xl p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-t-label">Total de sessoes</p>
            <p className="mt-2 text-3xl font-bold text-t-primary">{tenant.stats.total_sessions.toLocaleString('pt-BR')}</p>
            <div className="mt-3 h-px bg-gradient-to-r from-edge-cyan/30 to-transparent" />
          </div>
          <div className="glass-card rounded-xl p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-t-label">Sessões últimos 30 dias</p>
            <p className="mt-2 text-3xl font-bold text-t-primary">{tenant.stats.sessions_last_30d.toLocaleString('pt-BR')}</p>
            <div className="mt-3 h-px bg-gradient-to-r from-edge-cyan/30 to-transparent" />
          </div>
          <div className="glass-card rounded-xl p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-t-label">Ultima autenticação</p>
            <p className="mt-2 text-lg font-semibold text-t-primary">
              {tenant.stats.last_auth_at
                ? new Date(tenant.stats.last_auth_at).toLocaleString('pt-BR')
                : 'Nenhuma'}
            </p>
            <div className="mt-3 h-px bg-gradient-to-r from-edge-cyan/30 to-transparent" />
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="glass-card rounded-xl">
            <div className="border-b border-t-default px-6 py-4">
              <h2 className="text-sm font-semibold text-t-secondary">Informações gerais</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <InfoRow label="ID" value={tenant.id} mono />
              <InfoRow label="Nome" value={tenant.name} />
              <InfoRow label="Porta" value={String(tenant.port)} mono />
              <InfoRow label="Criado em" value={new Date(tenant.created_at).toLocaleString('pt-BR')} />
              {tenant.updated_at && (
                <InfoRow label="Atualizado em" value={new Date(tenant.updated_at).toLocaleString('pt-BR')} />
              )}
            </div>
          </div>

          {/* Config por modo — SonicWall ou RADIUS */}
          {tenant.auth_mode !== 'radius' && (
            <div className="glass-card rounded-xl">
              <div className="border-b border-t-default px-6 py-4">
                <h2 className="text-sm font-semibold text-t-secondary">Configuração SonicWall</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                {tenant.sonicwall_config ? (
                  <>
                    <InfoRow label="Modo" value={tenant.sonicwall_config.mode === 'lhm' ? 'LHM (External Guest Auth)' : 'REST API'} />
                    {tenant.sonicwall_config.mode === 'rest' && (
                      <>
                        <InfoRow label="Host" value={tenant.sonicwall_config.host || '-'} mono />
                        <InfoRow label="Porta" value={String(tenant.sonicwall_config.port || 443)} mono />
                        <InfoRow label="Usuário" value={tenant.sonicwall_config.user || '-'} />
                        <InfoRow label="Firmware" value={`Gen ${tenant.sonicwall_config.firmware || '?'}`} />
                      </>
                    )}
                    {tenant.sonicwall_config.mode === 'lhm' && (
                      <>
                        <InfoRow label="Porta LHM" value={String(tenant.sonicwall_config.lhm_port || 4043)} mono />
                        <InfoRow label="Guest user" value={tenant.sonicwall_config.guest_service_user || '(não configurado)'} />
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-t-label">Nenhuma configuracao disponível.</p>
                )}
              </div>
            </div>
          )}

          {tenant.auth_mode === 'radius' && (
            <div className="glass-card rounded-xl">
              <div className="border-b border-t-default px-6 py-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-t-secondary">Configuração RADIUS</h2>
                <div className="flex items-center gap-2">
                  <RadiusOnlineBadge status={radiusStatus} tenantStatus={tenant.status} />
                  <span className="rounded-full bg-edge-cyan/10 px-2 py-0.5 text-[10px] font-medium text-edge-cyan border border-edge-cyan/20">
                    MAB + CoA
                  </span>
                </div>
              </div>
              <div className="px-6 py-4 space-y-3">
                <InfoRow
                  label="Shared secret"
                  value={tenant.radius_config?.has_shared_secret ? '••••••••  (criptografado)' : '(não configurado)'}
                />
                <InfoRow
                  label="Porta Auth (UDP)"
                  value={tenant.radius_auth_port ? String(tenant.radius_auth_port) : '(aguardando provisioner)'}
                  mono
                />
                <InfoRow
                  label="Porta Accounting (UDP)"
                  value={tenant.radius_acct_port ? String(tenant.radius_acct_port) : '(aguardando provisioner)'}
                  mono
                />
                <InfoRow
                  label="Porta CoA (NAS)"
                  value={String(tenant.radius_config?.coa_port ?? 3799)}
                  mono
                />
                {/* Duração da sessão removida do card RADIUS — vem de
                    session_duration_minutes do tenant (1 fonte de verdade).
                    O Provisioner converte minutos → segundos pro listener. */}
                <InfoRow
                  label="NAS permitidos"
                  value={
                    tenant.radius_config?.nas_ip_allowlist && tenant.radius_config.nas_ip_allowlist.length > 0
                      ? tenant.radius_config.nas_ip_allowlist.join(', ')
                      : '(qualquer origem — não recomendado)'
                  }
                  mono
                />
                {radiusStatus?.enabled && (
                  <InfoRow
                    label="Sessões ativas (accounting)"
                    value={String(radiusStatus.active_sessions)}
                    mono
                  />
                )}
              </div>
            </div>
          )}

          {tenant.auth_mode === 'radius' && (
            <TenantFirewallHelp
              vpsHost={typeof window !== 'undefined' ? window.location.hostname : undefined}
              radiusAuthPort={tenant.radius_auth_port ?? undefined}
              radiusAcctPort={tenant.radius_acct_port ?? undefined}
              coaPort={tenant.radius_config?.coa_port}
            />
          )}
        </div>

        {/* Serials + VPN card */}
        <div className="space-y-6">
          <div className="glass-card rounded-xl">
            <div className="border-b border-t-default px-6 py-4">
              <h2 className="text-sm font-semibold text-t-secondary">Seriais</h2>
            </div>
            <div className="px-6 py-4">
              {tenant.serials.length === 0 ? (
                <p className="text-sm text-t-label">Nenhum serial cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {tenant.serials.map((serial) => (
                    <div key={serial.id} className="flex items-center justify-between rounded-lg border border-t-default bg-t-hover-subtle px-4 py-3">
                      <span className="text-sm font-mono text-t-secondary">{serial.serial}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        serial.role === 'primary'
                          ? 'bg-edge-cyan/10 text-edge-cyan border border-edge-cyan/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {serial.role === 'primary' ? 'Primario' : 'Secundario'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card VPN WireGuard — só exibe quando vpn_enabled */}
          {vpnEnabled && vpnStatus && (
            <div className="glass-card rounded-xl">
              <div className="border-b border-t-default px-6 py-4">
                <h2 className="text-sm font-semibold text-t-secondary">VPN WireGuard</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                <VpnStatusBadge
                  status={vpnStatus.vpn_status}
                  lastHandshakeSecondsAgo={vpnStatus.last_handshake_seconds_ago}
                />
                {vpnStatus.vpn_peer_ip && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-t-label">Peer IP</span>
                    <span className="font-mono text-t-secondary">{vpnStatus.vpn_peer_ip}</span>
                  </div>
                )}
                {vpnStatus.last_handshake_seconds_ago !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-t-label">Last hand.</span>
                    <span className="text-t-secondary">
                      há {vpnStatus.last_handshake_seconds_ago < 60
                        ? `${vpnStatus.last_handshake_seconds_ago}s`
                        : `${Math.floor(vpnStatus.last_handshake_seconds_ago / 60)}min`}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-1 text-xs text-edge-cyan hover:underline"
                >
                  Ver detalhes →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {modalOpen && (
        <TenantModal
          tenant={tenant}
          onClose={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-t-overlay backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-t-input bg-t-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-t-primary">Confirmar exclusao</h3>
            <p className="mt-2 text-sm text-t-muted">
              Tem certeza que deseja deletar o tenant <strong className="text-t-primary">{tenant.name}</strong>?
              Esta acao nao pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <span className="text-[11px] font-medium uppercase tracking-wider text-t-label">{label}</span>
      <span className={`text-sm text-t-secondary text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
