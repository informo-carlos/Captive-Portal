'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AuditLog, Pagination } from '@captive-portal/shared'
import { RequireRole } from '../../../components/require-role'
import { getAuditLogs, ApiRequestError } from '../../../lib/api'
import { SkeletonTableRows } from '../../../components/skeleton'
import { ExportModal } from '../../../components/export-modal'

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  login: { label: 'Login', className: 'bg-edge-cyan/10 text-edge-cyan border border-edge-cyan/20' },
  tenant_created: { label: 'Tenant criado', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  tenant_updated: { label: 'Tenant atualizado', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  tenant_deactivated: { label: 'Tenant desativado', className: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
  tenant_activated: { label: 'Tenant ativado', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  tenant_deleted: { label: 'Tenant deletado', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
  user_created: { label: 'Usuário criado', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  user_updated: { label: 'Usuário atualizado', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  user_deleted: { label: 'Usuário deletado', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
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
  const [showExport, setShowExport] = useState(false)

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
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium ${info.className}`}>
          {info.label}
        </span>
      )
    }
    return (
      <span className="inline-flex rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-500/20">
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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-t-primary">Audit Log</h1>
            <p className="mt-1 text-sm text-t-label">
              Registro de todas as ações administrativas.
            </p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-secondary hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Acao</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1) }}
              className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            >
              <option value="">Todas</option>
              <option value="login">Login</option>
              <option value="tenant_created">Tenant criado</option>
              <option value="tenant_updated">Tenant atualizado</option>
              <option value="tenant_deactivated">Tenant desativado</option>
              <option value="tenant_activated">Tenant ativado</option>
              <option value="tenant_deleted">Tenant deletado</option>
              <option value="user_created">Usuário criado</option>
              <option value="user_updated">Usuário atualizado</option>
              <option value="user_deleted">Usuário deletado</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Ate</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl glass-card">
          <table className="min-w-full divide-y divide-t-default">
            <thead className="bg-t-thead">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Data/Hora</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Usuário</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Acao</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Detalhes</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-default">
              {loading ? (
                <SkeletonTableRows columns={5} rows={8} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-t-label">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-t-hover-subtle transition-colors">
                    <td className="px-6 py-4 text-sm text-t-muted whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-t-secondary">{log.user.name}</div>
                      <div className="text-[10px] text-t-label">{log.user.email}</div>
                    </td>
                    <td className="px-6 py-4">{getActionBadge(log.action)}</td>
                    <td className="px-6 py-4 text-sm text-t-muted max-w-xs truncate" title={formatPayload(log.payload)}>
                      {formatPayload(log.payload)}
                    </td>
                    <td className="px-6 py-4 text-sm text-t-muted font-mono">{log.ip_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-t-label">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="rounded-md border border-t-input px-3 py-1.5 text-xs text-t-muted hover:bg-t-hover disabled:opacity-50 transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={pagination.page >= pagination.pages}
                className="rounded-md border border-t-input px-3 py-1.5 text-xs text-t-muted hover:bg-t-hover disabled:opacity-50 transition-colors"
              >
                Proxima
              </button>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExport && (
          <ExportModal
            title="Relatório de Audit Log"
            subtitle={from || to ? `Período: ${from || '...'} a ${to || '...'}` : undefined}
            filenamePrefix="audit_log"
            metrics={[
              { label: 'Total de registros', value: String(pagination.total) },
              { label: 'Página atual', value: `${logs.length} registros` },
              ...(action ? [{ label: 'Filtro de acao', value: ACTION_LABELS[action]?.label || action }] : []),
            ]}
            columns={[
              { key: 'created_at', label: 'Data/Hora', enabled: true },
              { key: 'user_name', label: 'Usuário', enabled: true },
              { key: 'user_email', label: 'Email', enabled: true },
              { key: 'action', label: 'Acao', enabled: true },
              { key: 'payload', label: 'Detalhes', enabled: true },
              { key: 'ip_address', label: 'IP', enabled: true },
            ]}
            data={logs.map((log) => ({
              created_at: formatDate(log.created_at),
              user_name: log.user.name,
              user_email: log.user.email,
              action: ACTION_LABELS[log.action]?.label || log.action,
              payload: formatPayload(log.payload),
              ip_address: log.ip_address,
            }))}
            onClose={() => setShowExport(false)}
          />
        )}
      </div>
    </RequireRole>
  )
}
