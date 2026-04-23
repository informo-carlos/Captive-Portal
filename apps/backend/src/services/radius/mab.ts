// MAB — MAC Authentication Bypass via Redis.
//
// Responde à pergunta "esse MAC, neste tenant, está autorizado AGORA?".
// A chave é gravada pelo verify-otp (task B12) com TTL = session_timeout_sec.
// Quando o TTL expira, a chave some e o próximo Access-Request falha → o
// guest é jogado de volta no walled-garden e precisa re-OTP.
//
// Também expõe tracking de `last_nas:<tenant>:<mac>` — gravado pelo
// listener em cada Access-Request pra o verify-otp saber pra qual
// NAS-IP disparar CoA depois que o OTP validar.
//
// Spec: docs/spec-radius-auth.md §1.1

import type { Redis } from 'ioredis'
import { authorizationKey, type RadiusAuthorization } from './index'

/** Normaliza MAC pro formato canônico (lowercase sem separador). */
export function normalizeMac(mac: string): string {
  return mac.toLowerCase().replace(/[^0-9a-f]/g, '')
}

/** TTL do tracking de NAS — 15min cobre o tempo entre redirect e OTP. */
const LAST_NAS_TTL_SEC = 15 * 60

function lastNasKey(tenantId: string, mac: string): string {
  return `radius:last_nas:${tenantId}:${normalizeMac(mac)}`
}

/**
 * Chamado pelo listener a cada Access-Request recebido (mesmo em Reject).
 * Permite o verify-otp recuperar o NAS-IP depois do OTP pra disparar CoA.
 */
export async function rememberNasForMac(
  redis: Redis,
  tenantId: string,
  mac: string,
  nasIp: string,
): Promise<void> {
  await redis.set(lastNasKey(tenantId, mac), nasIp, 'EX', LAST_NAS_TTL_SEC)
}

/** Recupera o NAS-IP do último Access-Request deste MAC (ou null). */
export async function recallNasForMac(
  redis: Redis,
  tenantId: string,
  mac: string,
): Promise<string | null> {
  return redis.get(lastNasKey(tenantId, mac))
}

export interface MabLookupResult {
  authorized: boolean
  /** Segundos restantes até a autorização expirar (null se não autorizado). */
  ttlSec: number | null
  /** Dados da autorização, se encontrada. */
  data: RadiusAuthorization | null
}

/**
 * Consulta no Redis se o MAC está autorizado pra este tenant.
 * Retorna TTL junto pra o caller poder mandar `Session-Timeout` condizente
 * com o tempo REAL restante (caso o timeout do tenant tenha mudado depois
 * que o guest autenticou).
 */
export async function lookupMabAuthorization(
  redis: Redis,
  tenantId: string,
  mac: string,
): Promise<MabLookupResult> {
  const key = authorizationKey(tenantId, mac)

  // Pipeline: GET + TTL numa RTT só
  const [raw, ttl] = await Promise.all([redis.get(key), redis.ttl(key)])

  if (!raw || ttl <= 0) {
    return { authorized: false, ttlSec: null, data: null }
  }

  let data: RadiusAuthorization | null = null
  try {
    data = JSON.parse(raw) as RadiusAuthorization
  } catch {
    // Chave corrompida — trata como não autorizado pra não quebrar o listener
    return { authorized: false, ttlSec: null, data: null }
  }

  return { authorized: true, ttlSec: ttl, data }
}
