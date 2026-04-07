import { config } from './config.js'
import {
  fetchPendingTenants,
  markTenantActive,
  markTenantFailed,
  pool,
  type PendingTenant,
} from './db.js'
import {
  createPortalContainer,
  reloadNginx,
  waitContainerHealthy,
} from './docker.js'
import { writeNginxConfig } from './nginx.js'

function log(level: 'info' | 'warn' | 'error', msg: string, meta?: unknown): void {
  const line = { ts: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line))
}

async function processTenant(tenant: PendingTenant): Promise<void> {
  log('info', 'provisioning_start', { tenantId: tenant.id, name: tenant.name, port: tenant.port })
  try {
    const containerId = await createPortalContainer(tenant)
    log('info', 'container_created', { tenantId: tenant.id, containerId })

    await waitContainerHealthy(containerId, config.healthcheckTimeoutSec)
    log('info', 'container_healthy', { tenantId: tenant.id })

    const confFile = await writeNginxConfig(tenant)
    log('info', 'nginx_conf_written', { tenantId: tenant.id, confFile })

    await reloadNginx()
    log('info', 'nginx_reloaded', { tenantId: tenant.id })

    await markTenantActive(tenant.id, containerId)
    log('info', 'provisioning_success', { tenantId: tenant.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', 'provisioning_failed', { tenantId: tenant.id, error: message })
    try {
      await markTenantFailed(tenant.id, message)
    } catch (markErr) {
      log('error', 'mark_failed_error', {
        tenantId: tenant.id,
        error: markErr instanceof Error ? markErr.message : String(markErr),
      })
    }
  }
}

let stopping = false
let loopFinished: Promise<void> | null = null

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const pending = await fetchPendingTenants()
      if (pending.length > 0) {
        log('info', 'pending_tenants_found', { count: pending.length })
        for (const tenant of pending) {
          // Não interrompemos um processTenant já iniciado — deixamos ele
          // terminar (sucesso ou failed) pra não deixar tenant preso em
          // 'provisioning'. Só paramos ANTES de começar o próximo.
          if (stopping) break
          await processTenant(tenant)
        }
      }
    } catch (err) {
      log('error', 'poll_error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (stopping) break
    await sleep(config.pollIntervalMs)
  }
  log('info', 'loop_exited_cleanly')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  log('info', 'shutdown_signal', { signal })
  stopping = true
  // Aguarda a iteração atual terminar antes de fechar o pool.
  try {
    if (loopFinished) await loopFinished
  } catch {
    // ignore
  }
  try {
    await pool.end()
  } catch {
    // ignore
  }
  log('info', 'shutdown_complete')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

log('info', 'provisioner_starting', {
  pollIntervalMs: config.pollIntervalMs,
  healthcheckTimeoutSec: config.healthcheckTimeoutSec,
  internalNetwork: config.internalNetwork,
  portalImage: config.portalImage,
})

loopFinished = loop()
void loopFinished
