# Spec — Admin API (Painel de Gestão)

> Este documento é a fonte de verdade para todos os endpoints do painel admin.
> Ao usar o Claude Code: `claude "implemente seguindo exatamente /docs/spec-admin-api.md"`

---

## Visão geral

O admin backend é um serviço Fastify separado, rodando na porta 8000.
Expõe uma REST API consumida pelo admin frontend (Next.js, porta 8080).
Toda rota (exceto /admin/auth/login) exige JWT válido no header Authorization.

### Variáveis de ambiente

```env
PORT=8000
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379
JWT_SECRET=...           # mesmo secret do portal backend
JWT_EXPIRES_IN=8h
```

---

## Sistema de roles

| Role | O que pode fazer |
|------|-----------------|
| `superadmin` | Tudo — inclui criar/editar/deletar usuários admin e ver audit log |
| `admin` | Criar, editar, ativar e desativar tenants. Ver sessões e relatórios. |
| `viewer` | Somente leitura — ver tenants, sessões, relatórios. Sem modificações. |

**Regra de ouro:** toda rota de escrita (POST, PUT, PATCH, DELETE) exige role `admin` ou `superadmin`.
Rotas de `/admin/users` exigem `superadmin`.

---

## Autenticação

### POST /admin/auth/login

Única rota pública (sem JWT).

#### Request

```http
POST /admin/auth/login
Content-Type: application/json

{
  "email": "admin@empresa.com",
  "password": "senha123"
}
```

#### Lógica

```
1. Busca admin_user por email
2. Compara password com bcrypt hash
3. Se inválido: retorna 401
4. Gera JWT com payload:
   { sub: user.id, email: user.email, role: user.role, iat, exp }
5. Atualiza last_login do usuário
6. Registra em audit_logs:
   { admin_user_id, action: 'login', payload: { ip }, ip_address }
7. Retorna token
```

#### Response 200

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "name": "Nome Admin",
    "email": "admin@empresa.com",
    "role": "admin"
  }
}
```

#### Response 401

```json
{
  "error": "invalid_credentials",
  "message": "Email ou senha incorretos.",
  "code": 401
}
```

---

### GET /admin/auth/me

Retorna dados do usuário autenticado pelo JWT.

```http
GET /admin/auth/me
Authorization: Bearer {token}
```

```json
{
  "id": "uuid",
  "name": "Nome Admin",
  "email": "admin@empresa.com",
  "role": "admin",
  "last_login": "2025-01-15T10:30:00Z"
}
```

---

## Tenants

### GET /admin/tenants

Lista todos os tenants.

**Roles permitidas:** viewer, admin, superadmin

#### Query params opcionais

| Param | Tipo | Descrição |
|-------|------|-----------|
| status | string | Filtro: `active`, `inactive` |
| page | int | Paginação (default: 1) |
| limit | int | Itens por página (default: 20, max: 100) |

#### Response 200

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Cliente X",
      "port": 29000,
      "status": "active",
      "serials": [
        { "id": "uuid", "serial": "SN-ABC123", "role": "primary" },
        { "id": "uuid", "serial": "SN-ABC124", "role": "secondary" }
      ],
      "sonicwall_config": {
        "host": "192.168.1.1",
        "user": "admin"
      },
      "sessions_count": 42,
      "created_at": "2025-01-10T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "pages": 1
  }
}
```

> Nota: `sonicwall_config` não deve retornar `password` nem `zenvia_token` — mascarar esses campos na query.

---

### POST /admin/tenants

Cria um novo tenant.

**Roles permitidas:** admin, superadmin

#### Request

```http
POST /admin/tenants
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Cliente Y",
  "port": 29001,
  "serials": [
    { "serial": "SN-XYZ999", "role": "primary" },
    { "serial": "SN-XYZ998", "role": "secondary" }
  ],
  "sonicwall_config": {
    "host": "10.0.0.1",
    "user": "admin",
    "password": "senha-sonicwall",
    "firmware": 7,
    "mode": "rest",              
    "lhm_port": 4043,            
    "guest_service_user": "",    
    "guest_service_pass": ""     
  },
  "zenvia_token": "token-zenvia-do-cliente"
}
```

