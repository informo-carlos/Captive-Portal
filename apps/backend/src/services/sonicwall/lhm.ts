// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Protocolo SonicOS 7.3.2+ (REST /lhmapi/externalAAAGuest):
//
//   1. Cliente conecta ao SSID com External Guest Auth habilitado.
//   2. SonicWall intercepta HTTP e redireciona pro nosso portal injetando:
//        sessionId, mac, ip, ufi, mgmtBaseUrl, clientRedirectUrl, req
//   3. Capturamos esses params no frontend e enviamos no request-otp.
//      Backend guarda em Redis junto com o OTP.
//   4. Após verify-otp OK, esta função decide o modo de liberação:
//
//   MODO VPN (LHM_MGMT_LAN_URL configurada):
//     Backend faz POST server-side direto pro firewall via wg0 (tunnel VPN).
//     Retorna sucesso direto pro verify-otp handler → frontend redireciona pro
//     `req` original. O navegador do usuário NÃO participa da chamada LHM.
//
//   MODO LEGADO (sem LHM_MGMT_LAN_URL, compatibilidade retroativa):
//     Retorna `lhmPost` instruction pro frontend. O frontend faz fetch no-cors
//     pro firewall — funciona porque o navegador está na LAN do cliente.
//     Sem garantia de sucesso (no-cors = sem acesso ao response status).
//
// Referência: docs/guestLHMLogin.php (fornecido pela SonicWall)
// Ver também: docs/lhm-protocol-tz570.md (protocolo CGI antigo, <= 7.2)
// Ver também: docs/wireguard-vpn-architecture.md seção 2.4 (fluxo VPN)

import { Agent as UndiciAgent } from 'undici'
import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

// Dispatcher undici que ignora cert self-signed do SonicWall.
// O SonicWall usa certificado auto-assinado na interface de management
// — aceitável aqui porque a autenticação real é feita via WireGuard PSK +
// sessId gerado pelo próprio firewall (dupla validação).
// NOTA DE REDE: o container portal precisa ter rota pra 198.18.0.0/15
// via 172.19.0.20 (container infra-wireguard) E estar na rede docker
// `external` (172.19.0.0/16). Isso é responsabilidade da infra — ver
// docs/wireguard-vpn-architecture.md seção 4.4 e docker-compose.yml.
const tunnelDispatcher = new UndiciAgent({
  connect: { rejectUnauthorized: false },
})

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

