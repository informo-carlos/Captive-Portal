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
import type { LhmBrowserSubmit } from '../services/sonicwall'

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

    // 7. Chama SonicWall para liberar acesso.
    // Em modo LHM, lhmParams (capturados no request-otp) são essenciais —
    // sem eles a função retorna erro descritivo.
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

    // 8. Calcula year_month e expires_at
    const now = new Date()
    // Usa UTC para consistência com TIMESTAMPTZ do Postgres (armazena em UTC)
    const yearMonth = parseInt(
      `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      10,
    )
    const expiresAt = new Date(now.getTime() + sessionMinutes * 60 * 1000)

    // 9. Registra em wifi_sessions
    await fastify.db.query(
      `INSERT INTO wifi_sessions
         (tenant_id, phone_e164, mac_address, ip_address, auth_at, expires_at, sonicwall_raw, sonicwall_mode, year_month)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
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

    // 10. Registra sucesso em auth_attempts
    await fastify.db.query(
      `INSERT INTO auth_attempts (tenant_id, phone_e164, mac_address, ip_address, status)
       VALUES ($1, $2, $3, $4, 'success')`,
      [request.tenantId, phoneE164, stored.mac, stored.ip],
    )

    request.log.info(
      { tenantId: request.tenantId, phone: phoneE164, mode: swResult.mode },
      'otp_verified_access_released',
    )

    const expiresInSeconds = sessionMinutes * 60
    const responseBody: {
      message: string
      expires_in: number
      lhm_submit?: LhmBrowserSubmit
    } = {
      message: 'Acesso liberado. Você já pode navegar.',
      expires_in: expiresInSeconds,
    }
    // Em modo LHM a gente devolve o payload de browser-submit pro frontend,
    // que dispara o POST final direto do browser do guest (que está na LAN
    // do SW). Ver services/sonicwall/lhm.ts pra o porquê.
    if (swResult.mode === 'lhm' && swResult.browserSubmit) {
      responseBody.lhm_submit = swResult.browserSubmit
    }
    return reply.send(responseBody)
  })

  // ─────────────────────────────────────────
  // POST /auth/lhm-client-report
  // Debug-only: frontend reporta o resultado de cada POST no-cors que ele
  // disparou pro SW. Como no-cors devolve response opaque, esse é o único
  // jeito de saber se o request sequer saiu do browser.
  // ─────────────────────────────────────────
  fastify.post('/auth/lhm-client-report', {
    schema: {
      body: {
        type: 'object',
        required: ['sessId', 'candidates'],
        properties: {
          sessId: { type: 'string', maxLength: 128 },
          phone: { type: 'string', maxLength: 32 },
          userAgent: { type: 'string', maxLength: 512 },
          candidates: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', maxLength: 512 },
                ok: { type: 'boolean' },
                type: { type: 'string', maxLength: 32 },
                status: { type: 'number' },
                duration_ms: { type: 'number' },
                error: { type: 'string', maxLength: 512 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      sessId: string
      phone?: string
      userAgent?: string
      candidates: Array<{
        url: string
        ok?: boolean
        type?: string
        status?: number
        duration_ms?: number
        error?: string
      }>
    }

    request.log.info(
      {
        tenantId: request.tenantId,
        sessId: body.sessId,
        phone: body.phone,
        userAgent: body.userAgent,
        candidates: body.candidates,
      },
      'lhm_client_report',
    )

    return reply.code(204).send()
  })
}

export default authRoutes
