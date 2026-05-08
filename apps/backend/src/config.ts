// Leitura e validação de todas as variáveis de ambiente do portal.
// Falha rápido na inicialização se algo estiver faltando.

export interface PortalConfig {
  port: number
  tenantId: string
  allowedSerials: string[]
  databaseUrl: string
  redisUrl: string
  zenviaToken: string
  zenviaSender: string
  authMode: 'sonicwall' | 'radius'
  sonicwall: {
    host: string
    port: number
    user: string
    pass: string
    firmware: '6' | '7'
    mode: 'rest' | 'lhm'
    lhmPort: number
    guestServiceUser: string
    guestServicePass: string
    /**
     * URL base do mgmt LHM via WireGuard VPN (ex: "https://198.18.0.5:4443/").
     * Quando definida, o backend faz POST server-side direto pro SonicWall via
     * tunnel em vez de devolver `lhmPost` instruction pro frontend.
     * Injetada pelo provisioner a partir de `tenant.lhm_mgmt_lan_url`.
     * Undefined = tenant sem VPN configurada (modo legado com lhmPost).
     */
    lhmMgmtLanUrl: string | undefined
  }
  radius: {
    enabled: boolean
    authPort: number
    acctPort: number
    coaPort: number
    sharedSecret: string
    sessionTimeoutSec: number
  }
  nodeEnv: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  }
  return value
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} inválido: "${raw}" — esperado inteiro positivo`)
  }
  return n
}

export function loadConfig(): PortalConfig {
  const authMode = (process.env['AUTH_MODE'] || 'sonicwall') as 'sonicwall' | 'radius'
  if (authMode !== 'sonicwall' && authMode !== 'radius') {
    throw new Error(`AUTH_MODE inválido: "${authMode}". Valores aceitos: sonicwall, radius`)
  }

  const mode = (process.env['SONICWALL_MODE'] || 'rest') as 'rest' | 'lhm'
  const firmware = (process.env['SONICWALL_FIRMWARE'] || '7') as '6' | '7'

  if (mode !== 'rest' && mode !== 'lhm') {
    throw new Error(`SONICWALL_MODE inválido: "${mode}". Valores aceitos: rest, lhm`)
  }

  if (firmware !== '6' && firmware !== '7') {
    throw new Error(`SONICWALL_FIRMWARE inválido: "${firmware}". Valores aceitos: 6, 7`)
  }

  const serialsRaw = requireEnv('ALLOWED_SERIALS')
  const allowedSerials = serialsRaw.split(',').map((s) => s.trim()).filter(Boolean)

  if (allowedSerials.length === 0) {
    throw new Error('ALLOWED_SERIALS deve conter ao menos um serial')
  }

  // LHM exige campos adicionais — só quando o tenant está em modo sonicwall/lhm.
  if (authMode === 'sonicwall' && mode === 'lhm') {
    requireEnv('SONICWALL_GUEST_SERVICE_USER')
    requireEnv('SONICWALL_GUEST_SERVICE_PASS')
  }

  // Em modo RADIUS o SonicWall vira opcional — tenant RADIUS-only não precisa
  // dessas credenciais. Fornecemos fallbacks vazios pra manter o shape do config.
  const swRequired = authMode === 'sonicwall'
  const swHost = swRequired ? requireEnv('SONICWALL_HOST') : (process.env['SONICWALL_HOST'] || '')
  const swUser = swRequired ? requireEnv('SONICWALL_USER') : (process.env['SONICWALL_USER'] || '')
  const swPass = swRequired ? requireEnv('SONICWALL_PASS') : (process.env['SONICWALL_PASS'] || '')

  const radiusEnabled = authMode === 'radius'
  const radiusSharedSecret = radiusEnabled
    ? requireEnv('RADIUS_SHARED_SECRET')
    : (process.env['RADIUS_SHARED_SECRET'] || '')

  return {
    port: parseIntEnv('PORT', 3000),
    tenantId: requireEnv('TENANT_ID'),
    allowedSerials,
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
    zenviaToken: process.env['ZENVIA_TOKEN'] || '',
    zenviaSender: process.env['ZENVIA_SENDER'] || '',
    authMode,
    sonicwall: {
      host: swHost,
      port: parseIntEnv('SONICWALL_PORT', 443),
      user: swUser,
      pass: swPass,
      firmware,
      mode,
      lhmPort: parseIntEnv('SONICWALL_LHM_PORT', 4043),
      guestServiceUser: process.env['SONICWALL_GUEST_SERVICE_USER'] || '',
      guestServicePass: process.env['SONICWALL_GUEST_SERVICE_PASS'] || '',
      lhmMgmtLanUrl: process.env['LHM_MGMT_LAN_URL'] || undefined,
    },
    radius: {
      enabled: radiusEnabled,
      authPort: parseIntEnv('RADIUS_AUTH_PORT', 1812),
      acctPort: parseIntEnv('RADIUS_ACCT_PORT', 1813),
      coaPort: parseIntEnv('RADIUS_COA_PORT', 3799),
      sharedSecret: radiusSharedSecret,
      sessionTimeoutSec: parseIntEnv('RADIUS_SESSION_TIMEOUT_SEC', 14400),
    },
    nodeEnv: process.env['NODE_ENV'] || 'development',
  }
}
