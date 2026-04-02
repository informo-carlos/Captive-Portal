import fp from 'fastify-plugin'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
  }
}

export default fp(async function postgresPlugin(fastify: FastifyInstance) {
  const pool = new Pool({
    connectionString: fastify.config.databaseUrl,
  })

  // Testa a conexão na inicialização
  const client = await pool.connect()
  client.release()

  fastify.decorate('db', pool)

  fastify.addHook('onClose', async () => {
    await pool.end()
  })
})
