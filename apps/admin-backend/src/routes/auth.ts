import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /admin/auth/login — única rota pública
  fastify.post('/admin/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }

    // 1. Busca admin_user por email
    const result = await fastify.db.query(
      'SELECT id, name, email, password_hash, role FROM admin_users WHERE email = $1 AND deleted_at IS NULL',
      [email],
    )

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: 'invalid_credentials',
        message: 'Email ou senha incorretos.',
        code: 401,
      })
    }

    const user = result.rows[0]

    // 2. Compara password com bcrypt hash
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.code(401).send({
        error: 'invalid_credentials',
        message: 'Email ou senha incorretos.',
        code: 401,
      })
    }

    // 3. Gera JWT
    const token = fastify.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    // 4. Atualiza last_login
    await fastify.db.query(
      'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id],
    )

    // 5. Registra em audit_logs
    await fastify.logAudit({
      adminUserId: user.id,
      action: 'login',
      payload: { ip: request.ip },
      ipAddress: request.ip,
    })

    // 6. Retorna token + dados do usuário (nunca password_hash)
    return reply.code(200).send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  })

  // GET /admin/auth/me — requer JWT
  fastify.get('/admin/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await fastify.db.query(
      'SELECT id, name, email, role, last_login, created_at FROM admin_users WHERE id = $1 AND deleted_at IS NULL',
      [request.admin.id],
    )

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: 'user_not_found',
        message: 'Usuário não encontrado.',
        code: 401,
      })
    }

    const user = result.rows[0]
    return reply.code(200).send({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      last_login: user.last_login,
      created_at: user.created_at,
    })
  })
}

export default authRoutes
