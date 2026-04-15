// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo oficial (docs SonicWall, REST API for External Guest Authentication):
//
//   1. Guest conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro portal injetando
//      query params: ssid, sessionId, ip, mac, ufi, mgmtBaseUrl,
//      clientRedirectUrl, req (e opcionalmente hmac).
//   3. Portal captura, manda OTP, valida.
//   4. Backend (ESTE código) faz POST pro firewall:
//        POST {mgmtBaseUrl}/lhmapi/externalAAAGuest
//        Content-Type: application/json
//        { info: { action: 1, sessId, userName, sessionLifetime,
//                  idleTimeout, maxRx, maxTx, quotaCycleType, ... } }
//   5. SonicWall responde { code: "50", message: "..." } se autorizou.
//   6. Backend retorna success pro frontend → frontend redireciona guest
//      pra URL `req` original.
//
// IMPORTANTE: o endpoint é `externalAAAGuest` (AAA = Authentication,
// Authorization, Accounting) — NÃO `externalGuest`. Os CGIs antigos
// (externalGuestLogin.cgi etc.) foram removidos no SonicOS 7.3.2.
//
// Requisito de rede: o backend precisa alcançar {mgmtBaseUrl} — geralmente
// IP privado do SW. Em produção isso exige VPN/túnel entre VPS e LAN do
// cliente. Sem credenciais de admin do SW — só rota IP.
//
// Limitações conhecidas do SonicOS 7.3.2:
//   - sessionLifetime ∈ (0, 9999]
//   - idleTimeout ∈ (0, sessionLifetime]
//   - cycleSessionLifeTime ∈ [0, 9999]
//   - HMAC pode ser habilitado na UI (Zone Settings → Message Authentication)
//
// Ver: docs/lhm-protocol-tz570.md

import { createHmac } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import type {
  ReleaseAccessParams,
  ReleaseAccessResult,
  SonicwallConfig,
} from './index'

export const KNOWN_LHM_PARAM_NAMES = [
  'ssid',
  'sessionId',
  'ip',
  'mac',
  'ufi',
  'mgmtBaseUrl',
  'clientRedirectUrl',
  'req',
  'hmac',
  'cc',
] as const

const LHM_API_PATH = 'lhmapi/externalAAAGuest'
const POST_TIMEOUT_MS = 10_000

// Limites da backend API em SonicOS 7.3.2.
const MAX_SESSION_LIFETIME_SEC = 9999
const MIN_IDLE_TIMEOUT_SEC = 60
const DEFAULT_IDLE_TIMEOUT_SEC = 1800

// Códigos de resposta do firewall (tabela 1.5 da doc oficial).
const RESPONSE_CODE_SUCCESS = '50'

interface LhmInfo {
  action: 1 | 2 | 3 | 4
  sessId: string
  userName: string
  sessionLifetime: string
  idleTimeout: string
  maxRx: string
  maxTx: string
  quotaCycleType: string
  cycleSessionLifeTime: string
  cycleMaxRx: string
  cycleMaxTx: string
  hmac?: string
  passwd?: string
}

interface LhmResponse {
  code?: string
  message?: string
}

function normalizeBaseUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function clampSessionLifetime(seconds: number): number {
  if (seconds <= 0) return MAX_SESSION_LIFETIME_SEC
  if (seconds > MAX_SESSION_LIFETIME_SEC) return MAX_SESSION_LIFETIME_SEC
  return seconds
}

function clampIdleTimeout(idleSec: number, sessionSec: number): number {
  const candidate = Math.max(idleSec, MIN_IDLE_TIMEOUT_SEC)
  if (candidate >= sessionSec) {
    return Math.max(MIN_IDLE_TIMEOUT_SEC, sessionSec - 1)
  }
  return candidate
}

/**
 * HMAC do login (action=1): concatena os campos na ordem exata documentada.
 * O username é URL-encoded antes de entrar no cálculo.
 */
