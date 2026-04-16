'use client'

import { useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export type ExportFormat = 'pdf' | 'csv' | 'json'

export interface ExportColumn {
  key: string
  label: string
  enabled: boolean
}

export interface ExportMetric {
  label: string
  value: string
}

export interface ChartDataSeries {
  label: string
  values: number[]
}

export interface ExportChartData {
  /** Area chart — sessions by day */
  areaChart?: {
    labels: string[]
    series: ChartDataSeries
  }
  /** Line chart — sessions by day (rendered as line, not area fill) */
  lineChart?: {
    labels: string[]
    series: ChartDataSeries
  }
  /** Donut chart — success rate */
  donutChart?: {
    successRate: number
    totalSessions: number
    totalFailures: number
  }
  /** Bar chart — by tenant */
  barChart?: {
    labels: string[]
    values: number[]
  }
  /** Bar chart — by day */
  barChartByDay?: {
    labels: string[]
    values: number[]
    color?: readonly [number, number, number]
  }
  /** Pie chart — distribution by tenant */
  tenantPieChart?: {
    labels: string[]
    values: number[]
  }
}

interface ExportModalProps {
  title: string
  columns: ExportColumn[]
  data: Record<string, unknown>[]
  filenamePrefix: string
  onClose: () => void
  metrics?: ExportMetric[]
  subtitle?: string
  chartData?: ExportChartData
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: JSX.Element; description: string }[] = [
  {
    value: 'pdf',
    label: 'PDF',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    description: 'Relatório visual com cabeçalho, métricas e tabela formatada',
  },
  {
    value: 'csv',
    label: 'CSV',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.375" />
      </svg>
    ),
    description: 'Compativel com Excel e Google Sheets',
  },
  {
    value: 'json',
    label: 'JSON',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
      </svg>
    ),
    description: 'Formato estruturado para integração',
  },
]

// ─── Text export helpers ────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function generateTextExport(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  format: 'csv' | 'json',
  includeHeader: boolean,
): string {
  const enabledCols = columns.filter((c) => c.enabled)

  if (format === 'json') {
    const rows = data.map((row) => {
      const obj: Record<string, unknown> = {}
      for (const col of enabledCols) {
        obj[col.key] = row[col.key] ?? ''
      }
      return obj
    })
    return JSON.stringify(rows, null, 2)
  }

  const lines: string[] = []

  if (includeHeader) {
    lines.push(enabledCols.map((c) => escapeCSV(c.label)).join(','))
  }

  for (const row of data) {
    const values = enabledCols.map((col) => {
      const val = row[col.key]
      if (val === null || val === undefined) return ''
      if (typeof val === 'object') return escapeCSV(JSON.stringify(val))
      return escapeCSV(String(val))
    })
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

// ─── Chart drawing helpers for PDF ─────────────────────

type JsPDFDoc = InstanceType<typeof jsPDF>
type RGB = readonly [number, number, number]

function drawAreaChart(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  values: number[],
  colors: { line: RGB; fill: RGB; grid: RGB; text: RGB; bg: RGB },
) {
  if (values.length === 0) return

  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  const padding = { top: 14, right: 10, bottom: 16, left: 14 }
  const chartX = x + padding.left
  const chartY = y + padding.top
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.text)
  doc.text('SESSOES POR DIA', x + 6, y + 8)

  const maxVal = Math.max(...values, 1)

  // Grid lines (4 horizontal)
  doc.setDrawColor(...colors.grid)
  doc.setLineWidth(0.1)
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i
    doc.line(chartX, gy, chartX + chartW, gy)
    // Y-axis labels
    doc.setFontSize(5)
    doc.setTextColor(...colors.text)
    const labelVal = Math.round(maxVal - (maxVal / 4) * i)
    doc.text(String(labelVal), chartX - 2, gy + 1.5, { align: 'right' })
  }

  // Compute points
  const step = chartW / Math.max(values.length - 1, 1)
  const points: [number, number][] = values.map((v, i) => [
    chartX + i * step,
    chartY + chartH - (v / maxVal) * chartH,
  ])

  // Fill area (approximate with triangles using jsPDF)
  // Draw filled polygon manually
  doc.setFillColor(...colors.fill)
  // Build path: top line then bottom
  const pathPoints: [number, number][] = [
    [chartX, chartY + chartH],
    ...points,
    [chartX + (values.length - 1) * step, chartY + chartH],
  ]

  // jsPDF triangle fill approach - fill strips between consecutive points
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const baseY = chartY + chartH
    // Draw two triangles to form a quad
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = doc as any
    if (typeof d.triangle === 'function') {
      d.triangle(x1, y1, x2, y2, x1, baseY, 'F')
      d.triangle(x2, y2, x2, baseY, x1, baseY, 'F')
    } else {
      // Fallback: just draw filled rects as approximation
      const minY = Math.min(y1, y2)
      doc.rect(x1, minY, x2 - x1, baseY - minY, 'F')
    }
  }

  // Draw the line on top
  doc.setDrawColor(...colors.line)
  doc.setLineWidth(0.5)
  for (let i = 0; i < points.length - 1; i++) {
    doc.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  }

  // Dots
  doc.setFillColor(...colors.line)
  for (const [px, py] of points) {
    doc.circle(px, py, 0.8, 'F')
  }

  // X-axis labels (show max ~10)
  doc.setFontSize(5)
  doc.setTextColor(...colors.text)
  const labelStep = Math.max(1, Math.floor(labels.length / 10))
  for (let i = 0; i < labels.length; i += labelStep) {
    const lx = chartX + i * step
    doc.text(labels[i], lx, chartY + chartH + 5, { align: 'center' })
  }
  // Always show last label
  if (labels.length > 1) {
    const lx = chartX + (labels.length - 1) * step
    doc.text(labels[labels.length - 1], lx, chartY + chartH + 5, { align: 'center' })
  }

  void pathPoints // suppress unused
}

