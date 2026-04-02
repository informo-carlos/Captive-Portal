// Padrão Strategy — sempre importar releaseAccess() daqui.
// Seleciona a estratégia com base em SONICWALL_MODE (env).

import type { FastifyBaseLogger } from 'fastify'
import { releaseAccessRest } from './rest-api'
import { releaseAccessLhm } from './lhm'

export interface ReleaseAccessParams {
  mac: string
  ip: string
  phone: string
  sessionMinutes?: number
}

export interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  mode: 'rest' | 'lhm'
}

export interface SonicwallConfig {
  host: string
  user: string
  pass: string
  firmware: '6' | '7'
  mode: 'rest' | 'lhm'
  lhmPort: number
  guestServiceUser: string
  guestServicePass: string
}

export async function releaseAccess(
  params: ReleaseAccessParams,
  config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  if (config.mode === 'lhm') {
    return releaseAccessLhm(params, config, logger)
  }
  return releaseAccessRest(params, config, logger)
}
