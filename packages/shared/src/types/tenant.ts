export interface TenantSerial {
  id: string
  serial: string
  role: 'primary' | 'secondary'
}

export interface SonicwallConfig {
  host: string
  port?: number
  user: string
  password?: string
  firmware?: number
  mode?: 'rest' | 'lhm'
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

export interface Tenant {
  id: string
  name: string
  port: number
  status: 'active' | 'inactive' | 'deleted'
  serials: TenantSerial[]
  sonicwall_config?: Omit<SonicwallConfig, 'password'>
  zenvia_token?: string
  sessions_count?: number
  created_at: string
  updated_at?: string
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
}

export interface UpdateTenantRequest {
  name?: string
  serials?: { serial: string; role: 'primary' | 'secondary' }[]
  sonicwall_config?: Partial<SonicwallConfig>
  zenvia_token?: string
}
