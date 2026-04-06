'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TenantDetail } from '@captive-portal/shared'
import { getTenant, updateTenantStatus, deleteTenant } from '../../../../lib/api'
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (error && !tenant) {
    return (
      <div className="space-y-4">
        <Link href="/tenants" className="text-sm text-blue-600 hover:underline">&larr; Voltar para tenants</Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  if (!tenant) return null

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-yellow-100 text-yellow-800',
      deleted: 'bg-red-100 text-red-800',
    }
    const labels: Record<string, string> = {
      active: 'Ativo',
      inactive: 'Inativo',
      deleted: 'Deletado',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div>
      {/* Breadcrumb + Actions */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/tenants" className="text-sm text-blue-600 hover:underline">&larr; Voltar para tenants</Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
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
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {togglingStatus ? '...' : tenant.status === 'active' ? 'Desativar' : 'Ativar'}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stats Cards */}
        <div className="lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total de sessões</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{tenant.stats.total_sessions.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Sessões últimos 30 dias</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{tenant.stats.sessions_last_30d.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Última autenticação</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {tenant.stats.last_auth_at
                ? new Date(tenant.stats.last_auth_at).toLocaleString('pt-BR')
                : 'Nenhuma'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Informações gerais</h2>
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
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Configuração SonicWall</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              {tenant.sonicwall_config ? (
                <>
                  <InfoRow label="Host" value={tenant.sonicwall_config.host} mono />
                  <InfoRow label="Porta" value={String(tenant.sonicwall_config.port || 443)} mono />
                  <InfoRow label="Usuário" value={tenant.sonicwall_config.user} />
                  <InfoRow label="Firmware" value={`Gen ${tenant.sonicwall_config.firmware || '?'}`} />
                  <InfoRow label="Modo" value={tenant.sonicwall_config.mode === 'lhm' ? 'LHM' : 'REST API'} />
                  {tenant.sonicwall_config.mode === 'lhm' && (
                    <>
                      <InfoRow label="Porta LHM" value={String(tenant.sonicwall_config.lhm_port || 4043)} mono />
                      <InfoRow label="Guest user" value={tenant.sonicwall_config.guest_service_user || '-'} />
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Nenhuma configuração disponível.</p>
              )}
            </div>
          </div>
        </div>

        {/* Serials */}
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Seriais</h2>
            </div>
            <div className="px-6 py-4">
              {tenant.serials.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum serial cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {tenant.serials.map((serial) => (
                    <div key={serial.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-mono text-gray-900">{serial.serial}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        serial.role === 'primary'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {serial.role === 'primary' ? 'Primário' : 'Secundário'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-gray-600">
              Tem certeza que deseja deletar o tenant <strong>{tenant.name}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
