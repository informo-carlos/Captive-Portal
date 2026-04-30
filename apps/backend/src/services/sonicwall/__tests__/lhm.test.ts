// Testes do releaseAccessLhm — cobre os casos de validação e happy path.
//
// Não há I/O externo: a função apenas monta dados e retorna.
// O logger é um stub silencioso.

import { describe, it, expect, vi } from 'vitest'
import { releaseAccessLhm } from '../lhm'
import type { ReleaseAccessParams, SonicwallConfig } from '../index'

// Stub de logger — ignora todas as chamadas
const logger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const stubConfig: SonicwallConfig = {
  host: '10.0.0.1',
  user: 'admin',
  pass: 'secret',
  firmware: '7',
  mode: 'lhm',
  lhmPort: 4443,
  guestServiceUser: 'guest',
  guestServicePass: 'guestpass',
}

function makeParams(overrides: Partial<ReleaseAccessParams> = {}): ReleaseAccessParams {
  return {
    mac: '00:0e:35:bd:c9:37',
    ip: '10.50.165.231',
    phone: '+5511999994321',
    sessionMinutes: 120,
    lhmParams: {
      sessionId: 'abc123def456',
      mgmtBaseUrl: 'https://10.50.165.193:4043/',
      req: 'http://www.google.com/',
    },
    ...overrides,
  }
}

describe('releaseAccessLhm', () => {
  it('retorna success: false quando sessionId está ausente', async () => {
    const params = makeParams({
      lhmParams: { mgmtBaseUrl: 'https://10.50.165.193:4043/' },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(false)
    expect(result.mode).toBe('lhm')
    expect((result.raw as Record<string, unknown>).error).toBe('missing_lhm_params')
  })

  it('retorna success: false quando mgmtBaseUrl está ausente', async () => {
    const params = makeParams({
      lhmParams: { sessionId: 'abc123' },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(false)
    expect((result.raw as Record<string, unknown>).error).toBe('missing_lhm_params')
  })

  it('retorna success: false quando lhmParams é undefined', async () => {
    const params = makeParams({ lhmParams: undefined })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(false)
    expect((result.raw as Record<string, unknown>).error).toBe('missing_lhm_params')
  })

  it('retorna success: false quando mgmtBaseUrl é inválido', async () => {
    const params = makeParams({
      lhmParams: { sessionId: 'abc123', mgmtBaseUrl: 'nao-e-uma-url' },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(false)
    expect((result.raw as Record<string, unknown>).error).toBe('invalid_mgmt_base_url')
  })

  it('retorna success: false para mgmtBaseUrl sem protocolo válido', async () => {
    const params = makeParams({
      lhmParams: { sessionId: 'abc123', mgmtBaseUrl: 'ftp://10.0.0.1/' },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(false)
    expect((result.raw as Record<string, unknown>).error).toBe('invalid_mgmt_base_url')
  })

  it('happy path — retorna lhmPost com url, payload e reqUrl corretos', async () => {
    const params = makeParams()
    const result = await releaseAccessLhm(params, stubConfig, logger)

    expect(result.success).toBe(true)
    expect(result.mode).toBe('lhm')
    expect(result.lhmPost).toBeDefined()

    const { url, payload, reqUrl } = result.lhmPost!

    // URL deve terminar com /lhmapi/externalAAAGuest
    expect(url).toMatch(/\/lhmapi\/externalAAAGuest$/)
    expect(url).toBe('https://10.50.165.193:4043/lhmapi/externalAAAGuest')

    // Payload: info.action deve ser 1
    const info = (payload as { info: Record<string, unknown> }).info
    expect(info.action).toBe(1)

    // sessId deve ser o mesmo do redirect
    expect(info.sessId).toBe('abc123def456')

    // userName deve ser o MAC normalizado (uppercase, sem separadores)
    expect(info.userName).toBe('000E35BDC937')

    // sessionLifetime deve corresponder a sessionMinutes * 60
    expect(info.sessionLifetime).toBe(String(120 * 60))

    // cycleSessionLifeTime deve ser igual ao sessionLifetime
    expect(info.cycleSessionLifeTime).toBe(info.sessionLifetime)

    // reqUrl deve vir do param `req` do redirect
    expect(reqUrl).toBe('http://www.google.com/')
  })

  it('happy path sem req — reqUrl deve ser undefined', async () => {
    const params = makeParams({
      lhmParams: {
        sessionId: 'abc123',
        mgmtBaseUrl: 'https://10.50.165.193:4043/',
        // sem `req`
      },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(true)
    expect(result.lhmPost?.reqUrl).toBeUndefined()
  })

  it('mgmtBaseUrl sem barra final — url do POST deve ser construída corretamente', async () => {
    const params = makeParams({
      lhmParams: {
        sessionId: 'abc123',
        mgmtBaseUrl: 'https://10.50.165.193:4043', // sem barra final
      },
    })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(true)
    expect(result.lhmPost?.url).toBe('https://10.50.165.193:4043/lhmapi/externalAAAGuest')
  })

  it('sessionMinutes default (480) quando não fornecido', async () => {
    const params = makeParams({ sessionMinutes: undefined })
    const result = await releaseAccessLhm(params, stubConfig, logger)
    expect(result.success).toBe(true)
    const info = (result.lhmPost!.payload as { info: Record<string, unknown> }).info
    expect(info.sessionLifetime).toBe(String(480 * 60))
  })
})
