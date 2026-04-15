import type { LayoutItem } from 'react-grid-layout'

// ─── Widget Types ──────────────────────────────────────

export type WidgetType =
  | 'metric-card'
  | 'area-chart'
  | 'bar-chart'
  | 'pie-chart'
  | 'table'
  | 'line-chart'

export type MetricSource =
  | 'total_sessions'
  | 'unique_phones'
  | 'auth_attempts'
  | 'success_rate'

export type ChartDataSource =
  | 'sessions_by_day'
  | 'sessions_by_tenant'
  | 'success_vs_failure'

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  // Metric card
  metricSource?: MetricSource
  // Chart
  dataSource?: ChartDataSource
  color?: string
  // Appearance
  showLegend?: boolean
}

export interface DashboardLayout {
  id: string
  name: string
  widgets: WidgetConfig[]
  gridLayout: LayoutItem[]
  createdAt: string
  updatedAt: string
}

// ─── Defaults & Options ────────────────────────────────

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  'metric-card': 'Card de Metrica',
  'area-chart': 'Grafico de Area',
  'bar-chart': 'Grafico de Barras',
  'pie-chart': 'Grafico de Pizza',
  'table': 'Tabela',
  'line-chart': 'Grafico de Linha',
}

export const METRIC_SOURCE_LABELS: Record<MetricSource, string> = {
  total_sessions: 'Total de Sessoes',
  unique_phones: 'Usuarios Unicos',
  auth_attempts: 'Tentativas de Auth',
  success_rate: 'Taxa de Sucesso',
}

export const CHART_DATA_SOURCE_LABELS: Record<ChartDataSource, string> = {
  sessions_by_day: 'Sessoes por Dia',
  sessions_by_tenant: 'Sessoes por Tenant',
  success_vs_failure: 'Sucesso vs Falha',
}

export const CHART_COLORS = [
  '#00e5c3',
  '#06b6d4',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#10b981',
  '#6366f1',
  '#f97316',
  '#14b8a6',
]

export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  'metric-card': { w: 3, h: 2, minW: 2, minH: 2 },
  'area-chart': { w: 6, h: 4, minW: 3, minH: 3 },
  'bar-chart': { w: 6, h: 4, minW: 3, minH: 3 },
  'pie-chart': { w: 4, h: 4, minW: 3, minH: 3 },
  'table': { w: 6, h: 4, minW: 4, minH: 3 },
  'line-chart': { w: 6, h: 4, minW: 3, minH: 3 },
}

// ─── Storage ───────────────────────────────────────────

const STORAGE_KEY = 'dashboard-builder-layouts'

export function saveLayouts(layouts: DashboardLayout[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

export function loadLayouts(): DashboardLayout[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as DashboardLayout[]
  } catch {
    return []
  }
}

export function generateWidgetId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function generateLayoutId(): string {
  return `layout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}
