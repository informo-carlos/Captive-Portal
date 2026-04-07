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
  /**
   * Parâmetros opcionais que o SonicWall injeta no redirect inicial quando
   * em modo "External Guest Authentication" (LHM). Capturados pelo
   * serial-guard e armazenados no Redis junto com a sessão OTP.
   * Cada firmware injeta um conjunto ligeiramente diferente — guardamos tudo
   * como dicionário pra não acoplar ao formato.
   */
  lhmParams?: Record<string, string>
}

export interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  mode: 'rest' | 'lhm'
  /**
   * Quando preenchido, o frontend deve redirecionar o navegador do usuário
   * pra essa URL (em vez de mostrar "acesso liberado"). É o caminho do LHM:
   * o próprio browser do usuário, dentro da rede do cliente, fala com o
   * gateway local e confirma a autenticação. A nossa VPS NUNCA toca no
   * SonicWall do cliente.
   */
  redirectUrl?: string
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
