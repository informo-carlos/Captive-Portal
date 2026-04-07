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
      provisioning: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      deleted: 'bg-red-100 text-red-800',
    }
    const labels: Record<string, string> = {
      provisioning: 'Provisionando...',
      active: 'Ativo',
      inactive: 'Inativo',
      failed: 'Falhou',
      deleted: 'Deletado',
    }
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status === 'provisioning' && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
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
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie os clientes do captive portal.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Novo cliente
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Porta</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Seriais</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Criado em</th>
              {canEdit && (
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                    <span className="ml-2 text-sm text-gray-500">Carregando...</span>
                  </div>
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center text-sm text-gray-500">
                  Nenhum tenant encontrado.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <Link href={`/tenants/${tenant.id}`} className="hover:text-blue-600 hover:underline">
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                    {tenant.port}
                  </td>
                  <td className="px-6 py-4">
                    {statusBadge(tenant.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {tenant.serials.length}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          disabled={togglingStatus === tenant.id}
                          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            tenant.status === 'active'
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
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
                          className="rounded bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 transition-colors"
                        >
                          Editar
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(tenant)}
                            className="rounded bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
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
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
            <p className="text-sm text-gray-500">
              Mostrando {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchTenants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => fetchTenants(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próxima
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-gray-600">
              Tem certeza que deseja deletar o tenant <strong>{deleteTarget.name}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
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
