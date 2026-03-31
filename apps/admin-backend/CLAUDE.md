# CLAUDE.md — apps/admin-backend (Admin Backend)

> Contexto específico do admin backend. Leia também o CLAUDE.md da raiz.

## O que este app faz

API REST consumida pelo painel admin web. Gerencia tenants, usuários admin,
sessões Wi-Fi e relatórios. Protegida por JWT com sistema de roles.

## Spec de referência

**`docs/spec-admin-api.md`** — fonte de verdade para todos os endpoints deste app.

## Roles — checar em toda rota de escrita

```typescript
// Decorator disponível após plugins/auth.ts ser registrado:
fastify.decorate('requireRole', (minRole: Role) => ...)

// Uso numa rota:
{ preHandler: [fastify.authenticate, fastify.requireRole('admin')] }
```

Hierarquia: `superadmin` > `admin` > `viewer`

## Campos sensíveis — obrigatório criptografar

Os campos abaixo NUNCA ficam em plaintext no banco.
Usar `services/crypto.ts` (AES-256) antes de salvar e depois de ler:

- `tenants.sonicwall_config` (o objeto inteiro, jsonb criptografado)
- `tenants.zenvia_token`

## Audit log — obrigatório em toda mutação

```typescript
import { logAudit } from '../plugins/audit'

await logAudit(fastify.db, {
  adminUserId: request.admin.id,
  action: 'tenant_created',
  payload: { tenantId: tenant.id, name: tenant.name, port: tenant.port },
  ipAddress: request.ip,
})
```

Ações que precisam de audit log: login, tenant_created, tenant_updated,
tenant_deactivated, tenant_deleted, user_created, user_updated, user_deleted.

## Paginação — padrão obrigatório em todas as listagens

```typescript
// Query params: page (default 1), limit (default 20, max 100)
// Response sempre inclui:
{
  data: [...],
  pagination: { page, limit, total, pages }
}
```
