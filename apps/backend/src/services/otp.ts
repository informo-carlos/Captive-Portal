import { randomInt } from 'node:crypto'
import type Redis from 'ioredis'

const OTP_TTL = 300 // 5 minutos
const RATE_LIMIT_TTL = 600 // 10 minutos
const RATE_LIMIT_MAX = 3
const MAX_ATTEMPTS = 3

interface OtpData {
  otp: string
  mac: string
  ip: string
  createdAt: string
  /**
   * Query params capturados no redirect inicial do SonicWall (modo LHM).
   * Vazio quando o portal é acessado direto ou em modo REST.
   */
  lhmParams?: Record<string, string>
}

// Normaliza telefone brasileiro para E.164: +55XXXXXXXXXXX
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10 && digits.length !== 11) return null
  // 11 dígitos com 9 na frente = celular, 10 = fixo
  if (digits.length === 11 && digits[2] !== '9') return null
  return `+55${digits}`
}

// Gera OTP de 6 dígitos usando crypto.randomInt (seguro)
export function generateOtp(): string {
  return randomInt(100000, 999999).toString()
}

// Verifica rate limit: máximo 3 tentativas em 600 segundos
export async function checkRateLimit(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = `ratelimit:${tenantId}:${phoneE164}`
  const count = await redis.get(key)

  if (count !== null && parseInt(count, 10) >= RATE_LIMIT_MAX) {
    const ttl = await redis.ttl(key)
    return { allowed: false, retryAfter: ttl > 0 ? ttl : RATE_LIMIT_TTL }
  }

  return { allowed: true, retryAfter: 0 }
}

// Incrementa contador de rate limit
export async function incrementRateLimit(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<void> {
  const key = `ratelimit:${tenantId}:${phoneE164}`
  const count = await redis.incr(key)
  // Define TTL apenas na primeira vez
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_TTL)
  }
}

// Salva OTP no Redis com TTL de 5 minutos
export async function storeOtp(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
  otp: string,
  mac: string,
  ip: string,
  lhmParams?: Record<string, string>,
): Promise<void> {
  const key = `otp:${tenantId}:${phoneE164}`
  const data: OtpData = {
    otp,
    mac,
    ip,
    createdAt: new Date().toISOString(),
    ...(lhmParams && Object.keys(lhmParams).length > 0 ? { lhmParams } : {}),
  }
  await redis.set(key, JSON.stringify(data), 'EX', OTP_TTL)
}

// Recupera OTP do Redis
export async function getStoredOtp(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<OtpData | null> {
  const key = `otp:${tenantId}:${phoneE164}`
  const raw = await redis.get(key)
  if (!raw) return null
  return JSON.parse(raw) as OtpData
}

// Deleta OTP do Redis (one-time use)
export async function deleteOtp(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<void> {
  const key = `otp:${tenantId}:${phoneE164}`
  await redis.del(key)
}

// Verifica tentativas erradas e retorna estado
export async function checkOtpAttempts(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<{ blocked: boolean; attemptsRemaining: number }> {
  const key = `otp_attempts:${tenantId}:${phoneE164}`
  const raw = await redis.get(key)
  const current = raw ? parseInt(raw, 10) : 0

  if (current >= MAX_ATTEMPTS) {
    return { blocked: true, attemptsRemaining: 0 }
  }

  return { blocked: false, attemptsRemaining: MAX_ATTEMPTS - current }
}

// Incrementa contador de tentativas erradas
export async function incrementOtpAttempts(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<{ blocked: boolean; attemptsRemaining: number }> {
  const key = `otp_attempts:${tenantId}:${phoneE164}`
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, OTP_TTL) // mesmo TTL do OTP
  }

  const remaining = MAX_ATTEMPTS - count
  return {
    blocked: remaining <= 0,
    attemptsRemaining: Math.max(0, remaining),
  }
}

// Limpa contador de tentativas (após OTP validado ou bloqueio)
export async function clearOtpAttempts(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
): Promise<void> {
  const key = `otp_attempts:${tenantId}:${phoneE164}`
  await redis.del(key)
}
