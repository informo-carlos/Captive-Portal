'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReportSummary, Tenant } from '@captive-portal/shared'
import { getReportSummary, getTenants, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import { SessionsChart } from '../../../components/sessions-chart'

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function startOfMonth(): string {
  const d = new Date()
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}

export default function DashboardPage() {
  const { hasRole } = useAuth()
  const isSuperadmin = hasRole('superadmin')

  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tenantId, setTenantId] = useState('')
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(() => formatDate(new Date()))

  const fetchTenants = useCallback(async () => {
    if (!isSuperadmin) return
    try {
      const res = await getTenants({ limit: 100 })
      setTenants(res.data)
    } catch {
      // silently fail — tenant filter is optional
    }
  }, [isSuperadmin])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { tenant_id?: string; from?: string; to?: string } = {}
      if (tenantId) params.tenant_id = tenantId
      if (from) params.from = from
      if (to) params.to = to
      const data = await getReportSummary(params)
      setSummary(data)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar relatório.')
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId, from, to])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const cards = summary
    ? [
        { label: 'Total de sessoes', value: summary.totals.sessions.toLocaleString('pt-BR'), icon: 'sessions' },
        { label: 'Usuarios unicos', value: summary.totals.unique_phones.toLocaleString('pt-BR'), icon: 'users' },
        { label: 'Tentativas', value: summary.totals.auth_attempts.toLocaleString('pt-BR'), icon: 'attempts' },
        { label: 'Taxa de sucesso', value: `${summary.totals.success_rate.toFixed(1)}%`, icon: 'rate' },
      ]
    : []

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-t-primary">System Overview</h1>
        <p className="mt-1 text-sm text-t-label">
          Telemetria e metricas de autenticacao Wi-Fi.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Ate</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
          />
        </div>
        {isSuperadmin && (
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            >
              <option value="">Todos</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
        </div>
      ) : summary ? (
        <>
          {/* Metric Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="glass-card rounded-xl p-5"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-t-label">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-t-primary">{card.value}</p>
                <div className="mt-3 h-px bg-gradient-to-r from-edge-cyan/30 to-transparent" />
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-t-muted">
              Sessoes por dia
            </h2>
            {summary.by_day.length > 0 ? (
              <SessionsChart data={summary.by_day} />
            ) : (
              <p className="py-8 text-center text-sm text-t-label">
                Nenhum dado para o periodo selecionado.
              </p>
            )}
          </div>

          {/* By Tenant Table (superadmin) */}
          {isSuperadmin && summary.by_tenant.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl glass-card">
              <div className="px-6 py-4 border-b border-t-default">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                  Por tenant
                </h2>
              </div>
              <table className="min-w-full divide-y divide-t-default">
                <thead className="bg-t-thead">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Tenant</th>
                    <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-t-label">Sessoes</th>
                    <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-t-label">Usuarios unicos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-t-default">
                  {summary.by_tenant.map((t) => (
                    <tr key={t.tenant_id} className="hover:bg-t-hover-subtle transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-t-secondary">{t.tenant_name}</td>
                      <td className="px-6 py-3 text-right text-sm text-t-muted">{t.sessions.toLocaleString('pt-BR')}</td>
                      <td className="px-6 py-3 text-right text-sm text-t-muted">{t.unique_phones.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
