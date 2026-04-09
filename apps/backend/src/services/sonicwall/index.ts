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

/**
 * Instrução pro frontend executar o passo final do LHM diretamente do browser
 * do usuário. O browser está DENTRO da rede do cliente, então alcança o
 * SonicWall (a VPS não precisa — e não deve — falar com o SW).
 *
 * O frontend dispara `fetch(url, { method: 'POST', mode: 'no-cors', body })`
 * em paralelo pra cada URL candidata e, em seguida, faz `window.location.href
 * = redirectTo` pra onde o usuário queria ir. Se pelo menos uma das URLs
 * funcionou, o SonicWall já autorizou o MAC e o redirect passa.
 *
 * O modo `no-cors` torna o POST uma "simple request" do CORS (content-type
 * url-encoded não dispara preflight) — o browser manda, o SW processa, a
 * resposta XML volta como opaque (JS não lê, mas a gente não precisa).
 */
export interface LhmBrowserSubmit {
  urls: string[]
  body: {
    sessId: string
    userName: string
    sessionLifetime: string
    idleTimeout: string
  }
  redirectTo: string
}

export interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  mode: 'rest' | 'lhm'
  /**
   * Quando preenchido, o frontend dispara POSTs fire-and-forget pro SonicWall
   * a partir do próprio browser do usuário. Ver `LhmBrowserSubmit`.
   */
  lhmSubmit?: LhmBrowserSubmit
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
