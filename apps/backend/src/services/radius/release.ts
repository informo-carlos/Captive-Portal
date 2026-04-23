// Strategy RADIUS pro verify-otp — shape equivalente ao sonicwall/releaseAccess.
//
// Fluxo após OTP validado:
//   1. SET radius:authorized:<tenant>:<mac> no Redis com TTL
//      (o listener vai achar essa chave no próximo Access-Request)
//   2. Recupera `last_nas:<tenant>:<mac>` (gravado pelo listener em algum
//      Access-Request anterior ao OTP) → sabe pra onde mandar CoA
//   3. Dispara sendCoA com retry 3x — NAS derruba sessão do MAC e re-MAB
//   4. Retorna sucesso. Em caso de CoA falhar 3x: sucesso com
//      releaseStatus='degraded' — o guest AINDA navega (firewall re-MAB
//      por timer interno), só demora um pouco mais pra conectar.
//
// Spec: docs/spec-radius-auth.md §7-B12

import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'
import { authorizationKey, sendCoA, type RadiusAuthorization, type RadiusServiceConfig } from './index'
import { normalizeMac, recallNasForMac } from './mab'

export interface ReleaseAccessRadiusParams {
  mac: string
  ip: string
  phone: string
  /** Session lifetime em minutos (vem de tenants.session_duration_minutes). */
  sessionMinutes: number
}

export interface ReleaseAccessRadiusResult {
  success: boolean
  /** 'active' = release ok. 'degraded' = CoA falhou, mas navegação eventualmente funciona. */
  releaseStatus: 'active' | 'degraded'
  /** Dados brutos pra wifi_sessions.sonicwall_raw (auditoria). */
  raw: unknown
}

/** Quantas tentativas de CoA antes de marcar degraded. Spec §7-B12. */
const COA_MAX_ATTEMPTS = 3
const COA_RETRY_DELAY_MS = 400

export interface ReleaseAccessRadiusDeps {
  redis: Redis
  config: RadiusServiceConfig
  tenantId: string
  /** Session ID do wifi_sessions; usado no Disconnect-Request como Acct-Session-Id hint. */
  sessionId: string
}

export async function releaseAccessRadius(
  params: ReleaseAccessRadiusParams,
  deps: ReleaseAccessRadiusDeps,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessRadiusResult> {
  const normalizedMac = normalizeMac(params.mac)
  const ttlSec = params.sessionMinutes * 60

  // 1) Grava autorização no Redis. Isso é o que faz o próximo Access-Request
  // vir Accept — o guest ganha acesso mesmo que o CoA falhe, só demora um
  // pouco mais até o NAS re-MAB sozinho.
  const authorization: RadiusAuthorization = {
    tenantId: deps.tenantId,
    mac: normalizedMac,
    ip: params.ip,
    phone: params.phone,
    sessionId: deps.sessionId,
    authorizedAt: new Date().toISOString(),
  }
  const key = authorizationKey(deps.tenantId, normalizedMac)
  await deps.redis.set(key, JSON.stringify(authorization), 'EX', ttlSec)

  logger.info(
    { mac: normalizedMac, ttlSec, phone: params.phone },
    'radius_authorization_stored',
  )

  // 2) Descobre pra onde mandar CoA. Se nunca rolou Access-Request antes
  // (NAS mal configurado, ou OTP via Wi-Fi sem autenticação prévia), não
  // temos NAS-IP — degradamos graciosamente.
  const nasIp = await recallNasForMac(deps.redis, deps.tenantId, normalizedMac)
  if (!nasIp) {
    logger.warn(
      { mac: normalizedMac, tenantId: deps.tenantId },
      'radius_coa_skipped_no_nas_ip',
    )
    return {
      success: true,
      releaseStatus: 'degraded',
      raw: { reason: 'no_last_nas', authorization },
    }
  }

  // 3) Retry de CoA. Cada attempt chama sendCoA (encoda, envia UDP, aguarda ACK).
  //    Entre tentativas um pequeno delay evita bombardear NAS com pacotes
  //    idênticos em ms.
  let lastResultRaw: unknown = null
  for (let attempt = 1; attempt <= COA_MAX_ATTEMPTS; attempt++) {
    const coa = await sendCoA(
      {
        nasIp,
        mac: normalizedMac,
        sessionId: deps.sessionId,
      },
      deps.config,
      logger,
    )
    lastResultRaw = { attempt, ...coa }

    if (coa.success) {
      logger.info(
        { mac: normalizedMac, nasIp, attempt, latencyMs: coa.latencyMs },
        'radius_coa_success',
      )
      return {
        success: true,
        releaseStatus: 'active',
        raw: { authorization, coa: { attempt, latencyMs: coa.latencyMs } },
      }
    }

    if (attempt < COA_MAX_ATTEMPTS) {
      await sleep(COA_RETRY_DELAY_MS)
    }
  }

  // 4) CoA falhou 3x — degradado. Redis tem a autorização, NAS vai re-MAB
  // naturalmente eventualmente (minutos). Operador precisa investigar o NAS.
  logger.error(
    { mac: normalizedMac, nasIp, attempts: COA_MAX_ATTEMPTS },
    'radius_coa_exhausted_degraded',
  )
  return {
    success: true,
    releaseStatus: 'degraded',
    raw: { authorization, coa: lastResultRaw, degraded_after_attempts: COA_MAX_ATTEMPTS },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
