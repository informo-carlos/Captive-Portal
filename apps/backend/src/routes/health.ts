import type { FastifyPluginAsync } from 'fastify'
import { getListenerStatus } from '../services/radius'

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

    // Status do RADIUS (se enabled). Tenant sonicwall retorna enabled=false.
    type RadiusHealth =
      | { enabled: false }
      | {
          enabled: true
          authListening: boolean
          acctListening: boolean
          auth_port: number
          acct_port: number
        }
    const radius: RadiusHealth = fastify.config.radius.enabled
      ? {
          enabled: true,
          ...getListenerStatus(),
          auth_port: fastify.config.radius.authPort,
          acct_port: fastify.config.radius.acctPort,
        }
      : { enabled: false }

    // Se RADIUS habilitado mas listeners caíram, retorna 503 pra o healthcheck
    // do Docker marcar o container como unhealthy e o provisioner ressuscitar.
    if (radius.enabled && (!radius.authListening || !radius.acctListening)) {
      fastify.log.error({ radius }, 'health_radius_listeners_down')
      return reply.code(503).send({
        status: 'error',
        tenant_id: fastify.config.tenantId,
        port: fastify.config.port,
        radius,
      })
    }

    return reply.send({
      status: 'ok',
      tenant_id: fastify.config.tenantId,
      port: fastify.config.port,
      auth_mode: fastify.config.authMode,
      radius,
    })
  })
}

export default healthRoutes