function drawLineChart(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  values: number[],
  colors: { line: RGB; grid: RGB; text: RGB; bg: RGB },
) {
  if (values.length === 0) return

  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  const padding = { top: 14, right: 10, bottom: 16, left: 14 }
  const chartX = x + padding.left
  const chartY = y + padding.top
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.text)
  doc.text('SESSOES POR DIA', x + 6, y + 8)

  const maxVal = Math.max(...values, 1)

  // Grid lines (4 horizontal)
  doc.setDrawColor(...colors.grid)
  doc.setLineWidth(0.1)
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i
    doc.line(chartX, gy, chartX + chartW, gy)
    doc.setFontSize(5)
    doc.setTextColor(...colors.text)
    const labelVal = Math.round(maxVal - (maxVal / 4) * i)
    doc.text(String(labelVal), chartX - 2, gy + 1.5, { align: 'right' })
  }

  // Compute points
  const step = chartW / Math.max(values.length - 1, 1)
  const points: [number, number][] = values.map((v, i) => [
    chartX + i * step,
    chartY + chartH - (v / maxVal) * chartH,
  ])

  // Draw the line
  doc.setDrawColor(...colors.line)
  doc.setLineWidth(0.5)
  for (let i = 0; i < points.length - 1; i++) {
    doc.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  }

  // Dots
  doc.setFillColor(...colors.line)
  for (const [px, py] of points) {
    doc.circle(px, py, 1, 'F')
  }

  // X-axis labels (show max ~10)
  doc.setFontSize(5)
  doc.setTextColor(...colors.text)
  const labelStep = Math.max(1, Math.floor(labels.length / 10))
  for (let i = 0; i < labels.length; i += labelStep) {
    const lx = chartX + i * step
    doc.text(labels[i], lx, chartY + chartH + 5, { align: 'center' })
  }
  if (labels.length > 1) {
    const lx = chartX + (labels.length - 1) * step
    doc.text(labels[labels.length - 1], lx, chartY + chartH + 5, { align: 'center' })
  }
}

