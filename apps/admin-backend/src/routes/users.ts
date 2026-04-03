import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

const userRoutes: FastifyPluginAsync = async (fastify) => {

  // ─── GET /admin/users ─────────────────────────────────
  fastify.get('/admin/users', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { page, limit } = request.query as { page: number; limit: number }
    const offset = (page - 1) * limit

    const countResult = await fastify.db.query(
      'SELECT COUNT(*) FROM admin_users WHERE deleted_at IS NULL',
    )
    const total = parseInt(countResult.rows[0].count, 10)

    const result = await fastify.db.query(
      `SELECT id, name, email, role, last_login, created_at
       FROM admin_users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    return reply.code(200).send({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    })
  })

  // ─── POST /admin/users ────────────────────────────────
  fastify.post('/admin/users', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password', 'role'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          email: { type: 'string', format: 'email', maxLength: 255 },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['superadmin', 'admin', 'viewer'] },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      email: string
      password: string
      role: 'superadmin' | 'admin' | 'viewer'
    }

    // Verifica email duplicado
    const emailCheck = await fastify.db.query(
      'SELECT id FROM admin_users WHERE email = $1 AND deleted_at IS NULL',
      [body.email],
    )
    if (emailCheck.rows.length > 0) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'Este email já está cadastrado.',
        field: 'email',
        code: 409,
      })
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)

    const result = await fastify.db.query(
      `INSERT INTO admin_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [body.name, body.email, passwordHash, body.role],
    )
    const user = result.rows[0]

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'user_created',
      payload: { user_id: user.id, email: user.email, role: user.role },
      ipAddress: request.ip,
    })

    return reply.code(201).send(user)
  })

  // ─── PUT /admin/users/:id ─────────────────────────────
  fastify.put('/admin/users/:id', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          email: { type: 'string', format: 'email', maxLength: 255 },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['superadmin', 'admin', 'viewer'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>

    // Busca usuário atual
    const existing = await fastify.db.query(
      'SELECT id, role FROM admin_users WHERE id = $1 AND deleted_at IS NULL',
      [id],
    )
    if (existing.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Usuário não encontrado.',
        code: 404,
      })
    }

    // Superadmin não pode remover sua própria role de superadmin
    if (id === request.admin.id && body['role'] && body['role'] !== 'superadmin') {
      return reply.code(422).send({
        error: 'cannot_demote_self',
        message: 'Você não pode remover sua própria role de superadmin.',
        code: 422,
      })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let paramIdx = 1
    const changes: Record<string, unknown> = {}

    if (body['name'] !== undefined) {
      updates.push(`name = $${paramIdx++}`)
      values.push(body['name'])
      changes['name'] = body['name']
    }

    if (body['email'] !== undefined) {
      // Verifica email duplicado (excluindo o próprio)
      const emailCheck = await fastify.db.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [body['email'], id],
      )
      if (emailCheck.rows.length > 0) {
        return reply.code(409).send({
          error: 'conflict',
          message: 'Este email já está cadastrado.',
          field: 'email',
          code: 409,
        })
      }
      updates.push(`email = $${paramIdx++}`)
      values.push(body['email'])
      changes['email'] = body['email']
    }

    if (body['password'] !== undefined) {
      const hash = await bcrypt.hash(body['password'] as string, BCRYPT_ROUNDS)
      updates.push(`password_hash = $${paramIdx++}`)
      values.push(hash)
      changes['password'] = 'updated'
    }

    if (body['role'] !== undefined) {
      updates.push(`role = $${paramIdx++}`)
      values.push(body['role'])
      changes['role'] = body['role']
    }

    if (updates.length === 0) {
      return reply.code(422).send({
        error: 'no_changes',
        message: 'Nenhum campo para atualizar.',
        code: 422,
      })
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(id)

    const result = await fastify.db.query(
      `UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, name, email, role, last_login, created_at, updated_at`,
      values,
    )

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'user_updated',
      payload: { user_id: id, changes },
      ipAddress: request.ip,
    })

    return reply.code(200).send(result.rows[0])
  })

  // ─── DELETE /admin/users/:id ──────────────────────────
  fastify.delete('/admin/users/:id', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Superadmin não pode deletar a si mesmo
    if (id === request.admin.id) {
      return reply.code(422).send({
        error: 'cannot_delete_self',
        message: 'Você não pode deletar sua própria conta.',
        code: 422,
      })
    }

    const result = await fastify.db.query(
      `UPDATE admin_users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, email`,
      [id],
    )

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Usuário não encontrado.',
        code: 404,
      })
    }

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'user_deleted',
      payload: { user_id: id, email: result.rows[0].email },
      ipAddress: request.ip,
    })

    return reply.code(200).send({ message: 'Usuário removido com sucesso.' })
  })
}

export default userRoutes
