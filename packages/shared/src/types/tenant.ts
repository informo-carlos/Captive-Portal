export interface TenantSerial {
  id: string
  serial: string
  role: 'primary' | 'secondary'
}

export interface SonicwallConfig {
  /** Modo de integração — define quais campos são obrigatórios. */
  mode: 'rest' | 'lhm'
  /** Obrigatório só em mode='rest' (a VPS chama a API REST do SonicWall). */
  host?: string
  port?: number
  /** Obrigatório só em mode='rest'. */
  user?: string
  password?: string
  firmware?: number
  /** Opcional em LHM — só usado se o SW exigir auth no externalGuestLogin.cgi. */
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

export type TenantStatus =
  | 'provisioning'
  | 'active'
  | 'inactive'
  | 'deleted'
  | 'failed'

export interface Tenant {
  id: string
  name: string
  port: number
  status: TenantStatus
  serials: TenantSerial[]
  sonicwall_config?: Omit<SonicwallConfig, 'password'>
  zenvia_token?: string
  /** Sender Zenvia (NUNCA retorna o valor real após criação — apenas booleano) */
  has_zenvia_sender?: boolean
  /** Mensagem de erro do worker, se status='failed' */
  provisioning_error?: string | null
  /** ID do container Docker do tenant (preenchido pelo worker) */
  container_id?: string | null
  session_duration_minutes?: number
  sessions_count?: number
  created_at: string
  updated_at?: string
  provisioned_at?: string | null
}

export interface TenantDetail extends Tenant {
  stats: {
    total_sessions: number
    sessions_last_30d: number
    last_auth_at: string | null
  }
}

export interface CreateTenantRequest {
  name: string
  port: number
  serials: { serial: string; role: 'primary' | 'secondary' }[]
  sonicwall_config: SonicwallConfig
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes?: number
}

export interface UpdateTenantRequest {
  name?: string
  serials?: { serial: string; role: 'primary' | 'secondary' }[]
  sonicwall_config?: Partial<SonicwallConfig>
  zenvia_token?: string
  zenvia_sender?: string
  session_duration_minutes?: number
}
