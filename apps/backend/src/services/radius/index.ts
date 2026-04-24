// Strategy RADIUS — ponto de entrada único. Sempre importar daqui.
//
// Progresso das tasks:
//   B9  → stub com start/stop/sendCoA noop + tipos ✓
//   B10 → listener.ts real (UDP/1812 Access-Request/Accept/Reject + MAB Redis) ✓
//   B11 → coa.ts (CoA-Disconnect UDP/3799) + accounting.ts (UDP/1813) ✓
//   B12 → integração verify-otp.ts (grava autorização no Redis + sendCoA)
//
// Spec: docs/spec-radius-auth.md
// Princípio MAB / zero cadastro prévio: docs/spec-radius-auth.md §1.1

import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import type { Pool } from 'pg'
import { createListener, type RadiusListener } from './listener'
import {
  createAccountingListener,
  type RadiusAccountingListener,
} from './accounting'
import { sendDisconnect } from './coa'

export interface RadiusServiceConfig {
  enabled: boolean
  authPort: number
  acctPort: number
  coaPort: number
  sharedSecret: string
  sessionTimeoutSec: number
}

/**
 * Dados de uma autorização efêmera gravada no Redis após verify-otp.
 * Chave: `radius:authorized:<tenant_id>:<mac_normalized>`
 * TTL: sessionTimeoutSec
 */
export interface RadiusAuthorization {
  tenantId: string
  mac: string
  ip: string
  phone: string
  sessionId: string
  authorizedAt: string
}

/**
 * Parâmetros pra enviar CoA-Disconnect pro NAS forçando re-autenticação
 * imediata do MAC após OTP. Sem CoA o guest teria que esperar o timeout de
 * re-auth do próprio AP (pode ser minutos).
 */
export interface CoARequest {
  nasIp: string
  nasPort?: number
  mac: string
  sessionId?: string
}

export interface CoAResult {
  success: boolean
  /** Latência do ack do NAS em ms (null se timeout). */
  latencyMs: number | null
  /** Attribute code do response — 41 (Disconnect-ACK) = ok, 42 (NAK) = falha. */
  responseCode?: number
}

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────

let listener: RadiusListener | null = null
let accountingListener: RadiusAccountingListener | null = null

export interface StartDeps {
  fastify: FastifyInstance
  config: RadiusServiceConfig
  tenantId: string
  redis: Redis
  db: Pool
}

/**
 * Sobe listeners RADIUS (UDP/1812 auth + UDP/1813 accounting) se
 * `config.enabled=true`. Tenants em modo sonicwall nunca tocam aqui.
 */
export async function start(deps: StartDeps): Promise<void> {
  const { fastify, config, tenantId, redis, db } = deps

  if (!config.enabled) {
    fastify.log.info({ radius: 'disabled' }, 'radius_service_skipped')
    return
  }

  if (listener || accountingListener) {
    fastify.log.warn({ radius: 'already_started' }, 'radius_service_start_ignored')
    return
  }

  listener = await createListener({
    config,
    tenantId,
    redis,
    logger: fastify.log,
  })

  accountingListener = await createAccountingListener({
    config,
    tenantId,
    db,
    logger: fastify.log,
  })
}

/** Fecha sockets UDP. Idempotente. */
export async function stop(logger?: FastifyBaseLogger): Promise<void> {
  logger?.info({ radius: 'stopping' }, 'radius_service_stop')
  if (listener) {
    await listener.stop()
    listener = null
  }
  if (accountingListener) {
    await accountingListener.stop()
    accountingListener = null
  }
}

/**
 * Estado dos listeners pra exposição no /health.
 * authListening/acctListening = true se os sockets UDP estão bindados.
 */
export function getListenerStatus(): {
  authListening: boolean
  acctListening: boolean
} {
  return {
    authListening: listener !== null && listener.authAddress() !== null,
    acctListening: accountingListener !== null && accountingListener.authAddress() !== null,
  }
}

/**
 * Dispara CoA-Disconnect pro NAS forçando re-auth do MAC autorizado.
 * Delega pra services/radius/coa.ts (UDP/3799, RFC 5176).
 */
export async function sendCoA(
  req: CoARequest,
  config: RadiusServiceConfig,
  logger: FastifyBaseLogger,
): Promise<CoAResult> {
  if (!config.enabled) {
    // Chamada num contexto sem RADIUS é bug do caller, mas a gente degrada
    // gracefully — retorna "success" simulado pra não quebrar verify-otp.
    logger.warn({ nasIp: req.nasIp, mac: req.mac }, 'radius_coa_skipped_disabled')
    return { success: true, latencyMs: null }
  }

  return sendDisconnect(req, config, logger)
}

/** Chave Redis pra autorização efêmera do MAC. */
export function authorizationKey(tenantId: string, mac: string): string {
  // MAC normalizado lowercase + sem separador — qualquer formato que o NAS
  // envie (aa:bb, AA-BB, aabb) vira o mesmo canônico.
  const normalized = mac.toLowerCase().replace(/[^0-9a-f]/g, '')
  return `radius:authorized:${tenantId}:${normalized}`
}
