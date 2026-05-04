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
  /**
   * Override de mgmtBaseUrl. Útil quando o SonicWall só envia o IP público
   * no redirect mas queremos forçar o IP LAN (evita hairpin NAT).
   * Lido pelo handler de verify-otp via Redis (chave `lhm:mgmt_override:<tenantId>`).
   * Formato: URL completa (ex: `https://10.212.200.250:4443/`).
   */
  lhmMgmtUrlOverride?: string
}

export interface LhmPostInstruction {
  url: string
  payload: Record<string, unknown>
  /**
   * URL original que o usuário tentou acessar (param `req` do redirect
   * inicial). O frontend redireciona pra cá após o POST ao firewall.
   */
  reqUrl?: string
}

export interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  mode: 'rest' | 'lhm'
  /**
   * @deprecated Mantido só pra compat — em LHM 7.3+ use lhmPost.
   * URL pra qual o navegador devia redirecionar (protocolo CGI antigo,
   * SonicOS <= 7.2).
   */
  redirectUrl?: string
  /**
   * Quando preenchido, o frontend deve fazer POST cross-origin pro firewall
   * e depois redirecionar o navegador pra reqUrl (ou /success).
   * É o caminho do LHM 7.3+: browser do usuário (na LAN do cliente) envia
   * o JSON diretamente pro gateway — nossa VPS NUNCA toca no SonicWall.
   */
  lhmPost?: LhmPostInstruction
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
