import { Pool } from 'pg'
import { decrypt } from './crypto.js'
import { config } from './config.js'

export const pool = new Pool({ connectionString: config.databaseUrl })

export interface PendingTenant {
  id: string
  name: string
  port: number
  status: string
  sonicwall_config: SonicwallConfigDecrypted
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes: number
  serials: string[]
}

interface SonicwallConfigDecrypted {
  host: string
  port?: number
  user: string
  password: string
  firmware?: number
  mode: 'rest' | 'lhm'
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

interface TenantRow {
  id: string
  name: string
  port: number
  status: string
  sonicwall_config: unknown
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes: number
  serials: string[]
}

function decryptSonicwallConfig(raw: unknown): SonicwallConfigDecrypted {
  if (!raw || typeof raw !== 'object') {
    throw new Error('sonicwall_config vazio ou inválido')
  }
  const obj = raw as { encrypted?: string }
  if (!obj.encrypted || typeof obj.encrypted !== 'string') {
    throw new Error('sonicwall_config não está no formato { encrypted }')
  }
  const json = decrypt(obj.encrypted, config.encryptionKey)
  return JSON.parse(json) as SonicwallConfigDecrypted
}

/** Busca tenants que precisam ser provisionados (status='provisioning'). */
export async function fetchPendingTenants(): Promise<PendingTenant[]> {
  const res = await pool.query<TenantRow>(
    `SELECT t.id, t.name, t.port, t.status, t.sonicwall_config,
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
    sonicwall_config: decryptSonicwallConfig(row.sonicwall_config),
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
