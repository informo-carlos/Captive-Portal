import Docker from 'dockerode'
import { config } from './config.js'
import type { PendingTenant } from './db.js'

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

/** Nome previsível do container por tenant. */
export function containerNameFor(tenant: PendingTenant): string {
  // Sanitiza o nome pra um slug seguro pro Docker (só [a-z0-9-]).
  const slug = tenant.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `portal-${slug}-${tenant.port}`
}

/** Remove container existente com esse nome (se houver). Idempotente. */
export async function removeExistingContainer(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name)
    await container.inspect()
    // Existe — remove
    try {
      await container.stop({ t: 5 })
    } catch {
      // já estava parado, tudo bem
    }
    await container.remove({ force: true })
  } catch (err: unknown) {
    // 404 = não existe, ok
    const e = err as { statusCode?: number }
    if (e.statusCode !== 404) throw err
  }
}

/**
 * Cria e sobe o container do portal pra este tenant.
 * Retorna o containerId ao iniciar.
 */
export async function createPortalContainer(tenant: PendingTenant): Promise<string> {
  const name = containerNameFor(tenant)
  await removeExistingContainer(name)

  const sw = tenant.sonicwall_config
  const rad = tenant.radius_config
  const isRadius = tenant.auth_mode === 'radius'

  // Env comum (inclui defaults vazios pra SonicWall em tenants RADIUS-only,
  // que o config.ts do portal aceita quando AUTH_MODE=radius).
  const env: string[] = [
    `PORT=3000`,
    `TENANT_ID=${tenant.id}`,
    `ALLOWED_SERIALS=${tenant.serials.join(',')}`,
    `DATABASE_URL=${process.env['DATABASE_URL'] ?? ''}`,
    `REDIS_URL=${process.env['REDIS_URL'] ?? ''}`,
    `ZENVIA_TOKEN=${tenant.zenvia_token}`,
    `ZENVIA_SENDER=${tenant.zenvia_sender}`,
    `AUTH_MODE=${tenant.auth_mode}`,
    // SonicWall — obrigatório quando auth_mode=sonicwall, opcional caso contrário
    `SONICWALL_HOST=${sw.host ?? ''}`,
    `SONICWALL_PORT=${sw.port ?? 443}`,
    `SONICWALL_USER=${sw.user ?? ''}`,
    `SONICWALL_PASS=${sw.password ?? ''}`,
    `SONICWALL_FIRMWARE=${sw.firmware ?? 7}`,
    `SONICWALL_MODE=${sw.mode ?? 'rest'}`,
    `SONICWALL_LHM_PORT=${sw.lhm_port ?? 4043}`,
    `SONICWALL_GUEST_SERVICE_USER=${sw.guest_service_user ?? ''}`,
    `SONICWALL_GUEST_SERVICE_PASS=${sw.guest_service_pass ?? ''}`,
    `JWT_SECRET=${config.jwtSecret}`,
    `ENCRYPTION_KEY=${config.encryptionKey}`,
    `NODE_ENV=production`,
  ]

  // RADIUS env vars — o listener sobe interno nas 1812/1813, o provisioner
  // cuida do port mapping externo via HostConfig.PortBindings (abaixo).
  // RADIUS_SESSION_TIMEOUT_SEC vem de session_duration_minutes do tenant
  // (1 fonte de verdade) — não duplicamos em radius_config.
  if (isRadius) {
    env.push(
      `RADIUS_AUTH_PORT=1812`,
      `RADIUS_ACCT_PORT=1813`,
      `RADIUS_COA_PORT=${rad?.coa_port ?? 3799}`,
      `RADIUS_SHARED_SECRET=${rad?.shared_secret ?? ''}`,
      `RADIUS_SESSION_TIMEOUT_SEC=${tenant.session_duration_minutes * 60}`,
    )
  }

  // ExposedPorts + port bindings
  const exposedPorts: Record<string, Record<string, never>> = { '3000/tcp': {} }
  const portBindings: Record<string, { HostPort: string }[]> = {}

  if (isRadius) {
    if (tenant.radius_auth_port === null || tenant.radius_acct_port === null) {
      throw new Error(
        'Tenant RADIUS sem par de portas UDP alocadas — admin-backend deveria ter atribuído no INSERT',
      )
    }
    exposedPorts['1812/udp'] = {}
    exposedPorts['1813/udp'] = {}
    portBindings['1812/udp'] = [{ HostPort: String(tenant.radius_auth_port) }]
    portBindings['1813/udp'] = [{ HostPort: String(tenant.radius_acct_port) }]
  }

  const labels: Record<string, string> = {
    'captive.tenant': 'true',
    'captive.tenant_id': tenant.id,
    'captive.tenant_name': tenant.name,
    'captive.port': String(tenant.port),
    'captive.auth_mode': tenant.auth_mode,
  }
  if (isRadius && tenant.radius_auth_port !== null && tenant.radius_acct_port !== null) {
    labels['captive.radius_auth_port'] = String(tenant.radius_auth_port)
    labels['captive.radius_acct_port'] = String(tenant.radius_acct_port)
  }

  const container = await docker.createContainer({
    name,
    Image: config.portalImage,
    Env: env,
    ExposedPorts: exposedPorts,
    Labels: labels,
    HostConfig: {
      RestartPolicy: { Name: 'unless-stopped' },
      NetworkMode: config.internalNetwork,
      ...(isRadius ? { PortBindings: portBindings } : {}),
    },
  })

  await container.start()
  return container.id
}

