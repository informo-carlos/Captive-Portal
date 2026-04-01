// Leitura e validação de todas as variáveis de ambiente.
// Falha rápido na inicialização se algo estiver faltando.

export interface AppConfig {
  port: number
  databaseUrl: string
  redisUrl: string
  jwtSecret: string
  jwtExpiresIn: string
  encryptionKey: string
  nodeEnv: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  }
  return value
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env['PORT'] || '8000', 10),
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiresIn: process.env['JWT_EXPIRES_IN'] || '8h',
    encryptionKey: requireEnv('ENCRYPTION_KEY'),
    nodeEnv: process.env['NODE_ENV'] || 'development',
  }
}
