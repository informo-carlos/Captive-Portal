import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import {
  normalizePhone,
  generateOtp,
  checkRateLimit,
  incrementRateLimit,
  storeOtp,
  getStoredOtp,
  deleteOtp,
  checkOtpAttempts,
  incrementOtpAttempts,
  clearOtpAttempts,
} from '../services/otp'
import { sendOtpSms } from '../services/zenvia'
import { releaseAccess } from '../services/sonicwall'
import { releaseAccessRadius } from '../services/radius/release'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // ─────────────────────────────────────────
  // POST /auth/request-otp
  // ─────────────────────────────────────────
  fastify.post('/auth/request-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'mac', 'ip'],
        properties: {
          phone: { type: 'string' },
          mac: { type: 'string' },
          ip: { type: 'string' },
          // Params do redirect inicial do SonicWall (modo LHM).
          // O frontend captura via useSearchParams() e envia aqui.
          // Opcional: vazio em modo de teste / acesso direto.
          lhm_params: {
            type: 'object',
            // Limites pra evitar flood no Redis: máximo 16 keys, valores
            // de até 512 chars (mgmtBaseUrl é o maior, geralmente <100).
            maxProperties: 16,
            additionalProperties: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { phone, mac, ip, lhm_params } = request.body as {
      phone: string
      mac: string
      ip: string
      lhm_params?: Record<string, string>
    }

    // 1. Normaliza phone para E.164
    const phoneE164 = normalizePhone(phone)
    if (!phoneE164) {
      return reply.code(422).send({
        error: 'invalid_phone',
        message: 'Número de telefone inválido.',
        code: 422,
      })
    }

    // 2. Verifica rate limit
    const rateLimit = await checkRateLimit(fastify.redis, request.tenantId, phoneE164)
    if (!rateLimit.allowed) {
      // Registra tentativa bloqueada
      await fastify.db.query(
        `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
         VALUES ($1, $2, $3, $4, 'rate_limit_exceeded')`,
        [request.tenantId, phoneE164, mac, ip],
      )

      return reply.code(429).send({
        error: 'rate_limit',
        message: 'Muitas tentativas. Aguarde 10 minutos.',
        retry_after: rateLimit.retryAfter,
        code: 429,
      })
    }

    // 3. Gera OTP
    const otp = generateOtp()

    // 4. Salva no Redis com TTL de 5 minutos (inclui lhm_params se vieram)
    await storeOtp(fastify.redis, request.tenantId, phoneE164, otp, mac, ip, lhm_params)

    // 5. Incrementa rate limit
    await incrementRateLimit(fastify.redis, request.tenantId, phoneE164)

    // 6. Envia SMS (stub na B6, real na B7)
    try {
      await sendOtpSms(
        { to: phoneE164.replace('+', ''), otp, tenantName: 'Portal Wi-Fi' },
        { token: fastify.config.zenviaToken, sender: fastify.config.zenviaSender },
        request.log,
      )
    } catch (err) {
      request.log.error({ error: (err as Error).message }, 'sms_send_failed')
      return reply.code(500).send({
        error: 'sms_failed',
        message: 'Não foi possível enviar o SMS. Tente novamente.',
        code: 500,
      })
    }

    // 7. Registra em auth_attempts
    await fastify.db.query(
      `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
       VALUES ($1, $2, $3, $4, 'otp_sent')`,
      [request.tenantId, phoneE164, mac, ip],
    )

    // NUNCA logar o OTP
    request.log.info({ tenantId: request.tenantId, phone: phoneE164, otp_sent: true }, 'otp_requested')

    return reply.send({
      message: 'Código enviado por SMS.',
      expires_in: 300,
    })
  })

  // ─────────────────────────────────────────
  // POST /auth/verify-otp
  // ─────────────────────────────────────────
  fastify.post('/auth/verify-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string' },
          otp: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { phone, otp } = request.body as { phone: string; otp: string }

    // 1. Normaliza phone
    const phoneE164 = normalizePhone(phone)
    if (!phoneE164) {
      return reply.code(422).send({
        error: 'invalid_phone',
        message: 'Número de telefone inválido.',
        code: 422,
      })
    }

    // 2. Busca OTP no Redis
    const stored = await getStoredOtp(fastify.redis, request.tenantId, phoneE164)
    if (!stored) {
      return reply.code(404).send({
        error: 'otp_not_found',
        message: 'Código expirado ou não solicitado. Solicite um novo código.',
        code: 404,
      })
    }

    // 3. Verifica se já está bloqueado
    const attempts = await checkOtpAttempts(fastify.redis, request.tenantId, phoneE164)
    if (attempts.blocked) {
      await deleteOtp(fastify.redis, request.tenantId, phoneE164)
      await clearOtpAttempts(fastify.redis, request.tenantId, phoneE164)

      await fastify.db.query(
        `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
         VALUES ($1, $2, $3, $4, 'otp_blocked')`,
        [request.tenantId, phoneE164, stored.mac, stored.ip],
      )

      return reply.code(422).send({
        error: 'otp_blocked',
        message: 'Muitas tentativas incorretas. Solicite um novo código.',
        code: 422,
      })
    }

    // 4. Compara OTP
    if (otp !== stored.otp) {
      const result = await incrementOtpAttempts(fastify.redis, request.tenantId, phoneE164)

      if (result.blocked) {
        // Atingiu o limite: deleta OTP e bloqueia
        await deleteOtp(fastify.redis, request.tenantId, phoneE164)
        await clearOtpAttempts(fastify.redis, request.tenantId, phoneE164)

        await fastify.db.query(
          `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
           VALUES ($1, $2, $3, $4, 'otp_blocked')`,
          [request.tenantId, phoneE164, stored.mac, stored.ip],
        )

        return reply.code(422).send({
          error: 'otp_blocked',
          message: 'Muitas tentativas incorretas. Solicite um novo código.',
          code: 422,
        })
      }

      await fastify.db.query(
        `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
         VALUES ($1, $2, $3, $4, 'invalid_otp')`,
        [request.tenantId, phoneE164, stored.mac, stored.ip],
      )

      return reply.code(422).send({
        error: 'invalid_otp',
        message: 'Código inválido.',
        attempts_remaining: result.attemptsRemaining,
        code: 422,
      })
    }

    // 5. OTP válido — limpa Redis
    await deleteOtp(fastify.redis, request.tenantId, phoneE164)
    await clearOtpAttempts(fastify.redis, request.tenantId, phoneE164)

    // 6. Busca session_duration_minutes do tenant
    const tenantResult = await fastify.db.query(
      'SELECT session_duration_minutes FROM tenants WHERE id = $1',
      [request.tenantId],
    )
    const sessionMinutes = tenantResult.rows[0]?.session_duration_minutes ?? 480

    // 7. Prepara campos comuns das duas Strategies
    const now = new Date()
    const yearMonth = parseInt(
      `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      10,
    )
    const expiresAt = new Date(now.getTime() + sessionMinutes * 60 * 1000)
    const sessionId = randomUUID()

    // 8. Strategy branch — RADIUS ou SonicWall (REST/LHM).
    //    RADIUS grava wifi_sessions ANTES do CoA (se o CoA falhar, a sessão
    //    ainda fica registrada; NAS re-MAB por timer interno eventualmente).
    //    SonicWall mantém ordem legacy: release → INSERT.
    let responseBody: {
      message: string
      expires_in: number
      redirect_url?: string
      lhm_post?: {
        url: string
        payload: Record<string, unknown>
        req_url?: string
      }
      release_status?: 'active' | 'degraded'
    }

    if (fastify.config.authMode === 'radius') {
      // 8a.1 — INSERT wifi_sessions primeiro, marcado 'active' otimisticamente
      await fastify.db.query(
        `INSERT INTO wifi_sessions
           (id, tenant_id, phone_e164, mac_address, ip_address, auth_at, expires_at,
            sonicwall_mode, release_status, year_month)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'radius', 'active', $8)`,
        [
          sessionId,
          request.tenantId,
          phoneE164,
          stored.mac,
          stored.ip,
          now.toISOString(),
          expiresAt.toISOString(),
          yearMonth,
        ],
      )

      // 8a.2 — Strategy RADIUS: SET no Redis + CoA retry 3x
      const result = await releaseAccessRadius(
        {
          mac: stored.mac,
          ip: stored.ip,
          phone: phoneE164,
          sessionMinutes,
        },
        {
          redis: fastify.redis,
          config: fastify.config.radius,
          tenantId: request.tenantId,
          sessionId,
        },
        request.log,
      )

      // 8a.3 — Se CoA falhou 3x, marca degraded no DB (usuário navega mesmo
      // assim — firewall faz re-MAB sozinho por timer próprio em alguns min)
      if (result.releaseStatus === 'degraded') {
        await fastify.db.query(
          `UPDATE wifi_sessions
              SET release_status = 'degraded',
                  sonicwall_raw = $1
            WHERE id = $2 AND year_month = $3`,
          [JSON.stringify(result.raw), sessionId, yearMonth],
        )
      } else {
        await fastify.db.query(
          `UPDATE wifi_sessions SET sonicwall_raw = $1
            WHERE id = $2 AND year_month = $3`,
          [JSON.stringify(result.raw), sessionId, yearMonth],
        )
      }

      responseBody = {
        message:
          result.releaseStatus === 'active'
            ? 'Acesso liberado. Você já pode navegar.'
            : 'Acesso registrado. A liberação pode levar até 1 minuto.',
        expires_in: sessionMinutes * 60,
        release_status: result.releaseStatus,
      }
    } else {
      // 8b — Strategy SonicWall (REST/LHM, caminho legacy).
      const swResult = await releaseAccess(
        {
          mac: stored.mac,
          ip: stored.ip,
          phone: phoneE164,
          sessionMinutes,
          lhmParams: stored.lhmParams,
        },
        fastify.config.sonicwall,
        request.log,
      )

      if (!swResult.success) {
        request.log.error({ raw: swResult.raw, mode: swResult.mode }, 'sonicwall_release_failed')
        return reply.code(502).send({
          error: 'sonicwall_failed',
          message: 'Autenticação válida, mas falha ao liberar acesso. Contate o suporte.',
          code: 502,
        })
      }

      await fastify.db.query(
        `INSERT INTO wifi_sessions
           (id, tenant_id, phone_e164, mac_address, ip_address, auth_at, expires_at,
            sonicwall_raw, sonicwall_mode, year_month)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionId,
          request.tenantId,
          phoneE164,
          stored.mac,
          stored.ip,
          now.toISOString(),
          expiresAt.toISOString(),
          JSON.stringify(swResult.raw),
          swResult.mode,
          yearMonth,
        ],
      )

      responseBody = {
        message: 'Acesso liberado. Você já pode navegar.',
        expires_in: sessionMinutes * 60,
      }
      if (swResult.lhmPost) {
        responseBody.lhm_post = {
          url: swResult.lhmPost.url,
          payload: swResult.lhmPost.payload,
          req_url: swResult.lhmPost.reqUrl,
        }
      } else if (swResult.redirectUrl) {
        // Compat: protocolo CGI antigo (SonicOS <= 7.2) — manter enquanto
        // não confirmarmos 100% da migração pra LHM 7.3 em produção.
        responseBody.redirect_url = swResult.redirectUrl
      }
    }

    // 9. auth_attempts + log de sucesso (comum às 2 strategies)
    await fastify.db.query(
      `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
       VALUES ($1, $2, $3, $4, 'success')`,
      [request.tenantId, phoneE164, stored.mac, stored.ip],
    )

    request.log.info(
      {
        tenantId: request.tenantId,
        phone: phoneE164,
        authMode: fastify.config.authMode,
        releaseStatus: responseBody.release_status ?? 'active',
      },
      'otp_verified_access_released',
    )

    return reply.send(responseBody)
  })
}

export default authRoutes
