// MAB — MAC Authentication Bypass via Redis.
//
// Responde à pergunta "esse MAC, neste tenant, está autorizado AGORA?".
// A chave é gravada pelo verify-otp (task B12) com TTL = session_timeout_sec.
// Quando o TTL expira, a chave some e o próximo Access-Request falha → o
// guest é jogado de volta no walled-garden e precisa re-OTP.
//
// Spec: docs/spec-radius-auth.md §1.1

import type { Redis } from 'ioredis'
import { authorizationKey, type RadiusAuthorization } from './index'

/** Normaliza MAC pro formato canônico (lowercase sem separador). */
export function normalizeMac(mac: string): string {
  return mac.toLowerCase().replace(/[^0-9a-f]/g, '')
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