function drawDonutChart(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  successRate: number,
  totalSessions: number,
  totalFailures: number,
  colors: { success: RGB; failure: RGB; text: RGB; textMuted: RGB; bg: RGB },
) {
  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.textMuted)
  doc.text('TAXA DE SUCESSO', x + 6, y + 8)

  const cx = x + w / 2
  const cy = y + h / 2 - 2
  const outerR = Math.min(w, h) * 0.22
  const innerR = outerR * 0.65

  // Draw success arc (filled ring segments using small sectors)
  const total = totalSessions + totalFailures
  const successAngle = total > 0 ? (totalSessions / total) * 360 : 0

  // Draw full ring as failure color first
  doc.setFillColor(...colors.failure)
  drawRing(doc, cx, cy, outerR, innerR, 0, 360)

  // Overlay success portion
  if (successAngle > 0) {
    doc.setFillColor(...colors.success)
    drawRing(doc, cx, cy, outerR, innerR, -90, -90 + successAngle)
  }

  // Center text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...colors.text)
  doc.text(`${successRate.toFixed(1)}%`, cx, cy + 2, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(...colors.textMuted)
  doc.text('SUCESSO', cx, cy + 6, { align: 'center' })

  // Legend
  const legendY = y + h - 12
  // Success dot
  doc.setFillColor(...colors.success)
  doc.circle(x + 10, legendY, 1.2, 'F')
  doc.setFontSize(6)
  doc.setTextColor(...colors.textMuted)
  doc.text(`${totalSessions.toLocaleString('pt-BR')} aprovadas`, x + 13, legendY + 1)

  // Failure dot
  doc.setFillColor(...colors.failure)
  doc.circle(x + w / 2, legendY, 1.2, 'F')
  doc.text(`${totalFailures.toLocaleString('pt-BR')} falharam`, x + w / 2 + 3, legendY + 1)
}

function drawRing(
  doc: JsPDFDoc,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngleDeg: number,
  endAngleDeg: number,
) {
  // Approximate ring sector with small filled triangles
  const steps = Math.max(36, Math.ceil(Math.abs(endAngleDeg - startAngleDeg) / 3))
  const startRad = (startAngleDeg * Math.PI) / 180
  const endRad = (endAngleDeg * Math.PI) / 180
  const stepRad = (endRad - startRad) / steps

  for (let i = 0; i < steps; i++) {
    const a1 = startRad + i * stepRad
    const a2 = startRad + (i + 1) * stepRad

    const ox1 = cx + outerR * Math.cos(a1)
    const oy1 = cy + outerR * Math.sin(a1)
    const ox2 = cx + outerR * Math.cos(a2)
    const oy2 = cy + outerR * Math.sin(a2)
    const ix1 = cx + innerR * Math.cos(a1)
    const iy1 = cy + innerR * Math.sin(a1)
    const ix2 = cx + innerR * Math.cos(a2)
    const iy2 = cy + innerR * Math.sin(a2)

    // Two triangles to form a trapezoid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = doc as any
    if (typeof d.triangle === 'function') {
      d.triangle(ox1, oy1, ox2, oy2, ix1, iy1, 'F')
      d.triangle(ox2, oy2, ix2, iy2, ix1, iy1, 'F')
    } else {
      // Fallback: draw thin rects
      doc.rect(
        Math.min(ox1, ox2, ix1, ix2),
        Math.min(oy1, oy2, iy1, iy2),
        Math.abs(ox2 - ix1) || 0.5,
        Math.abs(oy2 - iy1) || 0.5,
        'F',
      )
    }
  }
}

