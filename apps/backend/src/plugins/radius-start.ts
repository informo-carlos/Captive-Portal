// Plugin que sobe o listener RADIUS no boot quando config.radius.enabled=true.
// Depende de `redis` e `config` já decorados — registrar DEPOIS de redisPlugin.
//
// Em tenants sonicwall-only o start() é no-op (config.radius.enabled=false)
// e nenhum socket UDP é aberto.
//
// Spec: docs/spec-radius-auth.md §7-B10

import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { start as startRadius, stop as stopRadius } from '../services/radius'

export default fp(async function radiusStartPlugin(fastify: FastifyInstance) {
  await startRadius({
    fastify,
    config: fastify.config.radius,
    tenantId: fastify.config.tenantId,
    redis: fastify.redis,
  })

  fastify.addHook('onClose', async () => {
    await stopRadius(fastify.log)
  })
})
