import type { FastifyPluginAsync } from 'fastify'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    // Verifica se o banco está acessível
    try {
      await fastify.db.query('SELECT 1')
    } catch {
      return reply.code(503).send({
        status: 'error',
        message: 'Banco de dados indisponível',
      })
    }

    return reply.code(200).send({
      status: 'ok',
      service: 'admin-backend',
    })
  })
}

export default healthRoutes
