import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async function redisPlugin(fastify: FastifyInstance) {
  const redis = new Redis(fastify.config.redisUrl)

  // Testa a conexão na inicialização
  await redis.ping()

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
})