function drawBarChart(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  values: number[],
  colors: { bars: RGB[]; grid: RGB; text: RGB; bg: RGB },
) {
  if (values.length === 0) return

  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.text)
  doc.text('SESSOES POR TENANT', x + 6, y + 8)

  const padding = { top: 14, right: 10, bottom: 16, left: 14 }
  const chartX = x + padding.left
  const chartY = y + padding.top
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  const maxVal = Math.max(...values, 1)
  const barCount = values.length
  const barGap = chartW * 0.15 / barCount
  const barWidth = (chartW - barGap * (barCount + 1)) / barCount

  // Grid
  doc.setDrawColor(...colors.grid)
  doc.setLineWidth(0.1)
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i
    doc.line(chartX, gy, chartX + chartW, gy)
  }

  // Bars
  const barColors: RGB[] = [
    [0, 229, 195], [6, 182, 212], [139, 92, 246], [245, 158, 11],
    [239, 68, 68], [236, 72, 153], [16, 185, 129], [99, 102, 241],
  ]

  for (let i = 0; i < barCount; i++) {
    const bx = chartX + barGap + i * (barWidth + barGap)
    const barH = (values[i] / maxVal) * chartH
    const by = chartY + chartH - barH
    const color = (colors.bars.length > i ? colors.bars[i] : barColors[i % barColors.length])

    doc.setFillColor(...color)
    doc.roundedRect(bx, by, barWidth, barH, 1, 1, 'F')

    // Value on top
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(String(values[i]), bx + barWidth / 2, by - 2, { align: 'center' })

    // Label below
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5)
    doc.setTextColor(...colors.text)
    const lbl = labels[i].length > 10 ? labels[i].slice(0, 10) + '..' : labels[i]
    doc.text(lbl, bx + barWidth / 2, chartY + chartH + 5, { align: 'center' })
  }
}

function drawBarChartByDay(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  values: number[],
  barColor: RGB,
  colors: { grid: RGB; text: RGB; bg: RGB },
) {
  if (values.length === 0) return

  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.text)
  doc.text('SESSOES POR DIA', x + 6, y + 8)

  const padding = { top: 14, right: 10, bottom: 16, left: 14 }
  const chartX = x + padding.left
  const chartY = y + padding.top
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  const maxVal = Math.max(...values, 1)
  const barCount = values.length
  const barGap = Math.min(chartW * 0.05 / barCount, 1.5)
  const barWidth = (chartW - barGap * (barCount + 1)) / barCount

  // Grid
  doc.setDrawColor(...colors.grid)
  doc.setLineWidth(0.1)
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i
    doc.line(chartX, gy, chartX + chartW, gy)
  }

  // Bars
  for (let i = 0; i < barCount; i++) {
    const bx = chartX + barGap + i * (barWidth + barGap)
    const barH = (values[i] / maxVal) * chartH
    const by = chartY + chartH - barH

    doc.setFillColor(...barColor)
    doc.roundedRect(bx, by, barWidth, barH, 0.5, 0.5, 'F')
  }

  // X-axis labels (show max ~10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(...colors.text)
  const labelStep = Math.max(1, Math.floor(labels.length / 10))
  for (let i = 0; i < labels.length; i += labelStep) {
    const bx = chartX + barGap + i * (barWidth + barGap) + barWidth / 2
    doc.text(labels[i], bx, chartY + chartH + 5, { align: 'center' })
  }
  if (labels.length > 1) {
    const bx = chartX + barGap + (labels.length - 1) * (barWidth + barGap) + barWidth / 2
    doc.text(labels[labels.length - 1], bx, chartY + chartH + 5, { align: 'center' })
  }
}

