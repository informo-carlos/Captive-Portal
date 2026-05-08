import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadConfig, type PortalConfig } from './config'
import postgresPlugin from './plugins/postgres'
import redisPlugin from './plugins/redis'
import radiusStartPlugin from './plugins/radius-start'
import serialGuardPlugin from './plugins/serial-guard'
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'
import brandingRoutes from './routes/branding'

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

  // Plugins — ordem importa: postgres → redis → radius-start → serial-guard
  // radius-start precisa do redis já decorado pra MAB lookup
  await fastify.register(cors, { origin: true })
  await fastify.register(postgresPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(radiusStartPlugin)
  await fastify.register(serialGuardPlugin)

  // Rotas
  await fastify.register(healthRoutes)
  await fastify.register(brandingRoutes)
  await fastify.register(authRoutes)

  return fastify
}

/**
 * Adiciona rota pra `198.18.0.0/15 via 172.19.0.20` (container infra-wireguard).
 * Necessária quando o tenant tem VPN ativa: o backend faz POST direto pro
 * SonicWall via wg0. Requer cap NET_ADMIN no container (configurado pelo
 * provisioner).
 *
 * Fail-soft: se falhar (sem cap, container não conectado em external, etc),
 * loga warning e segue — POST LHM vai falhar runtime, mas o container sobe.
 */
function ensureVpnRoute(log: { warn: (...args: unknown[]) => void; info: (...args: unknown[]) => void }): void {
  if (!process.env['LHM_MGMT_LAN_URL']) return
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execSync } = require('node:child_process') as typeof import('node:child_process')
  try {
    execSync('ip route replace 198.18.0.0/15 via 172.19.0.20', { stdio: 'pipe' })
    log.info({ via: '172.19.0.20', range: '198.18.0.0/15' }, 'vpn_route_added')
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'vpn_route_add_failed_continuing',
    )
  }
}

async function start() {
  const app = await buildApp()

  // Adiciona rota pro tunnel WG antes de aceitar requests
  ensureVpnRoute(app.log)

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
