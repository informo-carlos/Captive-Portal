'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WifiSession, Tenant, Pagination } from '@captive-portal/shared'
import { getSessions, getTenants, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Sessoes Wi-Fi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Historico de autenticacoes no portal captivo.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        {isSuperadmin && (
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setPage(1) }}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            >
              <option value="">Todos</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Ate</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Telefone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedPhone(phone); setPage(1) } }}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            placeholder="Digite so numeros (ex: 11999994321)"
          />
        </div>
        <button
          onClick={() => { setAppliedPhone(phone); setPage(1) }}
          className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-[#0a0e17] hover:bg-edge-cyan/90 transition-colors"
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
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="bg-white/[0.02]">
            <tr>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Telefone</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">MAC</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">IP</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Tenant</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Autenticado em</th>
              <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">Expira em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
                    Carregando...
                  </div>
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                  Nenhuma sessao encontrada.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-200 font-mono">{s.phone_masked}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">{s.mac_address}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">{s.ip_address}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{s.tenant.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{formatDate(s.auth_at)}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{formatDate(s.expires_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Mostrando {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
            >
              Proxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
