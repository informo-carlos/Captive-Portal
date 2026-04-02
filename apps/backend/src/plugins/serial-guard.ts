import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
  }
}

export default fp(async function serialGuardPlugin(fastify: FastifyInstance) {
  const { allowedSerials, tenantId } = fastify.config

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    // Precedência: header > query param (conforme spec)
    const serial =
      (request.headers['x-sonicwall-serial'] as string | undefined) ??
      (request.query as Record<string, string>)['serial']

    if (!serial || !allowedSerials.includes(serial)) {
      request.log.warn(
        { serial: serial ?? 'ausente', allowedSerials },
        'serial_rejected',
      )

      return reply.code(403).send({
        error: 'unauthorized_firewall',
        message: 'Este dispositivo não está autorizado a usar este portal.',
        code: 403,
      })
    }

    request.tenantId = tenantId
  })
})
