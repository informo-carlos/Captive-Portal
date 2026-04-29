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
    // Health check e branding não exigem serial
    if (request.url === '/health' || request.url === '/branding') return

    // Precedência: header > query param `serial` > query param `UFI`.
    // SonicOS 7.x manda o serial como `UFI` (Unique Firewall Identifier)
    // no redirect do Captive Portal — aceitamos os dois nomes.
    const query = request.query as Record<string, string | undefined>
    const serial =
      (request.headers['x-sonicwall-serial'] as string | undefined) ??
      query['serial'] ??
      query['UFI']

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
