// Configuração do provisioner — lê envs obrigatórios e falha rápido se faltar.

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`[provisioner] env var obrigatória ausente: ${name}`)
    process.exit(1)
  }
  return v
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  encryptionKey: required('ENCRYPTION_KEY'),
  jwtSecret: required('JWT_SECRET'),
  // Nome da imagem Docker construída a partir de apps/backend. O compose
  // principal já builda essa imagem (portal-cliente-exemplo) — o provisioner
  // reaproveita a mesma imagem pra criar novos containers.
  portalImage: process.env['PORTAL_IMAGE'] || 'captive-portal-backend:latest',
  // Nome da rede Docker pra anexar os containers novos — precisa ser a mesma
  // do postgres/redis pra que os novos containers consigam resolver `postgres`
  // e `redis` pelos nomes internos.
  internalNetwork: process.env['INTERNAL_NETWORK'] || 'infra_internal',
  // Diretório (dentro do container do provisioner) onde escrevemos os .conf
  // de nginx por tenant. É um volume compartilhado com o container do nginx.
  nginxConfDir: process.env['NGINX_CONF_DIR'] || '/etc/nginx/conf.d/tenants',
  // Nome do container do nginx — usado pra reload via docker exec.
  nginxContainer: process.env['NGINX_CONTAINER'] || 'infra-nginx-1',
  // Intervalo de polling em ms.
  pollIntervalMs: parseInt(process.env['POLL_INTERVAL_MS'] || '5000', 10),
  // Timeout máximo pro healthcheck do container recém-criado (segundos).
  healthcheckTimeoutSec: parseInt(process.env['HEALTHCHECK_TIMEOUT_SEC'] || '60', 10),
} as const