**Campos obrigatórios:** `name`, `port`, `serials` (mínimo 1), `sonicwall_config.host`, `sonicwall_config.user`, `sonicwall_config.password`, `sonicwall_config.mode`

**`sonicwall_config.mode`:** `"rest"` (SonicOS API — padrão) ou `"lhm"` (Lightweight Hotspot Messaging). Campos `lhm_port`, `guest_service_user` e `guest_service_pass` são obrigatórios apenas quando `mode = "lhm"`.

#### Lógica

```
1. Valida que port não está em uso por outro tenant
2. Valida que os serials não estão cadastrados em outro tenant
3. Insere em tenants com status: 'active'
4. Insere em tenant_serials (1 ou 2 registros)
5. Grava audit_log: { action: 'tenant_created', payload: { tenant_id, name, port } }
6. Retorna tenant criado (sem campos sensíveis)
```

#### Response 201

```json
{
  "id": "uuid",
  "name": "Cliente Y",
  "port": 29001,
  "status": "active",
  "serials": [...],
  "created_at": "2025-01-15T14:00:00Z"
}
```

#### Response 409 — porta ou serial já em uso

```json
{
  "error": "conflict",
  "message": "A porta 29001 já está em uso por outro cliente.",
  "field": "port",
  "code": 409
}
```

---

### GET /admin/tenants/:id

Retorna detalhes completos de um tenant.

**Roles permitidas:** viewer, admin, superadmin

```json
{
  "id": "uuid",
  "name": "Cliente X",
  "port": 29000,
  "status": "active",
  "serials": [...],
  "sonicwall_config": { "host": "...", "user": "...", "firmware": 7 },
  "stats": {
    "total_sessions": 1250,
    "sessions_last_30d": 87,
    "last_auth_at": "2025-01-15T13:45:00Z"
  },
  "created_at": "...",
  "updated_at": "..."
}
```

---

### PUT /admin/tenants/:id

Atualiza um tenant.

**Roles permitidas:** admin, superadmin

#### Request — pode enviar apenas os campos a alterar

```json
{
  "name": "Cliente X Atualizado",
  "sonicwall_config": {
    "host": "192.168.1.2",
    "user": "admin",
    "password": "nova-senha"
  }
}
```

> Nota: `port` não pode ser alterado após criação (causaria conflito no Nginx/Docker).
> Para mudar porta, desativar e criar novo tenant.

Grava audit_log com diff dos campos alterados.

---

### PATCH /admin/tenants/:id/status

Ativa ou desativa um tenant.

**Roles permitidas:** admin, superadmin

```json
{ "status": "inactive" }
```

Grava audit_log: `{ action: 'tenant_deactivated', payload: { tenant_id } }`

---

### DELETE /admin/tenants/:id

Deleta tenant (soft delete — marca como `deleted`, não remove do banco).

**Roles permitidas:** superadmin apenas

Grava audit_log: `{ action: 'tenant_deleted', payload: { tenant_id, name } }`

---

## Sessões Wi-Fi

### GET /admin/sessions

Lista sessões com filtros.

**Roles permitidas:** viewer, admin, superadmin

#### Query params

| Param | Tipo | Descrição |
|-------|------|-----------|
| tenant_id | uuid | Filtro por tenant (obrigatório se role não for superadmin) |
| from | date | Data início (ISO 8601, ex: 2025-01-01) |
| to | date | Data fim (ISO 8601, ex: 2025-01-31) |
| phone | string | Filtro por número (busca parcial) |
| page | int | Default: 1 |
| limit | int | Default: 50, max: 200 |

#### Response 200

```json
{
  "data": [
    {
      "id": "uuid",
      "tenant": { "id": "uuid", "name": "Cliente X" },
      "phone_masked": "+55 11 9****-4321",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "ip_address": "192.168.1.100",
      "auth_at": "2025-01-15T13:45:00Z",
      "expires_at": "2025-01-15T21:45:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1250, "pages": 25 }
}
```

