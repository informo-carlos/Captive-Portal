import type { FastifyPluginAsync } from 'fastify'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    try {
      // Verifica conexão com o banco
      await fastify.db.query('SELECT 1')
      // Verifica conexão com o Redis
      await fastify.redis.ping()
    } catch (err) {
      fastify.log.error({ error: (err as Error).message }, 'health_check_failed')
      return reply.code(503).send({
        status: 'error',
        tenant_id: fastify.config.tenantId,
        port: fastify.config.port,
      })
    }

    return reply.send({
      status: 'ok',
      tenant_id: fastify.config.tenantId,
      port: fastify.config.port,
    })
  })
}

export default healthRoutes
