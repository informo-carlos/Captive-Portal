export interface TenantSerial {
  id: string
  serial: string
  role: 'primary' | 'secondary'
}

export interface TenantBranding {
  logo_url?: string
  primary_color?: string    // hex string e.g. "#00e5c3"
  secondary_color?: string  // hex string e.g. "#0a0e17"
  welcome_text?: string     // texto de boas-vindas na tela de login
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

/**
 * Modo de autenticação do tenant.
 * - `sonicwall` — usa SonicwallConfig (REST ou LHM), integração proprietária.
 * - `radius` — RADIUS + MAB com sessão efêmera no Redis (multi-vendor,
 *   ver docs/spec-radius-auth.md §1.1: sem cadastro prévio de usuário).
 */
export type AuthMode = 'sonicwall' | 'radius'

/**
 * Configuração RADIUS por tenant. Preenchido apenas quando auth_mode='radius'.
 * O `shared_secret` é criptografado em repouso (AES-256) — nunca retornado pela API.
 */
export interface RadiusConfig {
  /** Segredo compartilhado firewall↔container. Server-to-server. Nunca chega ao guest. */
  shared_secret?: string
  /** Porta UDP que recebe CoA-Disconnect no NAS. Default 3799 (RFC 5176). */
  coa_port?: number
  /** Tempo de sessão em segundos (300–86400). TTL da chave Redis de autorização. */
  session_timeout_sec?: number
  /**
   * Lista de IPs/CIDRs permitidos a falar RADIUS com este container.
   * Vazio = aceita qualquer origem (não recomendado).
   */
  nas_ip_allowlist?: string[]
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
  /** Modo de autenticação. Default 'sonicwall' pra compatibilidade com tenants existentes. */
  auth_mode?: AuthMode
  sonicwall_config?: Omit<SonicwallConfig, 'password'>
  /** Config RADIUS sem o shared_secret — API nunca retorna o segredo. */
  radius_config?: Omit<RadiusConfig, 'shared_secret'>
  zenvia_token?: string
  /** Sender Zenvia (NUNCA retorna o valor real após criação — apenas booleano) */
  has_zenvia_sender?: boolean
  /** Mensagem de erro do worker, se status='failed' */
  provisioning_error?: string | null
  /** ID do container Docker do tenant (preenchido pelo worker) */
  container_id?: string | null
  session_duration_minutes?: number
  branding?: TenantBranding
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
  /** Default 'sonicwall' se omitido. Em 'radius' o sonicwall_config pode ser omitido. */
  auth_mode?: AuthMode
  sonicwall_config?: SonicwallConfig
  radius_config?: RadiusConfig
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes?: number
  branding?: TenantBranding
}

export interface UpdateTenantRequest {
  name?: string
  serials?: { serial: string; role: 'primary' | 'secondary' }[]
  auth_mode?: AuthMode
  sonicwall_config?: Partial<SonicwallConfig>
  radius_config?: Partial<RadiusConfig>
  zenvia_token?: string
  zenvia_sender?: string
  session_duration_minutes?: number
  branding?: TenantBranding
}
