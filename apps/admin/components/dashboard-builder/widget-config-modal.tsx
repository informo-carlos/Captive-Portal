'use client'

import { useState, useEffect } from 'react'
import type { WidgetConfig, WidgetType, MetricSource, ChartDataSource } from '../../lib/dashboard-builder-types'
import {
  WIDGET_TYPE_LABELS,
  METRIC_SOURCE_LABELS,
  CHART_DATA_SOURCE_LABELS,
  CHART_COLORS,
  generateWidgetId,
} from '../../lib/dashboard-builder-types'

interface WidgetConfigModalProps {
  open: boolean
  widget?: WidgetConfig | null
  onClose: () => void
  onSave: (config: WidgetConfig) => void
}

const WIDGET_TYPES = Object.entries(WIDGET_TYPE_LABELS) as [WidgetType, string][]
const METRIC_SOURCES = Object.entries(METRIC_SOURCE_LABELS) as [MetricSource, string][]
const DATA_SOURCES = Object.entries(CHART_DATA_SOURCE_LABELS) as [ChartDataSource, string][]

export function WidgetConfigModal({ open, widget, onClose, onSave }: WidgetConfigModalProps) {
  const isEditing = !!widget

  const [type, setType] = useState<WidgetType>('metric-card')
  const [title, setTitle] = useState('')
  const [metricSource, setMetricSource] = useState<MetricSource>('total_sessions')
  const [dataSource, setDataSource] = useState<ChartDataSource>('sessions_by_day')
  const [color, setColor] = useState(CHART_COLORS[0])
  const [showLegend, setShowLegend] = useState(true)

  useEffect(() => {
    if (widget) {
      setType(widget.type)
      setTitle(widget.title)
      setMetricSource(widget.metricSource || 'total_sessions')
      setDataSource(widget.dataSource || 'sessions_by_day')
      setColor(widget.color || CHART_COLORS[0])
      setShowLegend(widget.showLegend !== false)
    } else {
      setType('metric-card')
      setTitle('')
      setMetricSource('total_sessions')
      setDataSource('sessions_by_day')
      setColor(CHART_COLORS[0])
      setShowLegend(true)
    }
  }, [widget, open])

  if (!open) return null

  const needsMetricSource = type === 'metric-card'
  const needsDataSource = type !== 'metric-card'
  const needsColor = true
  const needsLegend = type === 'pie-chart'

  const handleSave = () => {
    const config: WidgetConfig = {
      id: widget?.id || generateWidgetId(),
      type,
      title: title || WIDGET_TYPE_LABELS[type],
      metricSource: needsMetricSource ? metricSource : undefined,
      dataSource: needsDataSource ? dataSource : undefined,
      color,
      showLegend: needsLegend ? showLegend : undefined,
    }
    onSave(config)
    onClose()
  }

  return (
    <div
      className="animate-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="animate-modal-content w-full max-w-lg rounded-2xl border border-t-input bg-t-bg2 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-t-default px-6 py-4">
          <h2 className="text-lg font-bold text-t-primary">
            {isEditing ? 'Editar Widget' : 'Adicionar Widget'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-t-muted hover:bg-t-hover hover:text-t-primary transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Widget Type */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
              Tipo de Widget
            </label>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TYPES.map(([wType, label]) => (
                <button
                  key={wType}
                  type="button"
                  onClick={() => {
                    setType(wType)
                    if (!title || Object.values(WIDGET_TYPE_LABELS).includes(title)) {
                      setTitle(label)
                    }
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                    type === wType
                      ? 'border-edge-cyan/40 bg-edge-cyan/10 text-edge-cyan'
                      : 'border-t-input bg-t-input text-t-muted hover:border-t-default hover:text-t-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
              Titulo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={WIDGET_TYPE_LABELS[type]}
              className="w-full rounded-lg border border-t-input bg-t-input px-3 py-2.5 text-sm text-t-primary placeholder-t-label focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            />
          </div>

          {/* Metric Source */}
          {needsMetricSource && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
                Metrica
              </label>
              <div className="grid grid-cols-2 gap-2">
                {METRIC_SOURCES.map(([src, label]) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setMetricSource(src)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      metricSource === src
                        ? 'border-edge-cyan/40 bg-edge-cyan/10 text-edge-cyan'
                        : 'border-t-input bg-t-input text-t-muted hover:border-t-default hover:text-t-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Data Source */}
          {needsDataSource && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
                Fonte de Dados
              </label>
              <div className="grid grid-cols-1 gap-2">
                {DATA_SOURCES.map(([src, label]) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setDataSource(src)}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-all text-left ${
                      dataSource === src
                        ? 'border-edge-cyan/40 bg-edge-cyan/10 text-edge-cyan'
                        : 'border-t-input bg-t-input text-t-muted hover:border-t-default hover:text-t-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color */}
          {needsColor && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
                Cor Principal
              </label>
              <div className="flex flex-wrap gap-2">
                {CHART_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-lg border-2 transition-all ${
                      color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Show Legend */}
          {needsLegend && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.target.checked)}
                className="h-4 w-4 rounded border-t-input accent-edge-cyan"
              />
              <span className="text-sm text-t-secondary">Exibir legenda</span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-t-default px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover hover:text-t-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-bold text-[#0a0e17] hover:shadow-lg hover:shadow-edge-cyan/20 transition-all"
          >
            {isEditing ? 'Salvar alteracoes' : 'Adicionar widget'}
          </button>
        </div>
      </div>
    </div>
  )
}
