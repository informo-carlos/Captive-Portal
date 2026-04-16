import type { FastifyPluginAsync } from 'fastify'

const brandingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/branding', async (_request, reply) => {
    const result = await fastify.db.query(
      'SELECT branding FROM tenants WHERE id = $1',
      [fastify.config.tenantId],
    )

    const branding = result.rows[0]?.branding || {}

    return reply
      .header('Cache-Control', 'public, max-age=300')
      .send({
        logo_url: branding.logo_url || null,
        primary_color: branding.primary_color || '#00e5c3',
        secondary_color: branding.secondary_color || '#0a0e17',
        welcome_text: branding.welcome_text || null,
      })
  })
}

export default brandingRoutes
