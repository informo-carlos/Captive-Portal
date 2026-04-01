import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export type Role = 'superadmin' | 'admin' | 'viewer'

const ROLE_HIERARCHY: Record<Role, number> = {
  superadmin: 3,
  admin: 2,
  viewer: 1,
}

export interface AdminPayload {
  id: string
  email: string
  role: Role
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (minRole: Role) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    admin: AdminPayload
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: Role }
    user: { sub: string; email: string; role: Role }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: fastify.config.jwtSecret,
    sign: { expiresIn: fastify.config.jwtExpiresIn },
  })

  // Middleware de autenticação — verifica JWT e busca usuário no banco
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({
        error: 'invalid_token',
        message: 'Token inválido ou expirado.',
        code: 401,
      })
    }

    const { sub } = request.user

    const result = await fastify.db.query(
      'SELECT id, email, role FROM admin_users WHERE id = $1 AND deleted_at IS NULL',
      [sub],
    )

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: 'user_not_found',
        message: 'Usuário não encontrado ou desativado.',
        code: 401,
      })
    }

    const user = result.rows[0]
    request.admin = {
      id: user.id,
      email: user.email,
      role: user.role as Role,
    }
  })

  // Decorator de role check — verifica se o role do usuário é suficiente
  fastify.decorate('requireRole', (minRole: Role) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const userLevel = ROLE_HIERARCHY[request.admin.role] ?? 0
      const requiredLevel = ROLE_HIERARCHY[minRole]

      if (userLevel < requiredLevel) {
        return reply.code(403).send({
          error: 'insufficient_role',
          message: 'Você não tem permissão para esta ação.',
          code: 403,
        })
      }
    }
  })
})
