'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { useTheme } from '../lib/theme-context'

interface TenantData {
  tenant_id: string
  tenant_name: string
  sessions: number
  unique_phones: number
}

interface TenantDistributionChartProps {
  data: TenantData[]
}

const BAR_COLORS = [
  '#00e5c3',
  '#06b6d4',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#10b981',
  '#6366f1',
]

export function TenantDistributionChart({ data }: TenantDistributionChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'
  const axisColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)'
  const tickColor = isDark ? '#475569' : '#94a3b8'
  const tooltipBg = isDark ? '#0d1219' : '#ffffff'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const tooltipText = isDark ? '#e2e8f0' : '#334155'

  const chartData = data.map((d) => ({
    ...d,
    name: d.tenant_name.length > 12 ? d.tenant_name.slice(0, 12) + '...' : d.tenant_name,
    fullName: d.tenant_name,
  }))

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="horizontal" barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value, name) => {
              const label = name === 'sessions' ? 'Sessoes' : 'Usuarios unicos'
              return [Number(value).toLocaleString('pt-BR'), label]
            }}
            labelFormatter={(_, payload) => {
              if (payload?.[0]?.payload?.fullName) return payload[0].payload.fullName
              return ''
            }}
            contentStyle={{
              borderRadius: '8px',
              border: `1px solid ${tooltipBorder}`,
              backgroundColor: tooltipBg,
              color: tooltipText,
              fontSize: '12px',
            }}
          />
          <Bar dataKey="sessions" radius={[4, 4, 0, 0]} name="sessions">
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
