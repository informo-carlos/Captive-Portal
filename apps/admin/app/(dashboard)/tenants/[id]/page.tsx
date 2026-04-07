'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TenantDetail } from '@captive-portal/shared'
import { getTenant, updateTenantStatus, deleteTenant, retryTenantProvisioning } from '../../../../lib/api'
import { ApiRequestError } from '../../../../lib/api'
import { useAuth } from '../../../../lib/auth-context'
import { TenantModal } from '../../../../components/tenant-modal'

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const canDelete = hasRole('superadmin')

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#007bbe] border-t-transparent" />
      </div>
    )
  }

  if (error && !tenant) {
    return (
      <div className="space-y-4">
        <Link href="/tenants" className="text-sm text-[#007bbe] hover:underline">&larr; Voltar para tenants</Link>
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      </div>
    )
  }

  if (!tenant) return null

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      provisioning: 'bg-blue-500/15 text-blue-400',
      active: 'bg-emerald-500/15 text-emerald-400',
      inactive: 'bg-amber-500/15 text-amber-400',
      failed: 'bg-red-500/15 text-red-400',
      deleted: 'bg-red-500/15 text-red-400',
    }
    const labels: Record<string, string> = {
      provisioning: 'Provisionando...',
      active: 'Ativo',
      inactive: 'Inativo',
      failed: 'Falhou',
      deleted: 'Deletado',
    }
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${colors[status] || 'bg-slate-500/15 text-slate-400'}`}>
        {status === 'provisioning' && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
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
          <Link href="/tenants" className="text-sm text-[#007bbe] hover:underline">&larr; Voltar para tenants</Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
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
                  ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                  : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              }`}
            >
              {togglingStatus ? '...' : tenant.status === 'active' ? 'Desativar' : 'Ativar'}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-[#007bbe] px-4 py-2 text-sm font-medium text-white hover:bg-[#0090e0] transition-colors"
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-400">Total de sessoes</p>
            <p className="mt-1 text-3xl font-bold text-white">{tenant.stats.total_sessions.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-400">Sessoes ultimos 30 dias</p>
            <p className="mt-1 text-3xl font-bold text-white">{tenant.stats.sessions_last_30d.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-400">Ultima autenticacao</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {tenant.stats.last_auth_at
                ? new Date(tenant.stats.last_auth_at).toLocaleString('pt-BR')
                : 'Nenhuma'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
            <div className="border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-200">Informacoes gerais</h2>
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

          {/* SonicWall Config */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
            <div className="border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-200">Configuracao SonicWall</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              {tenant.sonicwall_config ? (
                <>
                  <InfoRow label="Modo" value={tenant.sonicwall_config.mode === 'lhm' ? 'LHM (External Guest Auth)' : 'REST API'} />
                  {tenant.sonicwall_config.mode === 'rest' && (
                    <>
                      <InfoRow label="Host" value={tenant.sonicwall_config.host || '-'} mono />
                      <InfoRow label="Porta" value={String(tenant.sonicwall_config.port || 443)} mono />
                      <InfoRow label="Usuario" value={tenant.sonicwall_config.user || '-'} />
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
                <p className="text-sm text-slate-500">Nenhuma configuracao disponivel.</p>
              )}
            </div>
          </div>
        </div>

        {/* Serials */}
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
            <div className="border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-200">Seriais</h2>
            </div>
            <div className="px-6 py-4">
              {tenant.serials.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum serial cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {tenant.serials.map((serial) => (
                    <div key={serial.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                      <span className="text-sm font-mono text-slate-200">{serial.serial}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        serial.role === 'primary'
                          ? 'bg-[#007bbe]/15 text-[#007bbe]'
                          : 'bg-slate-500/15 text-slate-400'
                      }`}>
                        {serial.role === 'primary' ? 'Primario' : 'Secundario'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d1f35] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Confirmar exclusao</h3>
            <p className="mt-2 text-sm text-slate-400">
              Tem certeza que deseja deletar o tenant <strong className="text-white">{tenant.name}</strong>?
              Esta acao nao pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/5"
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
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-sm text-slate-200 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
