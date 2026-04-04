import type { FastifyPluginAsync } from 'fastify'

/**
 * Mascara telefone E.164 para exibição (LGPD).
 * +5511999994321 → +55 11 9****-4321
 */
function maskPhone(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '')

  // Brasil: 55 + DDD(2) + 9(1) + XXXX(4) + YYYY(4) = 13 dígitos
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const last4 = digits.slice(-4)
    return `+55 ${ddd} 9****-${last4}`
  }

  // Fallback genérico: mostra só os últimos 4
  if (digits.length >= 8) {
    const last4 = digits.slice(-4)
    return `+${'*'.repeat(digits.length - 4)}${last4}`
  }

  return '***'
}

const sessionRoutes: FastifyPluginAsync = async (fastify) => {

  // ─── GET /admin/sessions ──────────────────────────────
  fastify.get('/admin/sessions', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string', format: 'uuid' },
          from: { type: 'string' },
          to: { type: 'string' },
          phone: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      tenant_id?: string
      from?: string
      to?: string
      phone?: string
      page: number
      limit: number
    }

    // Roles não-superadmin precisam filtrar por tenant
    if (request.admin.role !== 'superadmin' && !query.tenant_id) {
      return reply.code(422).send({
        error: 'missing_tenant_id',
        message: 'O filtro tenant_id é obrigatório para sua role.',
        code: 422,
      })
    }

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (query.tenant_id) {
      conditions.push(`ws.tenant_id = $${paramIdx++}`)
      params.push(query.tenant_id)
    }

    if (query.from) {
      conditions.push(`ws.auth_at >= ($${paramIdx++})::date AT TIME ZONE 'UTC'`)
      params.push(query.from)
    }

    if (query.to) {
      conditions.push(`ws.auth_at < (($${paramIdx++})::date + INTERVAL '1 day') AT TIME ZONE 'UTC'`)
      params.push(query.to)
    }

    if (query.phone) {
      conditions.push(`ws.phone_e164 LIKE $${paramIdx++}`)
      params.push(`%${query.phone}%`)
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    // Count
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM wifi_sessions ws ${where}`,
      params,
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Data com JOIN para nome do tenant
    const offset = (query.page - 1) * query.limit
    const dataParams = [...params, query.limit, offset]

    const result = await fastify.db.query(
      `SELECT ws.id, ws.tenant_id, t.name AS tenant_name,
              ws.phone_e164, ws.mac_address, ws.ip_address,
              ws.auth_at, ws.expires_at, ws.sonicwall_mode
       FROM wifi_sessions ws
       LEFT JOIN tenants t ON t.id = ws.tenant_id
       ${where}
       ORDER BY ws.auth_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataParams,
    )

    const data = result.rows.map((row: Record<string, unknown>) => ({
      id: row['id'],
      tenant: {
        id: row['tenant_id'],
        name: row['tenant_name'],
      },
      phone_masked: maskPhone(row['phone_e164'] as string),
      mac_address: row['mac_address'],
      ip_address: row['ip_address'],
      auth_at: row['auth_at'],
      expires_at: row['expires_at'],
      sonicwall_mode: row['sonicwall_mode'],
    }))

    return reply.code(200).send({
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit) || 1,
      },
    })
  })

  // ─── GET /admin/reports/summary ───────────────────────
  fastify.get('/admin/reports/summary', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string', format: 'uuid' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      tenant_id?: string
      from?: string
      to?: string
    }

    // Roles não-superadmin precisam filtrar por tenant
    if (request.admin.role !== 'superadmin' && !query.tenant_id) {
      return reply.code(422).send({
        error: 'missing_tenant_id',
        message: 'O filtro tenant_id é obrigatório para sua role.',
        code: 422,
      })
    }

    // Defaults: início do mês atual → hoje
    const now = new Date()
    const fromDate = query.from || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
    const toDate = query.to || now.toISOString().slice(0, 10)

    // ── Condições compartilhadas ──
    const sessionConditions: string[] = []
    const attemptConditions: string[] = []
    const sessionParams: unknown[] = []
    const attemptParams: unknown[] = []
    let sIdx = 1
    let aIdx = 1

    // Período — sessions (AT TIME ZONE 'UTC' garante consistência com TIMESTAMPTZ)
    sessionConditions.push(`ws.auth_at >= ($${sIdx++})::date AT TIME ZONE 'UTC'`)
    sessionParams.push(fromDate)
    sessionConditions.push(`ws.auth_at < (($${sIdx++})::date + INTERVAL '1 day') AT TIME ZONE 'UTC'`)
    sessionParams.push(toDate)

    // Período — attempts
    attemptConditions.push(`aa.created_at >= ($${aIdx++})::date AT TIME ZONE 'UTC'`)
    attemptParams.push(fromDate)
    attemptConditions.push(`aa.created_at < (($${aIdx++})::date + INTERVAL '1 day') AT TIME ZONE 'UTC'`)
    attemptParams.push(toDate)

    if (query.tenant_id) {
      sessionConditions.push(`ws.tenant_id = $${sIdx++}`)
      sessionParams.push(query.tenant_id)
      attemptConditions.push(`aa.tenant_id = $${aIdx++}`)
      attemptParams.push(query.tenant_id)
    }

    const sessionWhere = sessionConditions.join(' AND ')
    const attemptWhere = attemptConditions.join(' AND ')

    // ── Totals ──
    const totalsResult = await fastify.db.query(
      `SELECT
         COUNT(*)::int AS sessions,
         COUNT(DISTINCT ws.phone_e164)::int AS unique_phones
       FROM wifi_sessions ws
       WHERE ${sessionWhere}`,
      sessionParams,
    )

    const attemptsResult = await fastify.db.query(
      `SELECT
         COUNT(*)::int AS auth_attempts,
         COUNT(*) FILTER (WHERE aa.status = 'success')::int AS successes
       FROM auth_attempts aa
       WHERE ${attemptWhere}`,
      attemptParams,
    )

    const totals = totalsResult.rows[0]
    const attempts = attemptsResult.rows[0]
    const successRate = attempts.auth_attempts > 0
      ? Math.round((attempts.successes / attempts.auth_attempts) * 1000) / 10
      : 0

    // ── by_tenant (superadmin sem filtro de tenant) ──
    let byTenant: Record<string, unknown>[] = []
    if (!query.tenant_id && request.admin.role === 'superadmin') {
      const byTenantResult = await fastify.db.query(
        `SELECT ws.tenant_id, t.name AS tenant_name,
                COUNT(*)::int AS sessions,
                COUNT(DISTINCT ws.phone_e164)::int AS unique_phones
         FROM wifi_sessions ws
         LEFT JOIN tenants t ON t.id = ws.tenant_id
         WHERE ${sessionWhere}
         GROUP BY ws.tenant_id, t.name
         ORDER BY sessions DESC`,
        sessionParams,
      )
      byTenant = byTenantResult.rows.map((r: Record<string, unknown>) => ({
        tenant_id: r['tenant_id'],
        tenant_name: r['tenant_name'],
        sessions: r['sessions'],
        unique_phones: r['unique_phones'],
      }))
    }

    // ── by_day ──
    const byDayResult = await fastify.db.query(
      `SELECT DATE(ws.auth_at) AS date, COUNT(*)::int AS sessions
       FROM wifi_sessions ws
       WHERE ${sessionWhere}
       GROUP BY DATE(ws.auth_at)
       ORDER BY date ASC`,
      sessionParams,
    )
    const byDay = byDayResult.rows.map((r: Record<string, unknown>) => ({
      date: (r['date'] as Date).toISOString().slice(0, 10),
      sessions: r['sessions'],
    }))

    return reply.code(200).send({
      period: { from: fromDate, to: toDate },
      totals: {
        sessions: totals.sessions,
        unique_phones: totals.unique_phones,
        auth_attempts: attempts.auth_attempts,
        success_rate: successRate,
      },
      by_tenant: byTenant,
      by_day: byDay,
    })
  })
}

export default sessionRoutes