/** Detecta IPv4 privado (RFC 1918). */
function isPrivateIp(hostname: string): boolean {
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Escolhe a URL de management. SonicOS 7.x manda dois params no redirect:
 *  - `mgmtUrl`: IP LAN do firewall (ex: https://10.212.200.250:4443/)
 *  - `mgmtBaseUrl`: IP público (WAN) do firewall (ex: https://203.0.113.5:4043/)
 *
 * O navegador do cliente está na LAN, então acessar o IP LAN evita hairpin
 * NAT + regras de management na WAN. Se ambos vierem, preferimos o privado.
 * Se só um vier, usamos o que tiver.
 */
function pickMgmtBaseUrl(lhm: Record<string, string>): string | undefined {
  const candidates: string[] = []
  for (const k of ['mgmtUrl', 'mgmtBaseUrl']) {
    const v = lhm[k]
    if (typeof v === 'string' && v && isValidMgmtBaseUrl(v)) candidates.push(v)
  }
  if (candidates.length === 0) return undefined
  const privateOne = candidates.find((u) => {
    try { return isPrivateIp(new URL(u).hostname) } catch { return false }
  })
  return privateOne ?? candidates[0]
}

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}
  const sessionId = lhm['sessionId']
  // Override (Redis) tem precedência absoluta — útil pra forçar IP LAN quando
  // o SonicWall só envia o público no redirect (evita hairpin NAT).
  const overrideUrl = params.lhmMgmtUrlOverride
  const mgmtBaseUrl =
    (overrideUrl && isValidMgmtBaseUrl(overrideUrl) ? overrideUrl : undefined) ??
    pickMgmtBaseUrl(lhm)
  const reqUrl = lhm['req'] // URL original que o usuário tentou acessar

  // sessionLifetime em segundos — vem de tenants.session_duration_minutes.
  const sessionLifetimeSec = (params.sessionMinutes ?? 480) * 60

  // Normaliza o MAC: uppercase sem separadores (ex: 000E35BDC937).
  // O SonicWall usa o MAC como userName no log interno.
  const normalizedMacUserName = params.mac.replace(/[:\-]/g, '').toUpperCase()

  // ──────────────────────────────────────────────────────────────────────────
  // MODO VPN — POST server-side via WireGuard tunnel
  //
  // Quando LHM_MGMT_LAN_URL está configurada, o backend faz o POST diretamente
  // pro SonicWall via wg0. Não dependemos do browser do usuário.
  // Dispensamos a validação de sessionId+mgmtBaseUrl do redirect neste modo,
  // pois o sessionId vem do redirect do SonicWall (obrigatório) mas o
  // mgmtBaseUrl é substituído pela URL do tunnel.
  // ──────────────────────────────────────────────────────────────────────────
  const tunnelMgmtUrl = process.env['LHM_MGMT_LAN_URL']
  if (tunnelMgmtUrl) {
    if (!sessionId) {
      logger.error({ lhmKeys: Object.keys(lhm) }, 'lhm_tunnel_missing_session_id')
      return {
        success: false,
        raw: {
          error: 'missing_session_id',
          message:
            'sessId ausente nos params do redirect SonicWall. ' +
            'Conecte-se à rede Wi-Fi e tente novamente.',
        },
        mode: 'lhm',
      }
    }
    return postViaTunnel({
      mgmtUrl: tunnelMgmtUrl,
      sessionId,
      userName: normalizedMacUserName,
      sessionLifetimeSec,
      reqUrl: reqUrl || undefined,
      logger,
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODO LEGADO — instrução de POST devolvida pro frontend (no-cors)
  //
  // Compatibilidade retroativa pra tenants sem VPN configurada.
  // O navegador do usuário (dentro da LAN do cliente) faz o fetch.
  // Sem garantia de sucesso: fetch no-cors não expõe o response status.
  // ──────────────────────────────────────────────────────────────────────────

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

  // pickMgmtBaseUrl já validou via isValidMgmtBaseUrl, então não revalidamos.

  // Todos os valores são strings (conforme guestLHMLogin.php da SonicWall).
  const sessionLifetimeStr = String(sessionLifetimeSec)

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
      userName: normalizedMacUserName,
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
      usedOverride: !!overrideUrl,
      mgmtIsPrivate: isPrivateIp(new URL(mgmtBaseUrl).hostname),
      receivedMgmtUrl: !!lhm['mgmtUrl'],
      receivedMgmtBaseUrl: !!lhm['mgmtBaseUrl'],
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

// ────────────────────────────────────────────────────────────────────────────
// postViaTunnel — POST server-side pro SonicWall via WireGuard tunnel
// ────────────────────────────────────────────────────────────────────────────

interface PostViaTunnelOpts {
  /** URL base do mgmt via VPN (ex: "https://198.18.0.5:4443/"). */
  mgmtUrl: string
  sessionId: string
  /** MAC normalizado: uppercase sem separadores (ex: "000E35BDC937"). */
  userName: string
  sessionLifetimeSec: number
  /** URL original que o usuário tentou acessar — frontend redireciona pra cá. */
  reqUrl?: string
  logger: FastifyBaseLogger
}

async function postViaTunnel(opts: PostViaTunnelOpts): Promise<ReleaseAccessResult> {
  const base = opts.mgmtUrl.endsWith('/') ? opts.mgmtUrl : opts.mgmtUrl + '/'
  const url = new URL('lhmapi/externalAAAGuest', base).toString()

  const sessionLifetimeStr = String(opts.sessionLifetimeSec)
  const body = JSON.stringify({
    info: {
      action: 1,
      sessId: opts.sessionId,
      userName: opts.userName,
      sessionLifetime: sessionLifetimeStr,
      idleTimeout: '1800',
      maxRx: '0',
      maxTx: '0',
      quotaCycleType: '0',
      cycleSessionLifeTime: sessionLifetimeStr,
      cycleMaxRx: '0',
      cycleMaxTx: '0',
    },
  })

  opts.logger.info(
    {
      url,
      sessionLifetimeSec: opts.sessionLifetimeSec,
      hasReqUrl: !!opts.reqUrl,
    },
    'lhm_tunnel_post_starting',
  )

  const start = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // undici dispatcher ignora cert self-signed do SonicWall.
      // @ts-expect-error — `dispatcher` é propriedade do undici fetch (não está nos tipos globais do Node)
      dispatcher: tunnelDispatcher,
    })

    const text = await response.text()
    const dur = Date.now() - start

    let parsed: { code?: string; message?: string } = {}
    try {
      parsed = JSON.parse(text) as { code?: string; message?: string }
    } catch {
      // body não é JSON — SonicWall antigo pode retornar texto plano
    }

    // Código "50" = sucesso no SonicOS LHM REST (guestLHMLogin.php linha ~180)
    if (parsed.code === '50') {
      opts.logger.info(
        { duration_ms: dur, code: parsed.code },
        'lhm_tunnel_post_success',
      )
      return {
        success: true,
        mode: 'lhm',
        raw: { protocol: 'lhm_via_vpn', duration_ms: dur, code: parsed.code },
        // Modo VPN: sem lhmPost — backend já fez o POST.
        // Frontend deve redirecionar pro reqUrl original (ou /success).
        redirectUrl: opts.reqUrl,
      }
    }

    opts.logger.error(
      {
        duration_ms: dur,
        http_status: response.status,
        body_preview: text.slice(0, 200),
        code: parsed.code,
      },
      'lhm_tunnel_post_failed',
    )
    return {
      success: false,
      mode: 'lhm',
      raw: {
        protocol: 'lhm_via_vpn',
        duration_ms: dur,
        http_status: response.status,
        body_preview: text.slice(0, 200),
        code: parsed.code,
      },
    }
  } catch (err) {
    const dur = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    opts.logger.error(
      { duration_ms: dur, error: msg },
      'lhm_tunnel_post_error',
    )
    return {
      success: false,
      mode: 'lhm',
      raw: { protocol: 'lhm_via_vpn', error: msg, duration_ms: dur },
    }
  }
}
