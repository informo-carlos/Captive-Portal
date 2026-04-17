'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReportSummary, Tenant } from '@captive-portal/shared'
import { getReportSummary, getTenants, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import { SessionsChart } from '../../../components/sessions-chart'
import { SuccessRateChart } from '../../../components/success-rate-chart'
import { TenantDistributionChart } from '../../../components/tenant-distribution-chart'
import { SkeletonCard, SkeletonChart, SkeletonTableRows } from '../../../components/skeleton'
import { ExportModal } from '../../../components/export-modal'

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
  const [showExport, setShowExport] = useState(false)

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
        { label: 'Usuários únicos', value: summary.totals.unique_phones.toLocaleString('pt-BR'), icon: 'users' },
        { label: 'Tentativas', value: summary.totals.auth_attempts.toLocaleString('pt-BR'), icon: 'attempts' },
        { label: 'Taxa de sucesso', value: `${summary.totals.success_rate.toFixed(1)}%`, icon: 'rate' },
      ]
    : []

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t-primary">System Overview</h1>
          <p className="mt-1 text-sm text-t-label">
            Telemetria e métricas de autenticação Wi-Fi.
          </p>
        </div>
        {summary && (
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-secondary hover:bg-t-hover transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar relatorio
          </button>
        )}
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
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><SkeletonChart /></div>
            <SkeletonChart />
          </div>
          {isSuperadmin && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SkeletonChart />
              <div className="overflow-hidden rounded-xl glass-card">
                <div className="px-6 py-4 border-b border-t-default">
                  <div className="h-3 w-20 animate-pulse rounded bg-t-hover" />
                </div>
                <table className="min-w-full divide-y divide-t-default">
                  <tbody><SkeletonTableRows columns={3} rows={3} /></tbody>
                </table>
              </div>
            </div>
          )}
        </>
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

          {/* Charts Row — Sessions trend + Success Rate */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="glass-card rounded-xl p-6 lg:col-span-2">
              <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                Sessões por dia
              </h2>
              {summary.by_day.length > 0 ? (
                <SessionsChart data={summary.by_day} />
              ) : (
                <p className="py-8 text-center text-sm text-t-label">
                  Nenhum dado para o periodo selecionado.
                </p>
              )}
            </div>
            <div className="glass-card rounded-xl p-6">
              <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                Taxa de sucesso
              </h2>
              <SuccessRateChart
                successRate={summary.totals.success_rate}
                totalAttempts={summary.totals.auth_attempts}
                totalSessions={summary.totals.sessions}
              />
            </div>
          </div>

          {/* Tenant Distribution Chart + Table (superadmin) */}
          {isSuperadmin && summary.by_tenant.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="glass-card rounded-xl p-6">
                <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                  Sessões por tenant
                </h2>
                <TenantDistributionChart data={summary.by_tenant} />
              </div>
              <div className="overflow-hidden rounded-xl glass-card">
                <div className="px-6 py-4 border-b border-t-default">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                    Detalhes por tenant
                  </h2>
                </div>
                <table className="min-w-full divide-y divide-t-default">
                  <thead className="bg-t-thead">
                    <tr>
                      <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Tenant</th>
                      <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-t-label">Sessões</th>
                      <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-t-label">Usuários únicos</th>
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
            </div>
          )}
        </>
      ) : null}

      {/* Export Modal */}
      {showExport && summary && (
        <ExportModal
          title="Relatório System Overview"
          subtitle={`Período: ${from || '...'} a ${to || '...'}`}
          filenamePrefix="relatorio_overview"
          metrics={[
            { label: 'Total de sessoes', value: summary.totals.sessions.toLocaleString('pt-BR') },
            { label: 'Usuários únicos', value: summary.totals.unique_phones.toLocaleString('pt-BR') },
            { label: 'Tentativas', value: summary.totals.auth_attempts.toLocaleString('pt-BR') },
            { label: 'Taxa de sucesso', value: `${summary.totals.success_rate.toFixed(1)}%` },
          ]}
          chartData={{
            areaChart: summary.by_day.length > 0 ? {
              labels: summary.by_day.map((d) => {
                const [, m, day] = d.date.split('-')
                return `${day}/${m}`
              }),
              series: { label: 'Sessões', values: summary.by_day.map((d) => d.sessions) },
            } : undefined,
            donutChart: {
              successRate: summary.totals.success_rate,
              totalSessions: summary.totals.sessions,
              totalFailures: Math.max(0, summary.totals.auth_attempts - summary.totals.sessions),
            },
            barChart: isSuperadmin && summary.by_tenant.length > 0 ? {
              labels: summary.by_tenant.map((t) => t.tenant_name),
              values: summary.by_tenant.map((t) => t.sessions),
            } : undefined,
          }}
          columns={
            isSuperadmin && summary.by_tenant.length > 0
              ? [
                  { key: 'tenant_name', label: 'Tenant', enabled: true },
                  { key: 'sessions', label: 'Sessões', enabled: true },
                  { key: 'unique_phones', label: 'Usuários únicos', enabled: true },
                ]
              : [
                  { key: 'date', label: 'Data', enabled: true },
                  { key: 'sessions', label: 'Sessões', enabled: true },
                ]
          }
          data={
            isSuperadmin && summary.by_tenant.length > 0
              ? summary.by_tenant.map((t) => ({
                  tenant_name: t.tenant_name,
                  sessions: t.sessions.toLocaleString('pt-BR'),
                  unique_phones: t.unique_phones.toLocaleString('pt-BR'),
                }))
              : summary.by_day.map((d) => ({
                  date: new Date(d.date).toLocaleDateString('pt-BR'),
                  sessions: d.sessions.toLocaleString('pt-BR'),
                }))
          }
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
