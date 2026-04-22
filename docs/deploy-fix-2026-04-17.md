# Deploy Fix — 2026-04-17

Correções aplicadas em produção (VPS 45.7.53.80) e portadas para `develop`
via PR para eliminar dois bugs que só apareceram na hora do deploy real da
task F8 (branding + dark theme).

## 1. Conflito de prefixo `010_` nas migrations

### Problema

Duas migrations foram criadas com o mesmo prefixo numérico:

- `010_add_zenvia_sender_and_provisioning.sql` (vindo de `feat/provisioner-and-zenvia-sender`)
- `010_add_branding.sql` (vindo de `feat/task-f8-dark-theme`)

Quando os dois PRs foram mergeados em `develop`, o conflito de nome não foi
detectado (Git não reclama de prefixos iguais, só de mesmo path). Isso quebra
o `node-pg-migrate`: ao rodar `npm run migrate` do zero, a ordem entre as
duas migrations é indefinida e uma delas falha.

Em produção o sintoma foi invisível porque:
- `010_add_zenvia` já tinha sido aplicada manualmente via `psql` antes do F8
- `010_add_branding` só foi detectada quando o novo `admin-backend` tentou ler
  a coluna `branding` (que ainda não existia), resultando em erros silenciosos
  nos endpoints de branding

### Correção

`010_add_branding.sql` → **`011_add_branding.sql`**

Também foi adicionado `IF NOT EXISTS` na cláusula `ADD COLUMN` para permitir
reaplicação idempotente (já existiam instâncias onde a coluna foi criada
manualmente antes do rename).

### Como aplicar em VPS já existentes

Se a VPS **nunca** rodou a migration `010_add_branding`:

```bash
cd /opt/captive-portal
git pull origin develop
cd apps/admin-backend && npm run migrate
```

Se a VPS **já aplicou** a antiga `010_add_branding.sql` manualmente (via `psql`)
antes deste fix, o `pgmigrations` provavelmente **não** tem o registro. Rodar
`npm run migrate` tentará aplicar `011_add_branding.sql` — com `IF NOT EXISTS`
isso é seguro (não falha), mas a linha em `pgmigrations` ficará com nome novo.

Para alinhar o registro manualmente:

```sql
INSERT INTO pgmigrations (name, run_on)
VALUES ('011_add_branding', NOW());
```

## 2. Healthcheck de `admin-backend` sempre `unhealthy`

### Problema

O container `infra-admin-backend-1` aparecia como `unhealthy` indefinidamente
mesmo com o serviço respondendo corretamente.

O healthcheck em `docker-compose.yml` estava:

```yaml
test: ["CMD-SHELL", "wget -qO- http://localhost:8000/health || exit 1"]
```

O `/etc/hosts` do container alpine lista `::1 localhost` antes de
`127.0.0.1 localhost`. O `wget` do BusyBox tenta IPv6 primeiro e o Fastify
escuta apenas em IPv4 → `Connection refused` → healthcheck falha.

### Correção

Trocar `localhost` por `127.0.0.1` no `test`:

```yaml
test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8000/health || exit 1"]
```

Sem rebuild necessário — só `docker compose up -d --force-recreate admin-backend`.

## Resumo dos arquivos tocados

- `infra/postgres/migrations/010_add_branding.sql` → renomeado para `011_add_branding.sql` + `IF NOT EXISTS`
- `infra/docker-compose.yml` — healthcheck `admin-backend` usando `127.0.0.1`