function drawTenantPieChart(
  doc: JsPDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  values: number[],
  colors: { text: RGB; textMuted: RGB; bg: RGB },
) {
  if (values.length === 0) return

  // Background
  doc.setFillColor(...colors.bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...colors.textMuted)
  doc.text('DISTRIBUICAO POR TENANT', x + 6, y + 8)

  const cx = x + w * 0.35
  const cy = y + h / 2 + 2
  const radius = Math.min(w * 0.25, h * 0.32)

  const total = values.reduce((sum, v) => sum + v, 0)
  if (total === 0) return

  const pieColors: RGB[] = [
    [0, 229, 195], [6, 182, 212], [139, 92, 246], [245, 158, 11],
    [239, 68, 68], [236, 72, 153], [16, 185, 129], [99, 102, 241],
  ]

  // Draw slices
  let currentAngle = -90
  for (let i = 0; i < values.length; i++) {
    const sliceAngle = (values[i] / total) * 360
    const color = pieColors[i % pieColors.length]
    doc.setFillColor(...color)
    drawRing(doc, cx, cy, radius, 0, currentAngle, currentAngle + sliceAngle)
    currentAngle += sliceAngle
  }

  // Legend (right side)
  const legendX = x + w * 0.6
  const legendStartY = y + 16
  const legendSpacing = 8

  for (let i = 0; i < Math.min(values.length, Math.floor((h - 20) / legendSpacing)); i++) {
    const ly = legendStartY + i * legendSpacing
    const color = pieColors[i % pieColors.length]
    const pct = ((values[i] / total) * 100).toFixed(0)
    const lbl = labels[i].length > 14 ? labels[i].slice(0, 14) + '..' : labels[i]

    doc.setFillColor(...color)
    doc.circle(legendX, ly, 1.2, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...colors.text)
    doc.text(`${lbl} (${pct}%)`, legendX + 3, ly + 1)
  }
}

// ─── PDF generation ─────────────────────────────────────

