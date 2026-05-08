import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadConfig, type AppConfig } from './config'
import postgresPlugin from './plugins/postgres'
import authPlugin from './plugins/auth'
import auditPlugin from './plugins/audit'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health'
import tenantRoutes from './routes/tenants'
import sessionRoutes from './routes/sessions'
import userRoutes from './routes/users'
import auditLogRoutes from './routes/audit-logs'
import vpnRoutes from './routes/admin/vpn'

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
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

  // Decora o fastify com a config para os plugins acessarem
  fastify.decorate('config', config)

  // Plugins — ordem importa
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await fastify.register(postgresPlugin)
  await fastify.register(authPlugin)
  await fastify.register(auditPlugin)

  // Rotas
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(tenantRoutes)
  await fastify.register(sessionRoutes)
  await fastify.register(userRoutes)
  await fastify.register(auditLogRoutes)
  await fastify.register(vpnRoutes)

  return fastify
}

async function start() {
  const app = await buildApp()

  try {
    const address = await app.listen({
      port: app.config.port,
      host: '0.0.0.0',
    })
    app.log.info(`Admin backend rodando em ${address}`)
  } catch (err) {
    app.log.fatal(err)
    process.exit(1)
  }
}

start()

export { buildApp }
