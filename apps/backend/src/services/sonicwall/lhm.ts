// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo (mapeado a partir da KB SonicWall + django-sonicwall + LHM FAQ):
//
//   1. Cliente conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro nosso portal injetando:
//        sessionId, mac, ip, ufi, mgmtBaseUrl, clientRedirectUrl, req
//   3. Capturamos esses params no frontend e enviamos no request-otp.
//      Backend guarda em Redis junto com o OTP.
//   4. Após verify-otp OK, esta função MONTA a URL de retorno:
//        ${mgmtBaseUrl}externalGuestLogin.cgi?sessId=...&userName=<mac>
//          &sessionLifetime=<sec>&idleTimeout=<sec>
//   5. Devolve essa URL no `redirectUrl`. O frontend faz `window.location`
//      pra ela. Como o navegador do usuário está DENTRO da rede do cliente,
//      ele alcança o gateway local — nossa VPS NUNCA toca no SonicWall.
//   6. SonicWall valida o sessId, libera o acesso e redireciona o usuário
//      pro `req` original.
//
// Ver: docs/lhm-protocol-tz570.md

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

/**
 * Nomes dos query params que SonicWalls em modo External Guest Auth injetam
 * no redirect inicial. Capturamos qualquer um que vier — só sessionId e
 * mgmtBaseUrl são obrigatórios.
 */
export const KNOWN_LHM_PARAM_NAMES = [
  'sessionId',
  'ip',
  'mac',
  'ufi',
  'mgmtBaseUrl',
  'clientRedirectUrl',
  'req',
  'cc',
] as const

/** Limite do path do mgmtBaseUrl pra evitar SSRF/abuso. */
const MAX_MGMT_BASE_URL_LENGTH = 512

function isValidMgmtBaseUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_MGMT_BASE_URL_LENGTH) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  // SonicWall sempre injeta hostname/IP — rejeita URLs sem host
  if (!url.hostname) return false
  return true
}

function buildExternalGuestLoginUrl(
  mgmtBaseUrl: string,
  sessionId: string,
  userName: string,
  sessionLifetimeSec: number,
  idleTimeoutSec: number,
): string {
  // Garante que mgmtBaseUrl termina com `/` antes de concatenar
  const base = mgmtBaseUrl.endsWith('/') ? mgmtBaseUrl : `${mgmtBaseUrl}/`
  const url = new URL('externalGuestLogin.cgi', base)
  url.searchParams.set('sessId', sessionId)
  url.searchParams.set('userName', userName)
  url.searchParams.set('sessionLifetime', String(sessionLifetimeSec))
  url.searchParams.set('idleTimeout', String(idleTimeoutSec))
  return url.toString()
}

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}
  const sessionId = lhm['sessionId']
  // Preferimos clientRedirectUrl sobre mgmtBaseUrl: o externalGuestLogin.cgi
  // vive na porta do *portal do usuário* (ex: :444), não na porta de
  // gerência (:4043). Em firmware TZ 7.x a porta de mgmt frequentemente
  // não responde ao endpoint de auth de guest. mgmtBaseUrl é fallback.
  const mgmtBaseUrl = lhm['clientRedirectUrl'] || lhm['mgmtBaseUrl']
  logger.info(
    {
      hasClientRedirect: !!lhm['clientRedirectUrl'],
      hasMgmtBase: !!lhm['mgmtBaseUrl'],
      chosen: lhm['clientRedirectUrl'] ? 'clientRedirectUrl' : 'mgmtBaseUrl',
    },
    'lhm_base_url_chosen',
  )

  // Sem sessionId+baseUrl não há LHM possível: usuário chegou no portal
  // sem passar pelo SonicWall (ex: digitou o IP direto).
  if (!sessionId || !mgmtBaseUrl) {
    logger.error(
      { lhmKeys: Object.keys(lhm) },
      'lhm_missing_redirect_params',
    )
    return {
      success: false,
      raw: {
        error: 'missing_lhm_params',
        message:
          'Esta sessão não foi iniciada via redirect do SonicWall. ' +
          'Conecte-se à rede Wi-Fi e tente novamente.',
      },
      mode: 'lhm',
    }
  }

  if (!isValidMgmtBaseUrl(mgmtBaseUrl)) {
    logger.error({ lhmKeys: Object.keys(lhm) }, 'lhm_invalid_mgmt_base_url')
    return {
      success: false,
      raw: {
        error: 'invalid_mgmt_base_url',
        message: 'mgmtBaseUrl inválido no redirect do SonicWall.',
      },
      mode: 'lhm',
    }
  }

  // sessionLifetime e idleTimeout em segundos.
  // sessionMinutes vem do tenant; idleTimeout fixo em 30min (default razoável).
  const sessionLifetimeSec = (params.sessionMinutes ?? 480) * 60
  const idleTimeoutSec = 30 * 60

  const redirectUrl = buildExternalGuestLoginUrl(
    mgmtBaseUrl,
    sessionId,
    params.mac, // SonicWall aceita o MAC como userName
    sessionLifetimeSec,
    idleTimeoutSec,
  )

  logger.info(
    {
      lhmKeys: Object.keys(lhm),
      sessionLifetimeSec,
      idleTimeoutSec,
      // Útil pra debug end-to-end. sessId é efêmero e mgmtBaseUrl é IP interno.
      redirectUrl,
    },
    'lhm_redirect_built',
  )

  return {
    success: true,
    raw: {
      protocol: 'lhm',
      sessionLifetimeSec,
      idleTimeoutSec,
      // Não logamos sessionId/mgmtBaseUrl aqui — vão pro DB criptografado/raw
      // só com as keys presentes.
      lhmKeys: Object.keys(lhm),
    },
    mode: 'lhm',
    redirectUrl,
  }
}