/**
 * Aguarda o container ficar "saudável" via healthcheck do próprio Docker
 * (se a imagem tiver HEALTHCHECK), ou cai pra checar `State.Running` por
 * alguns segundos.
 */
export async function waitContainerHealthy(
  containerId: string,
  timeoutSec: number,
): Promise<void> {
  const container = docker.getContainer(containerId)
  const deadline = Date.now() + timeoutSec * 1000

  while (Date.now() < deadline) {
    const info = await container.inspect()
    if (!info.State.Running) {
      throw new Error(
        `Container parou durante o provisionamento (ExitCode=${info.State.ExitCode})`,
      )
    }
    const health = info.State.Health?.Status
    if (health === 'healthy') return
    if (health === 'unhealthy') {
      throw new Error('Healthcheck do container reportou unhealthy')
    }
    // Se não há healthcheck definido, aceitamos "running" após um delay curto
    if (!info.State.Health && Date.now() - Date.parse(info.State.StartedAt) > 3000) {
      return
    }
    await sleep(1000)
  }
  throw new Error(`Timeout de ${timeoutSec}s aguardando o container ficar saudável`)
}

/**
 * Reload do nginx via docker exec. Antes de reload, roda `nginx -t` pra
 * validar a sintaxe da config gerada e aguarda o ExitCode de cada exec.
 * Se qualquer comando sair com código != 0, joga erro (tenant vai pra
 * status=failed em vez de ser marcado active silenciosamente).
 */
export async function reloadNginx(): Promise<void> {
  const container = docker.getContainer(config.nginxContainer)
  await runExecOrThrow(container, ['nginx', '-t'], 'nginx_test')
  await runExecOrThrow(container, ['nginx', '-s', 'reload'], 'nginx_reload')
}

async function runExecOrThrow(
  container: Docker.Container,
  cmd: string[],
  label: string,
): Promise<void> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({})
  // Drena stdout/stderr pra garantir que o processo termine antes do inspect.
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve())
    stream.on('error', (e) => reject(e))
  })
  const info = await exec.inspect()
  if (info.ExitCode !== 0) {
    const output = Buffer.concat(chunks).toString('utf8').slice(0, 500)
    throw new Error(
      `${label} falhou (exit=${info.ExitCode}): ${output || '(sem saída)'}`,
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
