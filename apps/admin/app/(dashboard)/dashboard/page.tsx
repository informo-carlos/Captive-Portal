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
  return formatDate(new Date(d.getFullYear(), d.getMonth(), 1))
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
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Resumo geral de autenticacoes Wi-Fi.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ate</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {isSuperadmin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="h-6 w-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : summary ? (
        <>
          {/* Metric Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-lg border p-5 ${cardColors[card.color]}`}
              >
                <p className="text-sm font-medium opacity-80">{card.label}</p>
                <p className="mt-1 text-3xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Sessoes por dia
            </h2>
            {summary.by_day.length > 0 ? (
              <SessionsChart data={summary.by_day} />
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">
                Nenhum dado para o periodo selecionado.
              </p>
            )}
          </div>

          {/* By Tenant Table (superadmin) */}
          {isSuperadmin && summary.by_tenant.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Por tenant
                </h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tenant</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Sessoes</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Usuarios unicos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {summary.by_tenant.map((t) => (
                    <tr key={t.tenant_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{t.tenant_name}</td>
                      <td className="px-6 py-3 text-right text-sm text-gray-500">{t.sessions.toLocaleString('pt-BR')}</td>
                      <td className="px-6 py-3 text-right text-sm text-gray-500">{t.unique_phones.toLocaleString('pt-BR')}</td>
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
