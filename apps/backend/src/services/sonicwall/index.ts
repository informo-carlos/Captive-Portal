// Padrão Strategy — sempre importar releaseAccess() daqui.
// Seleciona a estratégia com base em SONICWALL_MODE (env).

import type { FastifyBaseLogger } from 'fastify'
import { releaseAccessRest } from './rest-api'
import { releaseAccessLhm, pickLhmRedirectTarget } from './lhm'

export { pickLhmRedirectTarget }

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

export interface LhmBrowserSubmit {
  /** URLs candidatas pro POST (ordem de preferência). */
  urls: string[]
  /** Body JSON já serializado; frontend envia como text/plain (simple request). */
  body: string
  /** Pra onde redirecionar o guest após disparar os POSTs. */
  redirectTo: string
}

export interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  mode: 'rest' | 'lhm'
  /**
   * Presente apenas em modo LHM com estratégia browser-submit: backend
   * monta o payload, frontend (dentro da LAN) dispara o POST.
   */
  browserSubmit?: LhmBrowserSubmit
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
  /**
   * Chave secreta pro HMAC do LHM (Message Authentication na UI do SW).
   * Opcional — só preencher se o firewall tiver habilitado.
   */
  lhmHmacKey?: string
  lhmHmacAlgo?: 'md5' | 'sha1' | 'sha256'
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
