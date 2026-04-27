import { Pool } from 'pg'
import { decrypt } from './crypto.js'
import { config } from './config.js'

export const pool = new Pool({ connectionString: config.databaseUrl })

export interface PendingTenant {
  id: string
  name: string
  port: number
  status: string
  auth_mode: 'sonicwall' | 'radius'
  sonicwall_config: SonicwallConfigDecrypted
  radius_config: RadiusConfigDecrypted | null
  radius_auth_port: number | null
  radius_acct_port: number | null
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes: number
  serials: string[]
}

interface SonicwallConfigDecrypted {
  host?: string
  port?: number
  user?: string
  password?: string
  firmware?: number
  mode?: 'rest' | 'lhm'
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

interface RadiusConfigDecrypted {
  shared_secret?: string
  coa_port?: number
  nas_ip_allowlist?: string[]
}

interface TenantRow {
  id: string
  name: string
  port: number
  status: string
  auth_mode: 'sonicwall' | 'radius' | null
  sonicwall_config: unknown
  radius_config: unknown
  radius_auth_port: number | null
  radius_acct_port: number | null
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes: number
  serials: string[]
}

function decryptSonicwallConfig(raw: unknown): SonicwallConfigDecrypted {
  // Radius-only tenants têm sonicwall_config '{}' — válido, só retorna vazio.
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as { encrypted?: string }
  if (!obj.encrypted) return obj as SonicwallConfigDecrypted
  if (typeof obj.encrypted !== 'string') {
    throw new Error('sonicwall_config.encrypted não é string')
  }
  const json = decrypt(obj.encrypted, config.encryptionKey)
  return JSON.parse(json) as SonicwallConfigDecrypted
}

function decryptRadiusConfig(raw: unknown): RadiusConfigDecrypted | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { encrypted?: string }
  if (!obj.encrypted) return null
  const json = decrypt(obj.encrypted, config.encryptionKey)
  return JSON.parse(json) as RadiusConfigDecrypted
}

/**
 * Busca tenants que precisam ser provisionados (status='provisioning').
 *
 * ATENÇÃO — concorrência: esta query assume que existe apenas UMA réplica
 * do provisioner rodando. Se no futuro escalarmos pra mais de uma réplica,
 * duas vão fazer o SELECT simultaneamente e tentar provisionar o mesmo
 * tenant (race condition). O fix correto exige uma coluna `claimed_at` +
 * UPDATE atômico com RETURNING, ou advisory lock por tenant.id. Um
 * `FOR UPDATE SKIP LOCKED` simples NÃO resolve porque auto-commit libera
 * o lock assim que a query retorna. Review do Carlos no PR #18.
 */
export async function fetchPendingTenants(): Promise<PendingTenant[]> {
  const res = await pool.query<TenantRow>(
    `SELECT t.id, t.name, t.port, t.status, t.auth_mode,
            t.sonicwall_config, t.radius_config,
            t.radius_auth_port, t.radius_acct_port,
            t.zenvia_token, t.zenvia_sender, t.session_duration_minutes,
            COALESCE(
              (SELECT array_agg(ts.serial) FROM tenant_serials ts WHERE ts.tenant_id = t.id),
              ARRAY[]::text[]
            ) AS serials
       FROM tenants t
      WHERE t.status = 'provisioning' AND t.deleted_at IS NULL
      ORDER BY t.created_at ASC
      LIMIT 10`,
  )

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    port: row.port,
    status: row.status,
    auth_mode: row.auth_mode ?? 'sonicwall',
    sonicwall_config: decryptSonicwallConfig(row.sonicwall_config),
    radius_config: decryptRadiusConfig(row.radius_config),
    radius_auth_port: row.radius_auth_port,
    radius_acct_port: row.radius_acct_port,
    zenvia_token: decrypt(row.zenvia_token, config.encryptionKey),
    zenvia_sender: row.zenvia_sender ? decrypt(row.zenvia_sender, config.encryptionKey) : '',
    session_duration_minutes: row.session_duration_minutes,
    serials: row.serials,
  }))
}

export async function markTenantActive(
  tenantId: string,
  containerId: string,
): Promise<void> {
  await pool.query(
    `UPDATE tenants
        SET status = 'active',
            container_id = $2,
            provisioning_error = NULL,
            provisioned_at = COALESCE(provisioned_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [tenantId, containerId],
  )
}

export async function markTenantFailed(
  tenantId: string,
  errorMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE tenants
        SET status = 'failed',
            provisioning_error = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [tenantId, errorMessage.slice(0, 2000)],
  )
}
