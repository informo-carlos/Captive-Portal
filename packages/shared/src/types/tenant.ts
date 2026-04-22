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

/** Modo de autenticação do tenant — define qual Strategy roda no verify-otp. */
export type AuthMode = 'sonicwall' | 'radius'

/**
 * Config RADIUS por tenant. `shared_secret` é criptografado AES-256 antes de
 * gravar — pra cliente nunca vira no response, usar `RadiusConfigPublic`.
 * Spec: docs/spec-radius-auth.md §3.3
 */
export interface RadiusConfig {
  /** Shared secret entre firewall e nosso container (server-to-server). */
  shared_secret: string
  /** Porta UDP do CoA no NAS — default 3799 (RFC 5176). */
  coa_port?: number
  /** Duração da sessão em segundos (vai como Session-Timeout no Access-Accept). */
  session_timeout_sec?: number
  /** Lista de IPs/CIDRs permitidos a enviar pacotes RADIUS — vazio = aceita de qualquer NAS. */
  nas_ip_allowlist?: string[]
}

/** Versão de `RadiusConfig` devolvida pela API — sem o shared_secret. */
export type RadiusConfigPublic = Omit<RadiusConfig, 'shared_secret'> & {
  /** Se o shared_secret está configurado (pra UI mostrar "configurado/não configurado"). */
  has_shared_secret: boolean
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
  /** Strategy de auth ativa. Default 'sonicwall' pra tenants pré-RADIUS. */
  auth_mode: AuthMode
  serials: TenantSerial[]
  sonicwall_config?: Omit<SonicwallConfig, 'password'>
  radius_config?: RadiusConfigPublic
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
  /** Default 'sonicwall' se omitido (preserva semântica pré-RADIUS). */
  auth_mode?: AuthMode
  serials: { serial: string; role: 'primary' | 'secondary' }[]
  /** Obrigatório quando auth_mode='sonicwall' (ou omitido). */
  sonicwall_config?: SonicwallConfig
  /** Obrigatório quando auth_mode='radius'. */
  radius_config?: RadiusConfig
  zenvia_token: string
  zenvia_sender: string
  session_duration_minutes?: number
  branding?: TenantBranding
}

export interface UpdateTenantRequest {
  name?: string
  auth_mode?: AuthMode
  serials?: { serial: string; role: 'primary' | 'secondary' }[]
  sonicwall_config?: Partial<SonicwallConfig>
  radius_config?: Partial<RadiusConfig>
  zenvia_token?: string
  zenvia_sender?: string
  session_duration_minutes?: number
  branding?: TenantBranding
}
