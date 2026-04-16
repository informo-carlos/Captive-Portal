'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useTheme } from '../lib/theme-context'

interface SessionsChartProps {
  data: { date: string; sessions: number }[]
}

function formatDateLabel(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${day}/${month}`
}

export function SessionsChart({ data }: SessionsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }))

  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'
  const axisColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)'
  const tickColor = isDark ? '#475569' : '#94a3b8'
  const tooltipBg = isDark ? '#0d1219' : '#ffffff'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const tooltipText = isDark ? '#e2e8f0' : '#334155'

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="sessionsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e5c3" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00e5c3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="label"
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
            labelFormatter={(_, payload) => {
              if (payload?.[0]?.payload?.date) return payload[0].payload.date
              return ''
            }}
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessões']}
            contentStyle={{
              borderRadius: '8px',
              border: `1px solid ${tooltipBorder}`,
              backgroundColor: tooltipBg,
              color: tooltipText,
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke="#00e5c3"
            strokeWidth={2}
            fill="url(#sessionsGradient)"
            dot={{ r: 3, fill: '#00e5c3', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#00e5c3', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
