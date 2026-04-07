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
        { label: 'Total de sessoes', value: summary.totals.sessions.toLocaleString('pt-BR'), color: 'blue' },
        { label: 'Usuarios unicos', value: summary.totals.unique_phones.toLocaleString('pt-BR'), color: 'green' },
        { label: 'Tentativas', value: summary.totals.auth_attempts.toLocaleString('pt-BR'), color: 'purple' },
        { label: 'Taxa de sucesso', value: `${summary.totals.success_rate.toFixed(1)}%`, color: 'amber' },
      ]
    : []

  const cardColors: Record<string, string> = {
    blue: 'border-[#007bbe]/30 bg-[#007bbe]/10 text-[#007bbe]',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Resumo geral de autenticacoes Wi-Fi.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#007bbe]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Ate</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#007bbe]"
          />
        </div>
        {isSuperadmin && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#007bbe]"
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
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#007bbe] border-t-transparent" />
        </div>
      ) : summary ? (
        <>
          {/* Metric Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-xl border p-5 ${cardColors[card.color]}`}
              >
                <p className="text-sm font-medium opacity-80">{card.label}</p>
                <p className="mt-1 text-3xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Sessoes por dia
            </h2>
            {summary.by_day.length > 0 ? (
              <SessionsChart data={summary.by_day} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                Nenhum dado para o periodo selecionado.
              </p>
            )}
          </div>

          {/* By Tenant Table (superadmin) */}
          {isSuperadmin && summary.by_tenant.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
              <div className="px-6 py-4 border-b border-white/5">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Por tenant
                </h2>
              </div>
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Tenant</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Sessoes</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Usuarios unicos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summary.by_tenant.map((t) => (
                    <tr key={t.tenant_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-slate-200">{t.tenant_name}</td>
                      <td className="px-6 py-3 text-right text-sm text-slate-400">{t.sessions.toLocaleString('pt-BR')}</td>
                      <td className="px-6 py-3 text-right text-sm text-slate-400">{t.unique_phones.toLocaleString('pt-BR')}</td>
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
