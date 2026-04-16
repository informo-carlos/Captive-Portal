'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useTheme } from '../../lib/theme-context'
import type { ReportSummary } from '@captive-portal/shared'
import type { WidgetConfig, MetricSource } from '../../lib/dashboard-builder-types'
import { CHART_COLORS } from '../../lib/dashboard-builder-types'

interface WidgetRendererProps {
  config: WidgetConfig
  data: ReportSummary | null
  isEditing?: boolean
}

function useChartColors() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  return {
    gridColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    axisColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)',
    tickColor: isDark ? '#475569' : '#94a3b8',
    tooltipBg: isDark ? '#0d1219' : '#ffffff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    tooltipText: isDark ? '#e2e8f0' : '#334155',
    emptyBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
  }
}

function getMetricValue(source: MetricSource, data: ReportSummary): string {
  switch (source) {
    case 'total_sessions':
      return data.totals.sessions.toLocaleString('pt-BR')
    case 'unique_phones':
      return data.totals.unique_phones.toLocaleString('pt-BR')
    case 'auth_attempts':
      return data.totals.auth_attempts.toLocaleString('pt-BR')
    case 'success_rate':
      return `${data.totals.success_rate.toFixed(1)}%`
  }
}

function getMetricIcon(source: MetricSource) {
  switch (source) {
    case 'total_sessions':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
        </svg>
      )
    case 'unique_phones':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      )
    case 'auth_attempts':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      )
    case 'success_rate':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      )
  }
}

// ─── Metric Card ───────────────────────────────────────

function MetricCardWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const color = config.color || CHART_COLORS[0]

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-t-label text-sm">
        Sem dados
      </div>
    )
  }

  const source = config.metricSource || 'total_sessions'
  const value = getMetricValue(source, data)

  return (
    <div className="flex h-full flex-col justify-between p-1">
      <div className="flex items-center gap-2">
        <div className="rounded-lg p-2" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{getMetricIcon(source)}</div>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-t-label">{config.title}</p>
      </div>
      <div>
        <p className="text-3xl font-bold text-t-primary">{value}</p>
        <div className="mt-2 h-px" style={{ background: `linear-gradient(to right, ${color}4D, transparent)` }} />
      </div>
    </div>
  )
}

// ─── Area Chart ────────────────────────────────────────

function AreaChartWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const colors = useChartColors()
  const color = config.color || CHART_COLORS[0]

  if (!data || data.by_day.length === 0) {
    return <EmptyState />
  }

  const chartData = data.by_day.map((d) => {
    const [, m, day] = d.date.split('-')
    return { ...d, label: `${day}/${m}` }
  })

  const gradientId = `gradient_${config.id}`

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
            contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg, color: colors.tooltipText, fontSize: '11px' }}
          />
          <Area type="monotone" dataKey="sessions" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={{ r: 2, fill: color, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Line Chart ────────────────────────────────────────

function LineChartWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const colors = useChartColors()
  const color = config.color || CHART_COLORS[0]

  if (!data || data.by_day.length === 0) {
    return <EmptyState />
  }

  const chartData = data.by_day.map((d) => {
    const [, m, day] = d.date.split('-')
    return { ...d, label: `${day}/${m}` }
  })

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
            contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg, color: colors.tooltipText, fontSize: '11px' }}
          />
          <Line type="monotone" dataKey="sessions" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5, fill: color }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Bar Chart ─────────────────────────────────────────

function BarChartWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const colors = useChartColors()

  const source = config.dataSource || 'sessions_by_tenant'

  if (source === 'sessions_by_tenant') {
    if (!data || data.by_tenant.length === 0) return <EmptyState />
    const chartData = data.by_tenant.map((t) => ({
      name: t.tenant_name.length > 12 ? t.tenant_name.slice(0, 12) + '...' : t.tenant_name,
      fullName: t.tenant_name,
      sessions: t.sessions,
    }))
    return (
      <div className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
              contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg, color: colors.tooltipText, fontSize: '11px' }}
            />
            <Bar dataKey="sessions" radius={[4, 4, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // sessions_by_day as bar
  if (!data || data.by_day.length === 0) return <EmptyState />
  const color = config.color || CHART_COLORS[0]
  const chartData = data.by_day.map((d) => {
    const [, m, day] = d.date.split('-')
    return { ...d, label: `${day}/${m}` }
  })
  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: colors.tickColor }} axisLine={{ stroke: colors.axisColor }} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
            contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg, color: colors.tooltipText, fontSize: '11px' }}
          />
          <Bar dataKey="sessions" radius={[4, 4, 0, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Pie Chart ─────────────────────────────────────────

function PieChartWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const colors = useChartColors()

  if (!data) return <EmptyState />

  const source = config.dataSource || 'success_vs_failure'

  if (source === 'success_vs_failure') {
    const failures = Math.max(0, data.totals.auth_attempts - data.totals.sessions)
    const pieData = [
      { name: 'Sucesso', value: data.totals.sessions },
      { name: 'Falha', value: failures },
    ]
    const pieColors = [config.color || CHART_COLORS[0], colors.emptyBg]

    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="relative" style={{ width: '70%', maxWidth: 180, aspectRatio: '1/1' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={pieColors[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-t-primary">{data.totals.success_rate.toFixed(1)}%</span>
            <span className="text-[9px] uppercase tracking-wider text-t-label">sucesso</span>
          </div>
        </div>
        {config.showLegend !== false && (
          <div className="mt-2 flex gap-4 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pieColors[0] }} />
              <span className="text-t-muted">{data.totals.sessions.toLocaleString('pt-BR')} ok</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgba(128,128,128,0.3)' }} />
              <span className="text-t-muted">{failures.toLocaleString('pt-BR')} falha</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // sessions_by_tenant pie
  if (data.by_tenant.length === 0) return <EmptyState />
  const pieData = data.by_tenant.map((t) => ({ name: t.tenant_name, value: t.sessions }))

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div style={{ width: '80%', maxWidth: 200, aspectRatio: '1/1' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius="80%" dataKey="value" stroke="none" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
              contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg, color: colors.tooltipText, fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Table Widget ──────────────────────────────────────

function TableWidget({ config, data }: { config: WidgetConfig; data: ReportSummary | null }) {
  const source = config.dataSource || 'sessions_by_tenant'

  if (source === 'sessions_by_tenant') {
    if (!data || data.by_tenant.length === 0) return <EmptyState />
    return (
      <div className="h-full overflow-auto">
        <table className="min-w-full divide-y divide-t-default text-sm">
          <thead className="bg-t-thead sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-t-label">Tenant</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-t-label">Sessões</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-t-label">Usuários</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-t-default">
            {data.by_tenant.map((t) => (
              <tr key={t.tenant_id} className="hover:bg-t-hover-subtle transition-colors">
                <td className="px-3 py-2 font-medium text-t-secondary">{t.tenant_name}</td>
                <td className="px-3 py-2 text-right text-t-muted">{t.sessions.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-right text-t-muted">{t.unique_phones.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // sessions_by_day table
  if (!data || data.by_day.length === 0) return <EmptyState />
  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-t-default text-sm">
        <thead className="bg-t-thead sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-t-label">Data</th>
            <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-t-label">Sessões</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-t-default">
          {data.by_day.map((d) => (
            <tr key={d.date} className="hover:bg-t-hover-subtle transition-colors">
              <td className="px-3 py-2 font-medium text-t-secondary">{new Date(d.date).toLocaleDateString('pt-BR')}</td>
              <td className="px-3 py-2 text-right text-t-muted">{d.sessions.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-t-label">
      <svg className="mb-2 h-8 w-8 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
      <p className="text-xs">Sem dados para exibir</p>
    </div>
  )
}

// ─── Main Renderer ─────────────────────────────────────

export function WidgetRenderer({ config, data }: WidgetRendererProps) {
  switch (config.type) {
    case 'metric-card':
      return <MetricCardWidget config={config} data={data} />
    case 'area-chart':
      return <AreaChartWidget config={config} data={data} />
    case 'bar-chart':
      return <BarChartWidget config={config} data={data} />
    case 'pie-chart':
      return <PieChartWidget config={config} data={data} />
    case 'line-chart':
      return <LineChartWidget config={config} data={data} />
    case 'table':
      return <TableWidget config={config} data={data} />
    default:
      return <EmptyState />
  }
}
