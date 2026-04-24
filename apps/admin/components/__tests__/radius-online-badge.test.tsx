import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RadiusOnlineBadge } from '../radius-online-badge'
import type { TenantRadiusStatus } from '@captive-portal/shared'

const onlineStatus: TenantRadiusStatus = {
  enabled: true,
  online: true,
  active_sessions: 3,
  last_accounting_at: '2026-04-24T12:00:00.000Z',
}

const offlineStatus: TenantRadiusStatus = {
  enabled: true,
  online: false,
  active_sessions: 0,
  last_accounting_at: '2026-04-24T10:00:00.000Z',
}

describe('RadiusOnlineBadge', () => {
  it('mostra "Aguardando" quando tenant não está ativo, independente do status', () => {
    render(<RadiusOnlineBadge status={onlineStatus} tenantStatus="provisioning" />)
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
  })

  it('mostra "Aguardando" para tenant inactive', () => {
    render(<RadiusOnlineBadge status={onlineStatus} tenantStatus="inactive" />)
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
  })

  it('mostra "Aguardando" para tenant failed', () => {
    render(<RadiusOnlineBadge status={null} tenantStatus="failed" />)
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
  })

  it('mostra "Verificando..." quando tenant ativo mas status ainda não chegou', () => {
    render(<RadiusOnlineBadge status={null} tenantStatus="active" />)
    expect(screen.getByText('Verificando...')).toBeInTheDocument()
  })

  it('mostra "Online" quando status.online=true', () => {
    render(<RadiusOnlineBadge status={onlineStatus} tenantStatus="active" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('mostra "Offline" quando status.online=false', () => {
    render(<RadiusOnlineBadge status={offlineStatus} tenantStatus="active" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('tooltip do Online cita accounting recebido quando last_accounting_at tem valor', () => {
    render(<RadiusOnlineBadge status={onlineStatus} tenantStatus="active" />)
    const badge = screen.getByText('Online').closest('span')
    expect(badge?.getAttribute('title')).toMatch(/Último accounting:/)
  })

  it('tooltip do Online cita "container ativo" quando last_accounting_at é null (tenant novo)', () => {
    const neverSeen: TenantRadiusStatus = {
      ...onlineStatus,
      last_accounting_at: null,
    }
    render(<RadiusOnlineBadge status={neverSeen} tenantStatus="active" />)
    const badge = screen.getByText('Online').closest('span')
    expect(badge?.getAttribute('title')).toMatch(/nenhum accounting ainda recebido/i)
  })

  it('tooltip do Offline mostra horário quando last_accounting_at tem valor', () => {
    render(<RadiusOnlineBadge status={offlineStatus} tenantStatus="active" />)
    const badge = screen.getByText('Offline').closest('span')
    expect(badge?.getAttribute('title')).toMatch(/Sem accounting desde/)
  })

  it('tooltip do Offline pede pra verificar firewall quando nunca houve accounting', () => {
    const neverSeenOffline: TenantRadiusStatus = {
      ...offlineStatus,
      last_accounting_at: null,
    }
    render(<RadiusOnlineBadge status={neverSeenOffline} tenantStatus="active" />)
    const badge = screen.getByText('Offline').closest('span')
    expect(badge?.getAttribute('title')).toMatch(/verifique firewall/i)
  })
})
