'use client'

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useTheme } from '../lib/theme-context'

interface SuccessRateChartProps {
  successRate: number
  totalAttempts: number
  totalSessions: number
}

export function SuccessRateChart({ successRate, totalAttempts, totalSessions }: SuccessRateChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const failures = totalAttempts - totalSessions
  const data = [
    { name: 'Sucesso', value: totalSessions },
    { name: 'Falha', value: failures > 0 ? failures : 0 },
  ]

  const COLORS = ['#00e5c3', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)']

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={75}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-t-primary">{successRate.toFixed(1)}%</span>
          <span className="text-[10px] uppercase tracking-wider text-t-label mt-0.5">sucesso</span>
        </div>
      </div>
      <div className="mt-4 flex gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-edge-cyan" />
          <span className="text-t-muted">{totalSessions.toLocaleString('pt-BR')} aprovadas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />
          <span className="text-t-muted">{(failures > 0 ? failures : 0).toLocaleString('pt-BR')} falharam</span>
        </div>
      </div>
    </div>
  )
}
