'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WifiSession, Tenant, Pagination } from '@captive-portal/shared'
import { getSessions, getTenants, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import { SkeletonTableRows } from '../../../components/skeleton'
import { ExportModal } from '../../../components/export-modal'

export default function SessionsPage() {
  const { hasRole } = useAuth()
  const isSuperadmin = hasRole('superadmin')

  const [sessions, setSessions] = useState<WifiSession[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [tenantId, setTenantId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [phone, setPhone] = useState('')
  const [appliedPhone, setAppliedPhone] = useState('')
  const [page, setPage] = useState(1)
  const [showExport, setShowExport] = useState(false)

  const fetchTenants = useCallback(async () => {
    if (!isSuperadmin) return
    try {
      const res = await getTenants({ limit: 100 })
      setTenants(res.data)
    } catch {
      // silent
    }
  }, [isSuperadmin])

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number> = { page, limit: 50 }
      if (tenantId) params.tenant_id = tenantId
      if (from) params.from = from
      if (to) params.to = to
      if (appliedPhone) params.phone = appliedPhone
      const res = await getSessions(params as Parameters<typeof getSessions>[0])
      setSessions(res.data)
      setPagination(res.pagination)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar sessoes.')
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId, from, to, appliedPhone, page])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t-primary">Sessões Wi-Fi</h1>
          <p className="mt-1 text-sm text-t-label">
            Histórico de autenticações no portal captivo.
          </p>
        </div>
        {sessions.length > 0 && (
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
        {isSuperadmin && (
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setPage(1) }}
              className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            >
              <option value="">Todos</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
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
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Telefone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedPhone(phone); setPage(1) } }}
            className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary placeholder:text-t-placeholder focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            placeholder="Digite so numeros (ex: 11999994321)"
          />
        </div>
        <button
          onClick={() => { setAppliedPhone(phone); setPage(1) }}
          className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 transition-colors"
        >
          Filtrar
        </button>
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
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Telefone</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">MAC</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">IP</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Tenant</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Autenticado em</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Expira em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-t-default">
            {loading ? (
              <SkeletonTableRows columns={6} rows={8} />
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-t-label">
                  Nenhuma sessao encontrada.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-t-hover-subtle transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-t-secondary font-mono">{s.phone_masked}</td>
                  <td className="px-6 py-4 text-sm text-t-muted font-mono">{s.mac_address}</td>
                  <td className="px-6 py-4 text-sm text-t-muted font-mono">{s.ip_address}</td>
                  <td className="px-6 py-4 text-sm text-t-muted">{s.tenant.name}</td>
                  <td className="px-6 py-4 text-sm text-t-muted">{formatDate(s.auth_at)}</td>
                  <td className="px-6 py-4 text-sm text-t-muted">{formatDate(s.expires_at)}</td>
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
          title="Relatório de Sessões Wi-Fi"
          subtitle={from || to ? `Período: ${from || '...'} a ${to || '...'}` : undefined}
          filenamePrefix="sessoes_wifi"
          metrics={[
            { label: 'Total de sessoes', value: String(pagination.total) },
            { label: 'Página atual', value: `${sessions.length} registros` },
            ...(from ? [{ label: 'Data inicio', value: from }] : []),
            ...(to ? [{ label: 'Data fim', value: to }] : []),
          ]}
          columns={[
            { key: 'phone_masked', label: 'Telefone', enabled: true },
            { key: 'mac_address', label: 'MAC', enabled: true },
            { key: 'ip_address', label: 'IP', enabled: true },
            { key: 'tenant_name', label: 'Tenant', enabled: true },
            { key: 'auth_at', label: 'Autenticado em', enabled: true },
            { key: 'expires_at', label: 'Expira em', enabled: true },
          ]}
          data={sessions.map((s) => ({
            phone_masked: s.phone_masked,
            mac_address: s.mac_address,
            ip_address: s.ip_address,
            tenant_name: s.tenant.name,
            auth_at: formatDate(s.auth_at),
            expires_at: formatDate(s.expires_at),
          }))}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
