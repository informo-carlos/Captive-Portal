// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo SonicOS 7.3.2+ (REST /lhmapi/externalAAAGuest):
//
//   1. Cliente conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro nosso portal injetando:
//        sessionId, mac, ip, ufi, mgmtBaseUrl, clientRedirectUrl, req
//   3. Capturamos esses params no frontend e enviamos no request-otp.
//      Backend guarda em Redis junto com o OTP.
//   4. Após verify-otp OK, esta função MONTA a instrução de POST:
//        url:     ${mgmtBaseUrl}lhmapi/externalAAAGuest
//        payload: { info: { action: 1, sessId, userName, sessionLifetime, ... } }
//   5. Devolve `lhmPost` no resultado. O frontend faz fetch no-cors pro
//      firewall — como o navegador do usuário está DENTRO da rede do cliente,
//      ele alcança o gateway local. A nossa VPS NUNCA toca no SonicWall.
//   6. SonicWall valida o sessId, libera o acesso e o frontend redireciona
//      pra `reqUrl` (URL original) ou /success.
//
// Referência: docs/guestLHMLogin.php (fornecido pela SonicWall)
// Ver também: docs/lhm-protocol-tz570.md (protocolo CGI antigo, <= 7.2)

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

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

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}
  const sessionId = lhm['sessionId']
  const mgmtBaseUrl = lhm['mgmtBaseUrl']
  const reqUrl = lhm['req'] // URL original que o usuário tentou acessar

  // Sem sessionId+mgmtBaseUrl não há LHM possível: usuário chegou no portal
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

  // sessionLifetime em segundos — vem de tenants.session_duration_minutes.
  // Todos os valores são strings (conforme guestLHMLogin.php da SonicWall).
  const sessionLifetimeSec = (params.sessionMinutes ?? 480) * 60
  const sessionLifetimeStr = String(sessionLifetimeSec)

  // Normaliza o MAC: uppercase sem separadores (ex: 000E35BDC937).
  // O SonicWall usa o MAC como userName no log interno.
  const userName = params.mac.replace(/[:\-]/g, '').toUpperCase()

  // Monta a URL do endpoint REST do SonicOS 7.3.2+
  const base = mgmtBaseUrl.endsWith('/') ? mgmtBaseUrl : mgmtBaseUrl + '/'
  const postUrl = base + 'lhmapi/externalAAAGuest'

  // Monta o body JSON seguindo guestLHMLogin.php (linhas 155-175).
  // Todos os valores numéricos são strings — o parser do firmware é tolerante
  // mas o PHP de referência usa strings, então mantemos o mesmo padrão.
  //
  // TODO (Phase 2 — HMAC): Se o tenant tiver `hmacKey` configurado, calcular:
  //   const text = sessionId + urlencode(userName) + sessionLifetimeStr +
  //                idleTimeout + maxRx + maxTx + quotaCycleType +
  //                cycleSessionLifeTime + cycleMaxRx + cycleMaxTx
  //   const lhmHmac = createHmac('sha256', hmacKey).update(text).digest('hex')
  //   payload.info.hmac = lhmHmac
  //
  // O firmware padrão NÃO exige HMAC — Phase 1/2 só rodam se o SonicWall
  // foi configurado com "HMAC Authentication" e o redirect inicial vier com
  // ?hmac= preenchido (veja guestLHMLogin.php linhas 39-76 e 130-150).
  // Nosso serial-guard já valida o serial do firewall, então não precisamos
  // da Phase 1 (validação do redirect entrante).
  const payload: Record<string, unknown> = {
    info: {
      action: 1,
      sessId: sessionId,
      userName,
      sessionLifetime: sessionLifetimeStr,
      idleTimeout: '1800',
      maxRx: '0',
      maxTx: '0',
      quotaCycleType: '0',
      cycleSessionLifeTime: sessionLifetimeStr,
      cycleMaxRx: '0',
      cycleMaxTx: '0',
    },
  }

  logger.info(
    {
      postUrl,
      sessIdPresent: !!sessionId,
      sessionLifetimeSec,
      hasReqUrl: !!reqUrl,
    },
    'lhm_post_built',
  )

  return {
    success: true,
    raw: {
      protocol: 'lhm_rest',
      sessionLifetimeSec,
      lhmKeys: Object.keys(lhm),
    },
    mode: 'lhm',
    lhmPost: {
      url: postUrl,
      payload,
      reqUrl: reqUrl || undefined,
    },
  }
}
