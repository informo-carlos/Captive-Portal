import { config } from './config.js'
import {
  fetchDeletedTenantsToCleanup,
  fetchPendingTenants,
  markTenantActive,
  markTenantCleaned,
  markTenantFailed,
  pool,
  type DeletedTenant,
  type PendingTenant,
} from './db.js'
import {
  createPortalContainer,
  reloadNginx,
  removeContainerById,
  waitContainerHealthy,
} from './docker.js'
import { removeNginxConfig, writeNginxConfig } from './nginx.js'

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

/**
 * Limpa um tenant soft-deletado: para+remove o container, remove o
 * bloco nginx, recarrega nginx (se removeu algum arquivo) e zera
 * `container_id` no DB. Idempotente — se algo já foi removido manualmente
 * (ex: docker rm direto pelo operador), trata 404 sem erro.
 *
 * Falhas individuais não param o cleanup dos outros tenants — cada um é
 * processado em sequência e erros são logados.
 */
async function processCleanupTenant(tenant: DeletedTenant): Promise<void> {
  log('info', 'cleanup_start', {
    tenantId: tenant.id,
    name: tenant.name,
    port: tenant.port,
    containerId: tenant.container_id,
  })
  try {
    await removeContainerById(tenant.container_id)
    log('info', 'cleanup_container_removed', { tenantId: tenant.id })

    const removed = await removeNginxConfig(tenant.port)
    log('info', removed ? 'cleanup_nginx_conf_removed' : 'cleanup_nginx_conf_already_gone', {
      tenantId: tenant.id,
      port: tenant.port,
    })

    if (removed) {
      // nginx -t + reload pra dropar o block. Se a recarga falhar, deixa
      // o cleanup pendente (não zera container_id) pra retentar no
      // próximo tick. Container já foi parado, então mesmo sem reload as
      // portas estão livres pra novos tenants.
      await reloadNginx()
      log('info', 'cleanup_nginx_reloaded', { tenantId: tenant.id })
    }

    await markTenantCleaned(tenant.id)
    log('info', 'cleanup_success', { tenantId: tenant.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', 'cleanup_failed', { tenantId: tenant.id, error: message })
    // Não marca como cleaned — vai retentar no próximo tick. Operador
    // pode resolver manualmente se ficar preso (docker rm + DB UPDATE).
  }
}

let stopping = false
let loopFinished: Promise<void> | null = null

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      // 1. Cleanup ANTES de provisioning. Se um tenant deletado tá segurando
      // a porta UDP/HTTP, derrubamos primeiro pra liberar pro próximo
      // provisioning (caso comum: cliente recriou tenant na mesma porta).
      const toCleanup = await fetchDeletedTenantsToCleanup()
      if (toCleanup.length > 0) {
        log('info', 'cleanup_tenants_found', { count: toCleanup.length })
        for (const tenant of toCleanup) {
          if (stopping) break
          await processCleanupTenant(tenant)
        }
      }

      // 2. Provisioning de tenants em status='provisioning'.
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
