'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AuditLog, Pagination } from '@captive-portal/shared'
import { RequireRole } from '../../../components/require-role'
import { getAuditLogs, ApiRequestError } from '../../../lib/api'

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  login: { label: 'Login', className: 'bg-blue-100 text-blue-700' },
  tenant_created: { label: 'Tenant criado', className: 'bg-green-100 text-green-700' },
  tenant_updated: { label: 'Tenant atualizado', className: 'bg-amber-100 text-amber-700' },
  tenant_deactivated: { label: 'Tenant desativado', className: 'bg-yellow-100 text-yellow-700' },
  tenant_activated: { label: 'Tenant ativado', className: 'bg-green-100 text-green-700' },
  tenant_deleted: { label: 'Tenant deletado', className: 'bg-red-100 text-red-700' },
  user_created: { label: 'Usuario criado', className: 'bg-green-100 text-green-700' },
  user_updated: { label: 'Usuario atualizado', className: 'bg-amber-100 text-amber-700' },
  user_deleted: { label: 'Usuario deletado', className: 'bg-red-100 text-red-700' },
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number> = { page, limit: 50 }
      if (action) params.action = action
      if (from) params.from = from
      if (to) params.to = to
      const res = await getAuditLogs(params as Parameters<typeof getAuditLogs>[0])
      setLogs(res.data)
      setPagination(res.pagination)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar audit logs.')
      }
    } finally {
      setLoading(false)
    }
  }, [action, from, to, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getActionBadge = (actionKey: string) => {
    const info = ACTION_LABELS[actionKey]
    if (info) {
      return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${info.className}`}>
          {info.label}
        </span>
      )
    }
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
        {actionKey}
      </span>
    )
  }

  const formatPayload = (payload: Record<string, unknown>) => {
    const entries = Object.entries(payload)
    if (entries.length === 0) return '-'
    return entries
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ')
  }

  return (
    <RequireRole minRole="superadmin">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registro de todas as acoes administrativas.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Acao</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              <option value="login">Login</option>
              <option value="tenant_created">Tenant criado</option>
              <option value="tenant_updated">Tenant atualizado</option>
              <option value="tenant_deactivated">Tenant desativado</option>
              <option value="tenant_activated">Tenant ativado</option>
              <option value="tenant_deleted">Tenant deletado</option>
              <option value="user_created">Usuario criado</option>
              <option value="user_updated">Usuario atualizado</option>
              <option value="user_deleted">Usuario deletado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ate</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
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
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data/Hora</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Acao</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Detalhes</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{log.user.name}</div>
                      <div className="text-xs text-gray-400">{log.user.email}</div>
                    </td>
                    <td className="px-6 py-4">{getActionBadge(log.action)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={formatPayload(log.payload)}>
                      {formatPayload(log.payload)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{log.ip_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={pagination.page >= pagination.pages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  )
}
