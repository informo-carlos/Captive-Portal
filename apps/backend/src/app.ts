import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadConfig, type PortalConfig } from './config'
import postgresPlugin from './plugins/postgres'
import redisPlugin from './plugins/redis'
import serialGuardPlugin from './plugins/serial-guard'
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'

declare module 'fastify' {
  interface FastifyInstance {
    config: PortalConfig
  }
}

async function buildApp() {
  const config = loadConfig()

  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
    },
    trustProxy: true,
  })

  fastify.decorate('config', config)

  // Plugins — ordem importa: postgres → redis → serial-guard
  await fastify.register(cors, { origin: true })
  await fastify.register(postgresPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(serialGuardPlugin)

  // Rotas
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)

  return fastify
}

async function start() {
  const app = await buildApp()

  try {
    const address = await app.listen({
      port: app.config.port,
      host: '0.0.0.0',
    })
    app.log.info(
      { tenantId: app.config.tenantId, serials: app.config.allowedSerials },
      `Portal backend rodando em ${address}`,
    )
  } catch (err) {
    app.log.fatal(err)
    process.exit(1)
  }
}

start()

export { buildApp }