> Nota: `phone` sempre retorna mascarado (LGPD). Raw só em audit interno.

---

### GET /admin/reports/summary

Retorna números de resumo para o dashboard.

**Roles permitidas:** viewer, admin, superadmin

#### Query params

| Param | Tipo | Descrição |
|-------|------|-----------|
| tenant_id | uuid | Opcional — se omitido e superadmin: todos os tenants |
| from | date | Default: início do mês atual |
| to | date | Default: hoje |

#### Response 200

```json
{
  "period": { "from": "2025-01-01", "to": "2025-01-15" },
  "totals": {
    "sessions": 1250,
    "unique_phones": 843,
    "auth_attempts": 1380,
    "success_rate": 90.6
  },
  "by_tenant": [
    {
      "tenant_id": "uuid",
      "tenant_name": "Cliente X",
      "sessions": 420,
      "unique_phones": 310
    }
  ],
  "by_day": [
    { "date": "2025-01-01", "sessions": 82 },
    { "date": "2025-01-02", "sessions": 91 }
  ]
}
```

---

## Usuários admin

> Todas as rotas abaixo exigem role `superadmin`.

### GET /admin/users

Lista usuários do painel.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "João Silva",
      "email": "joao@empresa.com",
      "role": "admin",
      "last_login": "2025-01-15T10:30:00Z",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST /admin/users

Cria novo usuário admin.

```json
{
  "name": "Maria Santos",
  "email": "maria@empresa.com",
  "password": "senha-inicial-segura",
  "role": "viewer"
}
```

**Roles permitidas para `role`:** `superadmin`, `admin`, `viewer`
Grava audit_log: `{ action: 'user_created', payload: { user_id, email, role } }`

---

### PUT /admin/users/:id

Atualiza usuário (nome, email, role, password).

> Superadmin não pode remover sua própria role de superadmin.

---

### DELETE /admin/users/:id

Soft delete de usuário admin.

> Superadmin não pode deletar a si mesmo.

---

## Audit Log

### GET /admin/audit-logs

**Roles permitidas:** superadmin apenas

#### Query params: `from`, `to`, `admin_user_id`, `action`, `page`, `limit`

```json
{
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "name": "João Silva", "email": "joao@..." },
      "action": "tenant_created",
      "payload": { "tenant_id": "uuid", "name": "Cliente Y", "port": 29001 },
      "ip_address": "187.20.14.5",
      "created_at": "2025-01-15T14:00:00Z"
    }
  ]
}
```

---

## Middleware de autenticação e autorização

```
Todas as rotas (exceto POST /admin/auth/login):

1. Extrai token do header: Authorization: Bearer {token}
   se ausente: 401 { "error": "missing_token" }

2. Verifica e decodifica JWT com JWT_SECRET
   se inválido ou expirado: 401 { "error": "invalid_token" }

3. Busca usuário no banco pelo sub do JWT
   se não encontrado ou deletado: 401 { "error": "user_not_found" }

4. Injeta req.admin = { id, email, role } para uso nos handlers

5. Se a rota tem requisito de role mínima:
   se role do usuário não tem permissão: 403 { "error": "insufficient_role" }
```

---

## Padrões de erro

Todos os erros seguem o mesmo formato:

```json
{
  "error": "snake_case_code",
  "message": "Mensagem legível para o frontend exibir.",
  "code": 422,
  "field": "nome_do_campo_se_for_validação"
}
```

---

## Notas de implementação

- Usar `@fastify/jwt` para geração e validação de tokens
- Usar `bcryptjs` com salt rounds 12 para hash de senha
- Nunca retornar `password_hash` em nenhuma response
- `sonicwall_config.password` e `zenvia_token` devem ser armazenados criptografados no banco (AES-256) — descriptografar apenas quando o portal container precisar usar
- Paginação sempre presente mesmo com 0 resultados
- Datas sempre em ISO 8601 UTC
- Telefones sempre mascarados nas responses de sessões