function generatePDF(
  title: string,
  subtitle: string | undefined,
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  metrics?: ExportMetric[],
  orientation: 'portrait' | 'landscape' = 'landscape',
  chartData?: ExportChartData,
) {
  const enabledCols = columns.filter((c) => c.enabled)
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Colors
  const CYAN = [0, 229, 195] as const
  const DARK_BG = [10, 14, 23] as const
  const DARK_CARD = [13, 18, 25] as const
  const HEADER_BG = [15, 22, 33] as const
  const TEXT_PRIMARY = [255, 255, 255] as const
  const TEXT_MUTED = [148, 163, 184] as const
  const BORDER = [30, 40, 55] as const

  // ── Background
  doc.setFillColor(...DARK_BG)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // ── Top accent bar
  doc.setFillColor(...CYAN)
  doc.rect(0, 0, pageWidth, 2, 'F')

  // ── Header area
  let yPos = 14

  // Logo placeholder / brand
  doc.setFillColor(...CYAN)
  doc.roundedRect(14, yPos - 2, 8, 8, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK_BG)
  doc.text('4E', 15.2, yPos + 4)

  // Title
  doc.setFontSize(16)
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(title, 26, yPos + 3.5)

  // Subtitle / date range
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_MUTED)
  const dateStr = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const subtitleText = subtitle ? `${subtitle}  •  Gerado em ${dateStr}` : `Gerado em ${dateStr}`
  doc.text(subtitleText, 26, yPos + 9)
  yPos += 18

  // ── Divider
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(14, yPos, pageWidth - 14, yPos)
  yPos += 6

  // ── Metrics cards
  if (metrics && metrics.length > 0) {
    const cardWidth = (pageWidth - 28 - (metrics.length - 1) * 4) / metrics.length
    const cardHeight = 18

    metrics.forEach((metric, i) => {
      const x = 14 + i * (cardWidth + 4)

      // Card background
      doc.setFillColor(...DARK_CARD)
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'F')

      // Card border
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.2)
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'S')

      // Accent line top
      doc.setFillColor(...CYAN)
      doc.rect(x + 3, yPos + 2, 12, 0.8, 'F')

      // Label
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(metric.label.toUpperCase(), x + 3, yPos + 7)

      // Value
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(...TEXT_PRIMARY)
      doc.text(metric.value, x + 3, yPos + 14.5)
    })

    yPos += cardHeight + 8
  }

  // ── Charts
  if (chartData) {
    const chartColors = {
      line: [...CYAN] as RGB,
      fill: [0, 229, 195] as RGB,
      grid: [...BORDER] as RGB,
      text: [...TEXT_MUTED] as RGB,
      bg: [...DARK_CARD] as RGB,
      success: [...CYAN] as RGB,
      failure: [40, 50, 65] as RGB,
      textMuted: [...TEXT_MUTED] as RGB,
      textPrimary: [...TEXT_PRIMARY] as RGB,
    }

    // Helper to check if a new page is needed before drawing a chart
    const ensureSpace = (needed: number) => {
      if (yPos + needed > pageHeight - 20) {
        doc.addPage()
        doc.setFillColor(...DARK_BG)
        doc.rect(0, 0, pageWidth, pageHeight, 'F')
        yPos = 14
      }
    }

    const hasArea = chartData.areaChart && chartData.areaChart.series.values.length > 0
    const hasLine = chartData.lineChart && chartData.lineChart.series.values.length > 0
    const hasDonut = chartData.donutChart
    // Pick area or line as the "time series" chart (area takes priority if both exist)
    const timeSeriesType = hasArea ? 'area' : hasLine ? 'line' : null

    if (timeSeriesType && hasDonut) {
      // Two charts side by side: time series (2/3) + donut (1/3)
      ensureSpace(61)
      const gap = 4
      const tsW = (pageWidth - 28 - gap) * 0.65
      const donutW = (pageWidth - 28 - gap) * 0.35
      const chartH = 55

      if (timeSeriesType === 'area') {
        drawAreaChart(doc, 14, yPos, tsW, chartH,
          chartData.areaChart!.labels,
          chartData.areaChart!.series.values,
          { line: chartColors.line, fill: [0, 60, 50], grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
        )
      } else {
        drawLineChart(doc, 14, yPos, tsW, chartH,
          chartData.lineChart!.labels,
          chartData.lineChart!.series.values,
          { line: chartColors.line, grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
        )
      }

      drawDonutChart(doc, 14 + tsW + gap, yPos, donutW, chartH,
        chartData.donutChart!.successRate,
        chartData.donutChart!.totalSessions,
        chartData.donutChart!.totalFailures,
        { success: chartColors.success, failure: chartColors.failure, text: chartColors.textPrimary, textMuted: chartColors.text, bg: chartColors.bg },
      )

      yPos += chartH + 6
    } else if (timeSeriesType) {
      ensureSpace(61)
      const chartH = 55
      if (timeSeriesType === 'area') {
        drawAreaChart(doc, 14, yPos, pageWidth - 28, chartH,
          chartData.areaChart!.labels,
          chartData.areaChart!.series.values,
          { line: chartColors.line, fill: [0, 60, 50], grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
        )
      } else {
        drawLineChart(doc, 14, yPos, pageWidth - 28, chartH,
          chartData.lineChart!.labels,
          chartData.lineChart!.series.values,
          { line: chartColors.line, grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
        )
      }
      yPos += chartH + 6
    } else if (hasDonut) {
      ensureSpace(61)
      const chartH = 55
      drawDonutChart(doc, 14, yPos, pageWidth - 28, chartH,
        chartData.donutChart!.successRate,
        chartData.donutChart!.totalSessions,
        chartData.donutChart!.totalFailures,
        { success: chartColors.success, failure: chartColors.failure, text: chartColors.textPrimary, textMuted: chartColors.text, bg: chartColors.bg },
      )
      yPos += chartH + 6
    }

    // Bar chart by tenant (full width, below)
    if (chartData.barChart && chartData.barChart.values.length > 0) {
      ensureSpace(56)

      const barColors: RGB[] = [
        [0, 229, 195], [6, 182, 212], [139, 92, 246], [245, 158, 11],
        [239, 68, 68], [236, 72, 153], [16, 185, 129], [99, 102, 241],
      ]

      drawBarChart(doc, 14, yPos, pageWidth - 28, 50,
        chartData.barChart.labels,
        chartData.barChart.values,
        { bars: barColors, grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
      )
      yPos += 56
    }

    // Bar chart by day (full width, below)
    if (chartData.barChartByDay && chartData.barChartByDay.values.length > 0) {
      ensureSpace(56)
      const barColor: RGB = chartData.barChartByDay.color
        ? [...chartData.barChartByDay.color] as RGB
        : [...CYAN] as RGB

      drawBarChartByDay(doc, 14, yPos, pageWidth - 28, 50,
        chartData.barChartByDay.labels,
        chartData.barChartByDay.values,
        barColor,
        { grid: chartColors.grid, text: chartColors.text, bg: chartColors.bg },
      )
      yPos += 56
    }

    // Tenant pie chart (full width, below)
    if (chartData.tenantPieChart && chartData.tenantPieChart.values.length > 0) {
      ensureSpace(56)

      drawTenantPieChart(doc, 14, yPos, pageWidth - 28, 50,
        chartData.tenantPieChart.labels,
        chartData.tenantPieChart.values,
        { text: chartColors.textPrimary, textMuted: chartColors.text, bg: chartColors.bg },
      )
      yPos += 56
    }
  }

  // ── Table
  const tableHeaders = enabledCols.map((c) => c.label)
  const tableBody = data.map((row) =>
    enabledCols.map((col) => {
      const val = row[col.key]
      if (val === null || val === undefined) return ''
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    }),
  )

  type Color3 = [number, number, number]

  autoTable(doc, {
    startY: yPos,
    head: [tableHeaders],
    body: tableBody,
    margin: { left: 14, right: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      textColor: [...TEXT_MUTED] as Color3,
      lineColor: [...BORDER] as Color3,
      lineWidth: 0.2,
      fillColor: undefined,
    },
    headStyles: {
      fillColor: [...HEADER_BG] as Color3,
      textColor: [...CYAN] as Color3,
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    },
    alternateRowStyles: {
      fillColor: [12, 16, 22] as Color3,
    },
    bodyStyles: {
      fillColor: [...DARK_BG] as Color3,
    },
    didDrawPage: (hookData) => {
      const totalPages = doc.getNumberOfPages()
      const currentPage = hookData.pageNumber
      doc.setFontSize(7)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(
        `4Edge Captive Portal  •  Página ${currentPage} de ${totalPages}`,
        14,
        pageHeight - 8,
      )
      doc.text(
        dateStr,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' },
      )

      doc.setFillColor(...CYAN)
      doc.rect(14, pageHeight - 5, pageWidth - 28, 0.3, 'F')

      if (currentPage > 1) {
        doc.setFillColor(...CYAN)
        doc.rect(0, 0, pageWidth, 1, 'F')
      }
    },
    tableLineColor: [...BORDER] as Color3,
    tableLineWidth: 0.1,
  })

  // ── Summary footer (after table)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? yPos + 20
  if (finalY + 10 < pageHeight - 15) {
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(
      `Total de registros: ${data.length}`,
      14,
      finalY + 6,
    )
  }

  return doc
}

// ─── Download helpers ───────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const MIME_TYPES: Record<string, string> = {
  csv: 'text/csv',
  json: 'application/json',
}

// ─── Component ──────────────────────────────────────────

export function ExportModal({
  title,
  columns: initialColumns,
  data,
  filenamePrefix,
  onClose,
  metrics,
  subtitle,
  chartData,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [columns, setColumns] = useState<ExportColumn[]>(initialColumns)
  const [includeHeader, setIncludeHeader] = useState(true)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [exported, setExported] = useState(false)

  const enabledCount = columns.filter((c) => c.enabled).length

  const toggleColumn = (key: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)),
    )
  }

  const toggleAll = () => {
    const allEnabled = columns.every((c) => c.enabled)
    setColumns((prev) => prev.map((c) => ({ ...c, enabled: !allEnabled })))
  }

  const handleExport = () => {
    if (enabledCount === 0) return

    const timestamp = new Date().toISOString().slice(0, 10)

    if (format === 'pdf') {
      const doc = generatePDF(title, subtitle, data, columns, metrics, orientation, chartData)
      doc.save(`${filenamePrefix}_${timestamp}.pdf`)
    } else {
      const filename = `${filenamePrefix}_${timestamp}.${format}`
      const content = generateTextExport(data, columns, format, includeHeader)
      downloadFile(content, filename, MIME_TYPES[format])
    }

    setExported(true)
    setTimeout(() => onClose(), 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-t-overlay backdrop-blur-sm animate-modal-overlay">
      <div className="w-full max-w-xl rounded-xl border border-t-input bg-t-card shadow-xl animate-modal-content">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-t-default px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-t-primary">{title}</h2>
            <p className="mt-0.5 text-[11px] text-t-label">
              {data.length} registro{data.length !== 1 ? 's' : ''} disponive{data.length !== 1 ? 'is' : 'l'} para exportação
            </p>
          </div>
          <button onClick={onClose} className="text-t-label hover:text-t-secondary transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Format selection */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-t-muted mb-2">
              Formato de exportação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={`rounded-lg border p-3 text-center transition-all ${
                    format === opt.value
                      ? 'border-edge-cyan/50 bg-edge-cyan/5 ring-1 ring-edge-cyan/30'
                      : 'border-t-input bg-t-input hover:border-t-default'
                  }`}
                >
                  <div className={`mx-auto mb-1.5 ${format === opt.value ? 'text-edge-cyan' : 'text-t-muted'}`}>
                    {opt.icon}
                  </div>
                  <p className={`text-sm font-semibold ${format === opt.value ? 'text-edge-cyan' : 'text-t-primary'}`}>
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-[9px] text-t-label leading-tight">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* PDF orientation */}
          {format === 'pdf' && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-t-muted mb-2">
                Orientacao da página
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                    orientation === 'landscape'
                      ? 'border-edge-cyan/50 bg-edge-cyan/5 text-edge-cyan ring-1 ring-edge-cyan/30'
                      : 'border-t-input bg-t-input text-t-muted hover:border-t-default'
                  }`}
                >
                  <svg className="h-4 w-5" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="0.75" y="0.75" width="18.5" height="14.5" rx="1.5" />
                  </svg>
                  Paisagem
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                    orientation === 'portrait'
                      ? 'border-edge-cyan/50 bg-edge-cyan/5 text-edge-cyan ring-1 ring-edge-cyan/30'
                      : 'border-t-input bg-t-input text-t-muted hover:border-t-default'
                  }`}
                >
                  <svg className="h-5 w-4" viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="0.75" y="0.75" width="14.5" height="18.5" rx="1.5" />
                  </svg>
                  Retrato
                </button>
              </div>
            </div>
          )}

          {/* Column selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">
                Colunas ({enabledCount}/{columns.length})
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[10px] font-medium text-edge-cyan hover:text-edge-cyan/80 transition-colors"
              >
                {columns.every((c) => c.enabled) ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {columns.map((col) => (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    col.enabled
                      ? 'border-edge-cyan/20 bg-edge-cyan/5'
                      : 'border-t-input bg-t-input opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleColumn(col.key)}
                    className="h-3.5 w-3.5 rounded border-t-input accent-edge-cyan"
                  />
                  <span className="text-xs text-t-secondary">{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Text format options */}
          {format !== 'json' && format !== 'pdf' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-t-input accent-edge-cyan"
              />
              <span className="text-xs text-t-secondary">Incluir cabeçalho</span>
            </label>
          )}

          {/* PDF preview hint */}
          {format === 'pdf' && metrics && metrics.length > 0 && (
            <div className="rounded-lg border border-edge-cyan/15 bg-edge-cyan/[0.03] p-3">
              <p className="text-[11px] text-t-muted">
                O PDF incluira um cabeçalho com branding, {metrics.length} card{metrics.length > 1 ? 's' : ''} de métricas
                {chartData ? ', gráficos visuais' : ''} e a tabela de dados com páginacao automatica.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-t-default px-6 py-4">
          <p className="text-[10px] text-t-label">
            {format === 'pdf' ? 'A4' : format.toUpperCase()} • {enabledCount} coluna{enabledCount !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={enabledCount === 0 || exported}
              className="flex items-center gap-2 rounded-lg bg-edge-cyan px-5 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 disabled:opacity-50 transition-colors"
            >
              {exported ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Exportado!
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Exportar {format.toUpperCase()}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
