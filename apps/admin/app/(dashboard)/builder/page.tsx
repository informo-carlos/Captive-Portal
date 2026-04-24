'use client'

import { useState, useEffect, useCallback } from 'react'
import { GridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import type { ReportSummary, Tenant } from '@captive-portal/shared'
import { getReportSummary, getTenants, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import {
  type WidgetConfig,
  type DashboardLayout,
  DEFAULT_WIDGET_SIZES,
  saveLayouts,
  loadLayouts,
  generateLayoutId,
} from '../../../lib/dashboard-builder-types'
import { WidgetRenderer } from '../../../components/dashboard-builder/widget-renderer'
import { WidgetConfigModal } from '../../../components/dashboard-builder/widget-config-modal'
import { SkeletonCard } from '../../../components/skeleton'
import { ExportModal } from '../../../components/export-modal'

// GridLayout v2 needs a containerWidth — use the hook + a measured container

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function startOfMonth(): string {
  const d = new Date()
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}

export default function DashboardBuilderPage() {
  const { hasRole } = useAuth()
  const isSuperadmin = hasRole('superadmin')

  // ─── Data state ────────────────────────────────────────
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Filters ───────────────────────────────────────────
  const [tenantId, setTenantId] = useState('')
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(() => formatDate(new Date()))

  // ─── Builder state ─────────────────────────────────────
  const [layouts, setLayouts] = useState<DashboardLayout[]>([])
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showWidgetModal, setShowWidgetModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null)
  const [showLayoutNameModal, setShowLayoutNameModal] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [renamingLayout, setRenamingLayout] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const { containerRef: gridRef, width: containerWidth } = useContainerWidth()

  const activeLayout = layouts.find((l) => l.id === activeLayoutId) || null

  // ─── Load saved layouts ────────────────────────────────
  useEffect(() => {
    const saved = loadLayouts()
    if (saved.length > 0) {
      setLayouts(saved)
      setActiveLayoutId(saved[0].id)
    }
  }, [])

  // ─── Fetch data ────────────────────────────────────────
  const fetchTenants = useCallback(async () => {
    if (!isSuperadmin) return
    try {
      const res = await getTenants({ limit: 100 })
      setTenants(res.data)
    } catch { /* optional filter */ }
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
      if (err instanceof ApiRequestError) setError(err.message)
      else setError('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, from, to])

  useEffect(() => { fetchTenants() }, [fetchTenants])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  // ─── Layout operations ─────────────────────────────────

  const persistLayouts = useCallback((updated: DashboardLayout[]) => {
    setLayouts(updated)
    saveLayouts(updated)
  }, [])

  const createNewLayout = (name: string) => {
    const layout: DashboardLayout = {
      id: generateLayoutId(),
      name,
      widgets: [],
      gridLayout: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = [...layouts, layout]
    persistLayouts(updated)
    setActiveLayoutId(layout.id)
    setIsEditing(true)
  }

  const duplicateLayout = () => {
    if (!activeLayout) return
    const dup: DashboardLayout = {
      ...activeLayout,
      id: generateLayoutId(),
      name: `${activeLayout.name} (copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = [...layouts, dup]
    persistLayouts(updated)
    setActiveLayoutId(dup.id)
  }

  const deleteLayout = () => {
    if (!activeLayout) return
    const updated = layouts.filter((l) => l.id !== activeLayout.id)
    persistLayouts(updated)
    setActiveLayoutId(updated.length > 0 ? updated[0].id : null)
  }

  const renameLayout = (name: string) => {
    if (!activeLayout) return
    const updated = layouts.map((l) =>
      l.id === activeLayout.id ? { ...l, name, updatedAt: new Date().toISOString() } : l,
    )
    persistLayouts(updated)
  }

  const updateActiveLayout = useCallback(
    (fn: (layout: DashboardLayout) => DashboardLayout) => {
      if (!activeLayoutId) return
      setLayouts((prev) => {
        const updated = prev.map((l) =>
          l.id === activeLayoutId ? fn({ ...l, updatedAt: new Date().toISOString() }) : l,
        )
        saveLayouts(updated)
        return updated
      })
    },
    [activeLayoutId],
  )

  // ─── Widget operations ─────────────────────────────────

  const addWidget = (config: WidgetConfig) => {
    const size = DEFAULT_WIDGET_SIZES[config.type]
    const newLayoutItem: LayoutItem = {
      i: config.id,
      x: 0,
      y: Infinity, // places it at the bottom
      ...size,
    }
    updateActiveLayout((l) => ({
      ...l,
      widgets: [...l.widgets, config],
      gridLayout: [...l.gridLayout, newLayoutItem],
    }))
  }

  const updateWidget = (config: WidgetConfig) => {
    updateActiveLayout((l) => ({
      ...l,
      widgets: l.widgets.map((w) => (w.id === config.id ? config : w)),
    }))
  }

  const removeWidget = (widgetId: string) => {
    updateActiveLayout((l) => ({
      ...l,
      widgets: l.widgets.filter((w) => w.id !== widgetId),
      gridLayout: l.gridLayout.filter((g) => g.i !== widgetId),
    }))
  }

  const onGridLayoutChange = (newLayout: Layout) => {
    updateActiveLayout((l) => ({ ...l, gridLayout: [...newLayout] }))
  }

  // ─── Render ────────────────────────────────────────────

  const hasLayouts = layouts.length > 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t-primary">Dashboard Builder</h1>
          <p className="mt-1 text-sm text-t-label">
            Crie dashboards personalizados com drag & drop
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeLayout && isEditing && (
            <button
              onClick={() => {
                setEditingWidget(null)
                setShowWidgetModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-edge-cyan px-4 py-2 text-sm font-bold text-edge-dark hover:shadow-lg hover:shadow-edge-cyan/20 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar Widget
            </button>
          )}
          {activeLayout && !isEditing && activeLayout.widgets.length > 0 && summary && (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-secondary hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar
            </button>
          )}
          {activeLayout && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                isEditing
                  ? 'border-edge-cyan/40 bg-edge-cyan/10 text-edge-cyan'
                  : 'border-t-input text-t-secondary hover:bg-t-hover'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isEditing ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                )}
              </svg>
              {isEditing ? 'Concluir edicao' : 'Editar'}
            </button>
          )}
        </div>
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

      {/* Layout Tabs */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
        {layouts.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveLayoutId(l.id)}
            onDoubleClick={() => {
              setRenamingLayout(true)
              setNewLayoutName(l.name)
              setActiveLayoutId(l.id)
              setShowLayoutNameModal(true)
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              activeLayoutId === l.id
                ? 'border-edge-cyan/30 bg-edge-cyan/10 text-edge-cyan'
                : 'border-t-input text-t-muted hover:bg-t-hover hover:text-t-secondary'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
            {l.name}
          </button>
        ))}
        <button
          onClick={() => {
            setRenamingLayout(false)
            setNewLayoutName('')
            setShowLayoutNameModal(true)
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:border-edge-cyan/30 hover:text-edge-cyan transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Dashboard
        </button>
      </div>

      {/* Layout Actions (when editing) */}
      {activeLayout && isEditing && (
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={duplicateLayout}
            className="flex items-center gap-1.5 rounded-lg border border-t-input px-3 py-1.5 text-xs font-medium text-t-muted hover:bg-t-hover hover:text-t-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
            Duplicar
          </button>
          <button
            onClick={() => {
              setRenamingLayout(true)
              setNewLayoutName(activeLayout.name)
              setShowLayoutNameModal(true)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-t-input px-3 py-1.5 text-xs font-medium text-t-muted hover:bg-t-hover hover:text-t-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
            </svg>
            Renomear
          </button>
          {layouts.length > 1 && (
            <button
              onClick={deleteLayout}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Excluir
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasLayouts && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-t-input py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-edge-cyan/10 mb-4">
            <svg className="h-8 w-8 text-edge-cyan" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-t-primary mb-1">Nenhum dashboard criado</h2>
          <p className="text-sm text-t-muted mb-6 max-w-md text-center">
            Crie seu primeiro dashboard personalizado. Arraste, redimensione e configure widgets para montar relatorios do seu jeito.
          </p>
          <button
            onClick={() => {
              setRenamingLayout(false)
              setNewLayoutName('')
              setShowLayoutNameModal(true)
            }}
            className="flex items-center gap-2 rounded-lg bg-edge-cyan px-5 py-2.5 text-sm font-bold text-edge-dark hover:shadow-lg hover:shadow-edge-cyan/20 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Criar primeiro dashboard
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && activeLayout && (() => {
        // Compute cell dimensions for the grid background
        const COLS = 12
        const MARGIN = 16
        const cw = containerWidth ?? 0
        const cellW = cw > 0 ? (cw - MARGIN * (COLS + 1)) / COLS + MARGIN : 80
        const cellH = 60 + MARGIN // rowHeight + margin

        return (
        <div
          ref={gridRef as React.LegacyRef<HTMLDivElement>}
          className={isEditing && activeLayout.widgets.length > 0 ? 'builder-grid-bg p-0' : ''}
          style={isEditing && activeLayout.widgets.length > 0 ? {
            '--grid-cell-w': `${cellW}px`,
            '--grid-cell-h': `${cellH}px`,
            '--grid-offset-x': `${MARGIN / 2}px`,
            '--grid-offset-y': `${MARGIN / 2}px`,
          } as React.CSSProperties : undefined}
        >
          {activeLayout.widgets.length === 0 && isEditing ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-t-input py-16">
              <svg className="mb-3 h-10 w-10 text-t-label opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-sm text-t-muted mb-4">Dashboard vazio. Adicione widgets para comecar.</p>
              <button
                onClick={() => {
                  setEditingWidget(null)
                  setShowWidgetModal(true)
                }}
                className="flex items-center gap-2 rounded-lg bg-edge-cyan px-4 py-2 text-sm font-bold text-edge-dark hover:shadow-lg hover:shadow-edge-cyan/20 transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Widget
              </button>
            </div>
          ) : activeLayout.widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-t-input py-16">
              <p className="text-sm text-t-muted">Dashboard vazio. Clique em &quot;Editar&quot; para adicionar widgets.</p>
            </div>
          ) : (
            <GridLayout
              layout={activeLayout.gridLayout}
              width={containerWidth ?? 0}
              gridConfig={{ cols: 12, rowHeight: 60, margin: [16, 16], containerPadding: null, maxRows: Infinity }}
              dragConfig={{ enabled: isEditing, bounded: false, handle: '.widget-drag-handle', cancel: '' }}
              resizeConfig={{ enabled: isEditing, handles: ['se'] }}
              onLayoutChange={onGridLayoutChange}
              compactor={verticalCompactor}
            >
              {activeLayout.widgets.map((widget) => (
                <div key={widget.id} className="group">
                  <div className={`glass-card rounded-xl h-full flex flex-col overflow-hidden transition-shadow ${isEditing ? 'ring-1 ring-edge-cyan/20 hover:ring-edge-cyan/40' : ''}`}>
                    {/* Widget header */}
                    <div className={`flex items-center justify-between border-b border-t-default px-4 py-2 ${isEditing ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted truncate">
                        {widget.title}
                      </h3>
                      {isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingWidget(widget)
                              setShowWidgetModal(true)
                            }}
                            className="rounded p-1 text-t-muted hover:bg-t-hover hover:text-t-primary transition-colors"
                            title="Editar widget"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => removeWidget(widget.id)}
                            className="rounded p-1 text-t-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            title="Remover widget"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Widget body */}
                    <div className="flex-1 p-3 min-h-0">
                      <WidgetRenderer config={widget} data={summary} />
                    </div>
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
        )
      })()}

      {/* Export Modal */}
      {showExport && summary && activeLayout && (
        <ExportModal
          title={`Relatório — ${activeLayout.name}`}
          subtitle={`Período: ${from || '...'} a ${to || '...'}`}
          filenamePrefix={`dashboard_${activeLayout.name.replace(/\s+/g, '_').toLowerCase()}`}
          metrics={activeLayout.widgets
            .filter((w) => w.type === 'metric-card' && w.metricSource)
            .map((w) => ({
              label: w.title,
              value: (() => {
                switch (w.metricSource) {
                  case 'total_sessions': return summary.totals.sessions.toLocaleString('pt-BR')
                  case 'unique_phones': return summary.totals.unique_phones.toLocaleString('pt-BR')
                  case 'auth_attempts': return summary.totals.auth_attempts.toLocaleString('pt-BR')
                  case 'success_rate': return `${summary.totals.success_rate.toFixed(1)}%`
                  default: return '—'
                }
              })(),
            }))}
          chartData={(() => {
            // Mirror widget-renderer fallbacks so the PDF matches what the user sees on screen.
            const widgets = activeLayout.widgets
            const hasAreaWidget = widgets.some((w) => w.type === 'area-chart')
            const hasLineWidget = widgets.some((w) => w.type === 'line-chart')
            const pieDonut = widgets.some((w) => w.type === 'pie-chart' && w.dataSource === 'success_vs_failure')
            // PieChartWidget treats any dataSource !== 'success_vs_failure' as the tenant pie
            const pieTenant = widgets.some((w) => w.type === 'pie-chart' && w.dataSource !== 'success_vs_failure')
            const barByTenant = widgets.some((w) => w.type === 'bar-chart' && w.dataSource === 'sessions_by_tenant')
            // BarChartWidget treats any dataSource !== 'sessions_by_tenant' as the by-day bar
            const barByDay = widgets.some((w) => w.type === 'bar-chart' && w.dataSource !== 'sessions_by_tenant')

            const dayLabels = summary.by_day.map((d) => { const [, m, day] = d.date.split('-'); return `${day}/${m}` })
            const dayValues = summary.by_day.map((d) => d.sessions)

            return {
              areaChart: hasAreaWidget && summary.by_day.length > 0
                ? { labels: dayLabels, series: { label: 'Sessões', values: dayValues } }
                : undefined,
              lineChart: hasLineWidget && summary.by_day.length > 0
                ? { labels: dayLabels, series: { label: 'Sessões', values: dayValues } }
                : undefined,
              donutChart: pieDonut
                ? {
                    successRate: summary.totals.success_rate,
                    totalSessions: summary.totals.sessions,
                    totalFailures: Math.max(0, summary.totals.auth_attempts - summary.totals.sessions),
                  }
                : undefined,
              barChart: barByTenant && summary.by_tenant.length > 0
                ? {
                    labels: summary.by_tenant.map((t) => t.tenant_name),
                    values: summary.by_tenant.map((t) => t.sessions),
                  }
                : undefined,
              barChartByDay: barByDay && summary.by_day.length > 0
                ? { labels: dayLabels, values: dayValues }
                : undefined,
              tenantPieChart: pieTenant && summary.by_tenant.length > 0
                ? {
                    labels: summary.by_tenant.map((t) => t.tenant_name),
                    values: summary.by_tenant.map((t) => t.sessions),
                  }
                : undefined,
            }
          })()}
          columns={(() => {
            // TableWidget renderer: 'sessions_by_tenant' → tenant columns; anything else → day columns
            const tableWidget = activeLayout.widgets.find((w) => w.type === 'table')
            const useTenant = tableWidget
              ? tableWidget.dataSource === 'sessions_by_tenant'
              : summary.by_tenant.length > 0
            return useTenant
              ? [
                  { key: 'tenant_name', label: 'Tenant', enabled: true },
                  { key: 'sessions', label: 'Sessões', enabled: true },
                  { key: 'unique_phones', label: 'Usuários únicos', enabled: true },
                ]
              : [
                  { key: 'date', label: 'Data', enabled: true },
                  { key: 'sessions', label: 'Sessões', enabled: true },
                ]
          })()}
          data={(() => {
            const tableWidget = activeLayout.widgets.find((w) => w.type === 'table')
            const useTenant = tableWidget
              ? tableWidget.dataSource === 'sessions_by_tenant'
              : summary.by_tenant.length > 0
            return useTenant
              ? summary.by_tenant.map((t) => ({
                  tenant_name: t.tenant_name,
                  sessions: t.sessions.toLocaleString('pt-BR'),
                  unique_phones: t.unique_phones.toLocaleString('pt-BR'),
                }))
              : summary.by_day.map((d) => ({
                  date: new Date(d.date).toLocaleDateString('pt-BR'),
                  sessions: d.sessions.toLocaleString('pt-BR'),
                }))
          })()}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Widget Config Modal */}
      <WidgetConfigModal
        open={showWidgetModal}
        widget={editingWidget}
        onClose={() => {
          setShowWidgetModal(false)
          setEditingWidget(null)
        }}
        onSave={(config) => {
          if (editingWidget) {
            updateWidget(config)
          } else {
            addWidget(config)
          }
        }}
      />

      {/* Layout Name Modal */}
      {showLayoutNameModal && (
        <div
          className="animate-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--modal-overlay)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLayoutNameModal(false) }}
        >
          <div className="animate-modal-content w-full max-w-sm rounded-2xl border border-t-input bg-t-bg2 shadow-2xl">
            <div className="border-b border-t-default px-6 py-4">
              <h2 className="text-lg font-bold text-t-primary">
                {renamingLayout ? 'Renomear Dashboard' : 'Novo Dashboard'}
              </h2>
            </div>
            <div className="px-6 py-5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1.5">
                Nome do Dashboard
              </label>
              <input
                type="text"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                placeholder="Ex: Visao Geral, Metricas por Tenant..."
                className="w-full rounded-lg border border-t-input bg-t-input px-3 py-2.5 text-sm text-t-primary placeholder-t-label focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLayoutName.trim()) {
                    if (renamingLayout) {
                      renameLayout(newLayoutName.trim())
                    } else {
                      createNewLayout(newLayoutName.trim())
                    }
                    setShowLayoutNameModal(false)
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-t-default px-6 py-4">
              <button
                onClick={() => setShowLayoutNameModal(false)}
                className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newLayoutName.trim()) return
                  if (renamingLayout) {
                    renameLayout(newLayoutName.trim())
                  } else {
                    createNewLayout(newLayoutName.trim())
                  }
                  setShowLayoutNameModal(false)
                }}
                disabled={!newLayoutName.trim()}
                className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-bold text-edge-dark hover:shadow-lg hover:shadow-edge-cyan/20 transition-all disabled:opacity-40"
              >
                {renamingLayout ? 'Renomear' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
