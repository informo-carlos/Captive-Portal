'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

interface SessionsChartProps {
  data: { date: string; sessions: number }[]
}

function formatDateLabel(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${day}/${month}`
}

export function SessionsChart({ data }: SessionsChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }))

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#475569' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#475569' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            allowDecimals={false}
          />
          <Tooltip
            labelFormatter={(_, payload) => {
              if (payload?.[0]?.payload?.date) return payload[0].payload.date
              return ''
            }}
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Sessoes']}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: '#0d1219',
              color: '#e2e8f0',
              fontSize: '12px',
            }}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            stroke="#00e5c3"
            strokeWidth={2}
            dot={{ r: 3, fill: '#00e5c3' }}
            activeDot={{ r: 5, fill: '#00e5c3' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
