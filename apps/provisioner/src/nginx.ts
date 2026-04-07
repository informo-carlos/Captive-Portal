import { promises as fs } from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import type { PendingTenant } from './db.js'
import { containerNameFor } from './docker.js'

/**
 * Gera o bloco de nginx pra esse tenant e grava em
 * /etc/nginx/conf.d/tenants/<port>.conf (volume compartilhado com o nginx).
 *
 * O nginx.conf principal faz `include conf.d/tenants/*.conf`.
 */
export async function writeNginxConfig(tenant: PendingTenant): Promise<string> {
  const containerName = containerNameFor(tenant)
  const conf = `# Auto-gerado pelo provisioner — tenant ${tenant.id} (${tenant.name})
# NÃO EDITAR À MÃO — será sobrescrito no próximo provisionamento.

server {
    listen ${tenant.port};
    server_name _;

    location /auth/ {
        proxy_pass http://${containerName}:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 15s;
    }

    location /health {
        proxy_pass http://${containerName}:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://portal-frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
`
  await fs.mkdir(config.nginxConfDir, { recursive: true })
  const file = path.join(config.nginxConfDir, `${tenant.port}.conf`)
  await fs.writeFile(file, conf, 'utf8')
  return file
}
