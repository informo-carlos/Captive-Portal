// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo real (mapeado via django-sonicwall + kdaveid/CaptivePortal.MockServer):
//
//   1. Cliente conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro nosso portal injetando
//      query params: sessionId, mac, ip, ufi, mgmtBaseUrl, clientRedirectUrl, req
//   3. Capturamos no frontend, mandamos no body do request-otp, backend
//      guarda em Redis junto com o OTP.
//   4. Após verify-otp OK, esta função NÃO faz chamada alguma ao SonicWall.
//      Em vez disso, constrói um payload `LhmBrowserSubmit` que o frontend
//      vai usar pra disparar POSTs fire-and-forget direto do navegador do
//      usuário (que está DENTRO da rede do cliente).
//   5. Frontend executa `fetch(url, { method:'POST', mode:'no-cors', body })`
//      pra cada URL candidata em paralelo. A resposta é XML
//      (<SonicWALLAccessGatewayParam><AuthenticationReply><ResponseCode>50
//      </ResponseCode>...) mas como é no-cors, JS não lê — a gente confia
//      que pelo menos um POST deu certo.
//   6. Frontend faz `window.location.href = req` — se o SW autorizou o MAC,
//      o request passa; se não, cai no captive portal de novo.
//
// Por que múltiplas URLs candidatas? Porque a SonicWall quebrou
// `externalGuestLogin.cgi` em 7.3.2+ e a gente não sabe exatamente onde o
// endpoint "novo" vive. A gente dispara em todas as variantes razoáveis e
// torce que uma sobreviva. Fire-and-forget é barato — 5-10 POSTs extras não
// atrapalham ninguém e o browser nem espera resposta.
//
// Ver: docs/lhm-protocol-tz570.md

import type { FastifyBaseLogger } from 'fastify'
import type {
  LhmBrowserSubmit,
  ReleaseAccessParams,
  ReleaseAccessResult,
  SonicwallConfig,
} from './index'

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

const MAX_BASE_URL_LENGTH = 512
const MAX_CANDIDATE_URLS = 12

/**
 * Paths tentados em cada base. A SonicWall historicamente serve
 * `externalGuestLogin.cgi` na raiz — é o único path documentado. Em 7.3.2+
 * ele retorna 404, então a gente dispara também em variantes razoáveis pra
 * cobrir o caso do endpoint ter sido movido silenciosamente.
 */
const CANDIDATE_PATHS = [
  // SonicOS 7.3.2+: os CGIs foram REMOVIDOS e o suporte oficial
  // orientou a usar este endpoint REST. É o candidato primário.
  'lhmapi/externalGuest',
  // Legado (7.1.x e anteriores) — mantido como fallback.
  'externalGuestLogin.cgi',
  'cgi-bin/externalGuestLogin.cgi',
  'sonicui/7/externalGuestLogin.cgi',
  'externalGuestUpdateSession.cgi',
] as const

function isValidBaseUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_BASE_URL_LENGTH) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (!url.hostname) return false
  return true
}

/**
 * Constrói todas as URLs candidatas a partir das bases fornecidas pelo SW.
 * Deduplica e limita o total — fire-and-forget é barato mas não infinito.
 */
function buildCandidateUrls(bases: string[]): string[] {
  const urls = new Set<string>()
  for (const rawBase of bases) {
    if (!isValidBaseUrl(rawBase)) continue
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
    for (const path of CANDIDATE_PATHS) {
      try {
        urls.add(new URL(path, base).toString())
      } catch {
        // base inválida — ignora e segue pras próximas
      }
      if (urls.size >= MAX_CANDIDATE_URLS) break
    }
    if (urls.size >= MAX_CANDIDATE_URLS) break
  }
  return Array.from(urls)
}

/** `req` do SW é a URL original que o usuário tentou acessar. Fallback seguro. */
function pickRedirectTarget(req: string | undefined): string {
  if (req && /^https?:\/\//i.test(req) && req.length <= 2048) return req
  // Fallback: a página de detecção de captive portal do Android/iOS.
  // Se o SW autorizou o MAC, essa página volta 204, o OS detecta internet
  // disponível e dispensa o captive prompt automaticamente.
  return 'http://connectivitycheck.gstatic.com/generate_204'
}

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}
  const sessionId = lhm['sessionId']
  const clientRedirectUrl = lhm['clientRedirectUrl']
  const mgmtBaseUrl = lhm['mgmtBaseUrl']

  // Sem sessionId + pelo menos uma base, não há LHM possível.
  if (!sessionId || (!clientRedirectUrl && !mgmtBaseUrl)) {
    logger.error({ lhmKeys: Object.keys(lhm) }, 'lhm_missing_redirect_params')
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

  // clientRedirectUrl é a interface do *user portal* (ex: http://IP:8080),
  // geralmente alcançável pela VLAN guest. mgmtBaseUrl é a interface de
  // *gerência* (ex: https://IP:4043), frequentemente BLOQUEADA pra guest.
  // A gente coloca clientRedirectUrl primeiro porque tem mais chance de
  // sobreviver às access rules do cliente, mas dispara nas duas.
  const bases = [clientRedirectUrl, mgmtBaseUrl].filter(Boolean) as string[]
  const urls = buildCandidateUrls(bases)

  if (urls.length === 0) {
    logger.error({ lhmKeys: Object.keys(lhm) }, 'lhm_no_valid_candidate_urls')
    return {
      success: false,
      raw: {
        error: 'invalid_lhm_base_url',
        message: 'Nenhuma URL base válida no redirect do SonicWall.',
      },
      mode: 'lhm',
    }
  }

  const sessionLifetimeSec = (params.sessionMinutes ?? 480) * 60
  const idleTimeoutSec = 30 * 60

  const lhmSubmit: LhmBrowserSubmit = {
    urls,
    body: {
      sessId: sessionId,
      userName: params.mac, // SonicWall aceita o MAC como userName
      sessionLifetime: String(sessionLifetimeSec),
      idleTimeout: String(idleTimeoutSec),
    },
    redirectTo: pickRedirectTarget(lhm['req']),
  }

  logger.info(
    {
      lhmKeys: Object.keys(lhm),
      candidateCount: urls.length,
      sessionLifetimeSec,
      idleTimeoutSec,
      // Lista completa de URLs candidatas no log pra debug do workaround.
      // sessId é efêmero (válido por minutos); IPs são internos do cliente.
      candidateUrls: urls,
      redirectTo: lhmSubmit.redirectTo,
    },
    'lhm_submit_built',
  )

  return {
    success: true,
    raw: {
      protocol: 'lhm',
      sessionLifetimeSec,
      idleTimeoutSec,
      candidateCount: urls.length,
      lhmKeys: Object.keys(lhm),
    },
    mode: 'lhm',
    lhmSubmit,
  }
}
