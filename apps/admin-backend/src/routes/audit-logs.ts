import type { FastifyPluginAsync } from 'fastify'

const auditLogRoutes: FastifyPluginAsync = async (fastify) => {

  // ─── GET /admin/audit-logs ────────────────────────────
  fastify.get('/admin/audit-logs', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          admin_user_id: { type: 'string', format: 'uuid' },
          action: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      from?: string
      to?: string
      admin_user_id?: string
      action?: string
      page: number
      limit: number
    }

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (query.from) {
      conditions.push(`al.created_at >= ($${paramIdx++})::date AT TIME ZONE 'UTC'`)
      params.push(query.from)
    }

    if (query.to) {
      conditions.push(`al.created_at < (($${paramIdx++})::date + INTERVAL '1 day') AT TIME ZONE 'UTC'`)
      params.push(query.to)
    }

    if (query.admin_user_id) {
      conditions.push(`al.admin_user_id = $${paramIdx++}`)
      params.push(query.admin_user_id)
    }

    if (query.action) {
      conditions.push(`al.action = $${paramIdx++}`)
      params.push(query.action)
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    // Count
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM audit_logs al ${where}`,
      params,
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Data com JOIN para dados do admin
    const offset = (query.page - 1) * query.limit
    const dataParams = [...params, query.limit, offset]

    const result = await fastify.db.query(
      `SELECT al.id, al.admin_user_id, au.name AS user_name, au.email AS user_email,
              al.action, al.payload, al.ip_address, al.created_at
       FROM audit_logs al
       LEFT JOIN admin_users au ON au.id = al.admin_user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataParams,
    )

    const data = result.rows.map((row: Record<string, unknown>) => ({
      id: row['id'],
      user: {
        id: row['admin_user_id'],
        name: row['user_name'],
        email: row['user_email'],
      },
      action: row['action'],
      payload: row['payload'],
      ip_address: row['ip_address'],
      created_at: row['created_at'],
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
}

export default auditLogRoutes
