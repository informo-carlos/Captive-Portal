// Rate limit in-memory por NAS-IP — token bucket simples.
//
// Por que: o accounting listener (UDP/1813) é driven pelo NAS. Um NAS
// bugado/comprometido poderia flooda-lo com accounting-interim. Sem
// limite, cada pacote vira 1 UPDATE no PostgreSQL.
//
// Implementação: 1 token a cada (1000/ratePerSec) ms, bucket inicia cheio
// com `burst` tokens. Take() retorna false quando não há token → caller
// dropa o pacote silenciosamente.
//
// Spec: docs/spec-radius-auth.md §7-B11 ("max 50 req/s por NAS-IP")

interface Bucket {
  tokens: number
  lastRefillMs: number
}

export interface RateLimiter {
  /** Retorna true se o caller pode prosseguir; false = dropar. */
  take(nasIp: string): boolean
  /** Remove buckets inativos há mais de `ttlMs`. Chamar periodicamente. */
  gc(nowMs?: number): void
  /** Útil pra métricas/testes. */
  size(): number
}

export interface RateLimiterOpts {
  /** Taxa sustentada permitida por NAS-IP (tokens por segundo). */
  ratePerSec: number
  /** Capacidade do bucket — tolera burst até esse valor antes de travar. */
  burst: number
  /** TTL pra esquecer NAS-IPs que pararam de enviar (ms). Default 10min. */
  idleTtlMs?: number
}

export function createRateLimiter(opts: RateLimiterOpts): RateLimiter {
  const buckets = new Map<string, Bucket>()
  const idleTtlMs = opts.idleTtlMs ?? 10 * 60 * 1000
  const refillPerMs = opts.ratePerSec / 1000

  function take(nasIp: string): boolean {
    const now = Date.now()
    let b = buckets.get(nasIp)
    if (!b) {
      b = { tokens: opts.burst, lastRefillMs: now }
      buckets.set(nasIp, b)
    } else {
      const elapsed = now - b.lastRefillMs
      if (elapsed > 0) {
        b.tokens = Math.min(opts.burst, b.tokens + elapsed * refillPerMs)
        b.lastRefillMs = now
      }
    }
    if (b.tokens >= 1) {
      b.tokens -= 1
      return true
    }
    return false
  }

  function gc(nowMs: number = Date.now()): void {
    for (const [ip, b] of buckets.entries()) {
      if (nowMs - b.lastRefillMs > idleTtlMs) {
        buckets.delete(ip)
      }
    }
  }

  return { take, gc, size: () => buckets.size }
}