function calcLoginHmac(info: LhmInfo, algo: string, key: string): string {
  const text =
    info.sessId +
    encodeURIComponent(info.userName) +
    info.sessionLifetime +
    info.idleTimeout +
    info.maxRx +
    info.maxTx +
    info.quotaCycleType +
    info.cycleSessionLifeTime +
    info.cycleMaxRx +
    info.cycleMaxTx
  return createHmac(algo, key).update(text).digest('hex')
}

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}
  const sessionId = lhm['sessionId']
  const mgmtBaseUrlRaw = lhm['mgmtBaseUrl']

  if (!sessionId || !mgmtBaseUrlRaw) {
    logger.error(
      { lhmKeys: Object.keys(lhm) },
      'lhm_missing_redirect_params',
    )
    return {
      success: false,
      raw: {
        error: 'missing_lhm_params',
        message:
          'Sessão sem parâmetros LHM do SonicWall (sessionId/mgmtBaseUrl). ' +
          'Conecte-se à rede Wi-Fi novamente.',
      },
      mode: 'lhm',
    }
  }

  const mgmtBaseUrl = normalizeBaseUrl(mgmtBaseUrlRaw)
  if (!mgmtBaseUrl) {
    logger.error({ mgmtBaseUrlRaw }, 'lhm_invalid_mgmt_base_url')
    return {
      success: false,
      raw: {
        error: 'invalid_mgmt_base_url',
        message: 'mgmtBaseUrl inválido no redirect do SonicWall.',
      },
      mode: 'lhm',
    }
  }

  const sessionLifetimeSec = clampSessionLifetime(
    (params.sessionMinutes ?? 480) * 60,
  )
  const idleTimeoutSec = clampIdleTimeout(
    DEFAULT_IDLE_TIMEOUT_SEC,
    sessionLifetimeSec,
  )

  const info: LhmInfo = {
    action: 1,
    sessId: sessionId,
    userName: params.mac,
    sessionLifetime: String(sessionLifetimeSec),
    idleTimeout: String(idleTimeoutSec),
    maxRx: '0',
    maxTx: '0',
    quotaCycleType: '0',
    cycleSessionLifeTime: '0',
    cycleMaxRx: '0',
    cycleMaxTx: '0',
  }

  // HMAC opcional — só preencher se o firewall tiver Message Authentication
  // habilitado (configurado via env LHM_HMAC_KEY/LHM_HMAC_ALGO no tenant).
  if (config.lhmHmacKey) {
    const algo = config.lhmHmacAlgo ?? 'sha256'
    info.hmac = calcLoginHmac(info, algo, config.lhmHmacKey)
  }

  const url = `${mgmtBaseUrl}/${LHM_API_PATH}`
  const body = JSON.stringify({ info })

  logger.info(
    {
      url,
      sessId: sessionId,
      sessionLifetimeSec,
      idleTimeoutSec,
      hmacUsed: Boolean(info.hmac),
    },
    'lhm_post_starting',
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS)

  let responseText = ''
  let responseStatus = 0
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
    responseStatus = resp.status
    responseText = await resp.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ url, error: message }, 'lhm_post_network_error')
    return {
      success: false,
      raw: { error: 'network_error', url, message },
      mode: 'lhm',
    }
  } finally {
    clearTimeout(timeout)
  }

  let parsed: LhmResponse = {}
  try {
    parsed = JSON.parse(responseText) as LhmResponse
  } catch {
    logger.error(
      { url, responseStatus, responseText: responseText.slice(0, 500) },
      'lhm_post_invalid_json',
    )
    return {
      success: false,
      raw: { error: 'invalid_response', responseStatus, responseText },
      mode: 'lhm',
    }
  }

  const success = parsed.code === RESPONSE_CODE_SUCCESS

  logger.info(
    {
      url,
      responseStatus,
      code: parsed.code,
      message: parsed.message,
      success,
    },
    success ? 'lhm_post_success' : 'lhm_post_rejected',
  )

  return {
    success,
    raw: {
      protocol: 'lhm',
      url,
      responseStatus,
      code: parsed.code,
      message: parsed.message,
      sessionLifetimeSec,
      idleTimeoutSec,
    },
    mode: 'lhm',
  }
}

/**
 * Redirect target pra onde o guest vai depois do LHM bem-sucedido. Usa o `req`
 * original do SW quando válido, senão cai pro probe do Android/iOS que detecta
 * internet disponível e dispensa o captive prompt.
 */
export function pickLhmRedirectTarget(req: string | undefined): string {
  if (req && /^https?:\/\//i.test(req) && req.length <= 2048) return req
  return 'http://connectivitycheck.gstatic.com/generate_204'
}
