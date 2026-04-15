// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo oficial (docs SonicWall, REST API for External Guest Authentication):
//
//   1. Guest conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro portal injetando
//      query params: ssid, sessionId, ip, mac, ufi, mgmtBaseUrl,
//      clientRedirectUrl, req (e opcionalmente hmac).
//   3. Portal captura, manda OTP, valida.
//   4. Precisa chegar no firewall:
//        POST {mgmtBaseUrl}/lhmapi/externalAAAGuest
//        Content-Type: application/json
//        { info: { action: 1, sessId, userName, sessionLifetime, ... } }
//   5. SonicWall responde { code: "50", ... } se autorizou.
//
// IMPORTANTE: o endpoint é `externalAAAGuest` (AAA = Authentication,
// Authorization, Accounting) — NÃO `externalGuest`. Os CGIs antigos
// (externalGuestLogin.cgi) foram removidos no SonicOS 7.3.2.
//
// ── ESTRATÉGIA ATUAL: browser-submit ────────────────────────────────
//
// O backend NÃO faz o POST. Nossa VPS está na internet pública, o
// mgmtBaseUrl do SW é IP privado da LAN do cliente — sem VPN a rota
// simplesmente não existe. Em vez disso:
//
//   a. Backend monta `info` + HMAC (chave secreta fica só no backend).
//   b. Backend devolve pro frontend um payload `LhmBrowserSubmit` com as
//      URLs candidatas + body pronto (JSON stringified).
//   c. Frontend (browser do guest, que ESTÁ na LAN) dispara
//      `fetch(url, { method:'POST', mode:'no-cors', body })` em paralelo
//      pras URLs candidatas. Content-Type=text/plain pra evitar preflight
//      CORS (simple request).
//   d. Frontend espera ~500ms e redireciona pro `req` original.
//
// Limitações conhecidas:
//   - Com `mode:'no-cors'`, JS NÃO lê a resposta. Se o SW rejeitar
//     (code != "50"), o guest continua bloqueado e a gente não sabe.
//   - HTTPS no mgmtBaseUrl usa cert self-signed → browser rejeita
//     silenciosamente. Usamos clientRedirectUrl (HTTP) primeiro como
//     fallback sem cert issue.
//
// Limitações do SonicOS 7.3.2 pro payload:
//   - sessionLifetime ∈ (0, 9999]
//   - idleTimeout ∈ [60, sessionLifetime)
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

  // Candidatos em ordem de preferência:
  //   1. clientRedirectUrl — HTTP, sem cert issue (provavelmente IP do
  //      X0/LAN do SW em porta 8080).
  //   2. mgmtBaseUrl — HTTPS self-signed (browser deve rejeitar mas a
  //      gente dispara mesmo assim, zero custo).
  const candidates: string[] = []
  const clientRedirectUrl = normalizeBaseUrl(lhm['clientRedirectUrl'] ?? '')
  const mgmtBaseUrl = normalizeBaseUrl(mgmtBaseUrlRaw)
  if (clientRedirectUrl) candidates.push(`${clientRedirectUrl}/${LHM_API_PATH}`)
  if (mgmtBaseUrl) candidates.push(`${mgmtBaseUrl}/${LHM_API_PATH}`)

  if (candidates.length === 0) {
    logger.error({ mgmtBaseUrlRaw }, 'lhm_no_valid_urls')
    return {
      success: false,
      raw: {
        error: 'invalid_mgmt_base_url',
        message: 'mgmtBaseUrl/clientRedirectUrl inválidos no redirect do SonicWall.',
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
  // habilitado (chave configurada via TENANT_SW_LHM_HMAC_KEY).
  if (config.lhmHmacKey) {
    const algo = config.lhmHmacAlgo ?? 'sha256'
    info.hmac = calcLoginHmac(info, algo, config.lhmHmacKey)
  }

  const body = JSON.stringify({ info })
  const redirectTo = pickLhmRedirectTarget(lhm['req'])

  logger.info(
    {
      candidates,
      sessId: sessionId,
      sessionLifetimeSec,
      idleTimeoutSec,
      hmacUsed: Boolean(info.hmac),
      redirectTo,
    },
    'lhm_browser_submit_built',
  )

  // Retornamos success=true porque o payload foi montado com sucesso.
  // O verdadeiro sucesso (SW autorizou o MAC) a gente só saberá depois
  // que o browser do guest tentar — e mesmo assim no-cors esconde o
  // resultado. O `wifi_sessions.sonicwall_raw` guarda o que enviamos
  // pra auditoria.
  return {
    success: true,
    raw: {
      protocol: 'lhm',
      strategy: 'browser-submit',
      candidates,
      sessionLifetimeSec,
      idleTimeoutSec,
      hmacUsed: Boolean(info.hmac),
    },
    mode: 'lhm',
    browserSubmit: {
      urls: candidates,
      body,
      redirectTo,
    },
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
