'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Tenant } from '@captive-portal/shared'
import type { Pagination } from '@captive-portal/shared'
import { getTenants, updateTenantStatus, deleteTenant } from '../../../lib/api'
import { ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import { TenantModal } from '../../../components/tenant-modal'

type StatusFilter = '' | 'active' | 'inactive'

export default function TenantsPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const canDelete = hasRole('superadmin')

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Status toggle
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)

  const fetchTenants = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await getTenants({
        status: statusFilter || undefined,
        page,
        limit: 20,
      })
      setTenants(res.data)
      setPagination(res.pagination)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar tenants.')
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchTenants(1)
  }, [fetchTenants])

  const handleToggleStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === 'active' ? 'inactive' : 'active'
    setTogglingStatus(tenant.id)
    try {
      await updateTenantStatus(tenant.id, newStatus)
      await fetchTenants(pagination.page)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      }
    } finally {
      setTogglingStatus(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTenant(deleteTarget.id)
      setDeleteTarget(null)
      await fetchTenants(pagination.page)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setModalOpen(true)
  }

  const handleCreate = () => {
    setEditingTenant(null)
    setModalOpen(true)
  }

  const handleModalSuccess = () => {
    setModalOpen(false)
    setEditingTenant(null)
    fetchTenants(pagination.page)
  }

  // Auto-refresh enquanto algum tenant estiver provisionando — dá feedback
  // em tempo real pro admin sem precisar recarregar a página.
  useEffect(() => {
    const anyProvisioning = tenants.some((t) => t.status === 'provisioning')
    if (!anyProvisioning) return
    const handle = setInterval(() => fetchTenants(pagination.page), 3000)
    return () => clearInterval(handle)
  }, [tenants, pagination.page, fetchTenants])

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
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium ${colors[status] || 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants Ecosystem</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie os clientes do captive portal.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleCreate}
            className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-[#0a0e17] hover:bg-edge-cyan/90 transition-colors"
          >
            + Add New Tenant
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
        >
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl glass-card">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="bg-white/[0.02]">
            <tr>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Nome</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Porta</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Seriais</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Criado em</th>
              {canEdit && (
                <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-slate-500">Acoes</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
                    <span className="ml-2 text-sm text-slate-500">Carregando...</span>
                  </div>
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center text-sm text-slate-500">
                  Nenhum tenant encontrado.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-200">
                    <Link href={`/tenants/${tenant.id}`} className="hover:text-edge-cyan transition-colors">
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                    {tenant.port}
                  </td>
                  <td className="px-6 py-4">
                    {statusBadge(tenant.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {tenant.serials.length}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          disabled={togglingStatus === tenant.id}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            tenant.status === 'active'
                              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                              : 'bg-edge-cyan/10 text-edge-cyan hover:bg-edge-cyan/20'
                          } disabled:opacity-50`}
                          title={tenant.status === 'active' ? 'Desativar' : 'Ativar'}
                        >
                          {togglingStatus === tenant.id
                            ? '...'
                            : tenant.status === 'active'
                              ? 'Desativar'
                              : 'Ativar'}
                        </button>
                        <button
                          onClick={() => handleEdit(tenant)}
                          className="rounded-md bg-edge-cyan/10 px-2.5 py-1 text-[11px] font-medium text-edge-cyan hover:bg-edge-cyan/20 transition-colors"
                        >
                          Editar
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(tenant)}
                            className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            Deletar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-3">
            <p className="text-xs text-slate-500">
              Mostrando {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchTenants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-md border border-white/[0.08] px-3 py-1 text-xs text-slate-400 hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => fetchTenants(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="rounded-md border border-white/[0.08] px-3 py-1 text-xs text-slate-400 hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tenant Modal */}
      {modalOpen && (
        <TenantModal
          tenant={editingTenant}
          onClose={() => { setModalOpen(false); setEditingTenant(null) }}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0d1219] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Confirmar exclusao</h3>
            <p className="mt-2 text-sm text-slate-400">
              Tem certeza que deseja deletar o tenant <strong className="text-white">{deleteTarget.name}</strong>?
              Esta acao nao pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.04]"
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
