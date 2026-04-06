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

export function loadConfig(): PortalConfig {
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

  // LHM exige campos adicionais
  if (mode === 'lhm') {
    requireEnv('SONICWALL_GUEST_SERVICE_USER')
    requireEnv('SONICWALL_GUEST_SERVICE_PASS')
  }

  return {
    port: parseInt(process.env['PORT'] || '3000', 10),
    tenantId: requireEnv('TENANT_ID'),
    allowedSerials,
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
    zenviaToken: requireEnv('ZENVIA_TOKEN'),
    zenviaSender: requireEnv('ZENVIA_SENDER'),
    sonicwall: {
      host: requireEnv('SONICWALL_HOST'),
      port: parseInt(process.env['SONICWALL_PORT'] || '443', 10),
      user: requireEnv('SONICWALL_USER'),
      pass: requireEnv('SONICWALL_PASS'),
      firmware,
      mode,
      lhmPort: parseInt(process.env['SONICWALL_LHM_PORT'] || '4043', 10),
      guestServiceUser: process.env['SONICWALL_GUEST_SERVICE_USER'] || '',
      guestServicePass: process.env['SONICWALL_GUEST_SERVICE_PASS'] || '',
    },
    nodeEnv: process.env['NODE_ENV'] || 'development',
  }
}
