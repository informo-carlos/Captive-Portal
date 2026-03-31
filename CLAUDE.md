# CLAUDE.md — Briefing do projeto

> Este arquivo é lido automaticamente pelo Claude Code ao iniciar.
> Mantenha-o atualizado sempre que houver mudanças arquiteturais relevantes.

---

## O que é este projeto

Sistema de **Captive Portal Wi-Fi** multi-tenant integrado ao **SonicWall via SonicOS API REST**.
Usuários se autenticam via **OTP por SMS (Zenvia)** antes de navegar na internet.
Gerenciado via **painel admin web** — sem acesso a CLI para operações do dia a dia.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Portal backend | Node.js + Fastify + TypeScript |
| Admin backend | Node.js + Fastify + TypeScript |
| Portal frontend | Next.js 14 (App Router) + Tailwind |
| Admin frontend | Next.js 14 (App Router) + Tailwind |
| Banco principal | PostgreSQL 16 |
| Cache / OTP store | Redis 7 |
| Proxy | Nginx |
| Containers | Docker + Docker Compose |

---

## Estrutura do monorepo

```
captive-portal/
├── apps/
│   ├── backend/          # Portal captivo — Fastify
│   ├── admin-backend/    # API do painel admin — Fastify
│   ├── frontend/         # Portal captivo UI — Next.js
│   └── admin/            # Painel admin UI — Next.js
├── packages/
│   └── shared/           # Tipos TypeScript compartilhados entre os apps
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/nginx.conf
│   └── postgres/migrations/
└── docs/
    ├── spec-auth-api.md   # ← LEIA ANTES de tocar no portal backend
    ├── spec-admin-api.md  # ← LEIA ANTES de tocar no admin backend
    ├── TASKS.md           # Tasks da semana 1
    └── estrutura-pastas.md
```

---

## Regras que NUNCA devem ser quebradas

1. **Ler a spec antes de implementar** — `docs/spec-auth-api.md` e `docs/spec-admin-api.md` são a fonte de verdade. Se há conflito entre a spec e qualquer outra coisa, a spec ganha.

2. **Nunca logar o OTP** — nem em desenvolvimento. Usar `otp_sent: true` nos logs.

3. **Nunca retornar `password_hash`** em qualquer response da API.

4. **Campos sensíveis criptografados** — `sonicwall_config.password`, `sonicwall_config.guest_service_pass` e `zenvia_token` são armazenados com AES-256 (`services/crypto.ts`) e descriptografados apenas quando o container do portal precisar usar.

5. **Telefones sempre mascarados** nas responses de sessões (`+55 11 9****-4321`).

6. **Padrão Strategy no SonicWall** — o `verify-otp.ts` sempre chama `releaseAccess()` de `services/sonicwall/index.ts`. Nunca chamar `rest-api.ts` ou `lhm.ts` diretamente.

7. **TypeScript estrito** — `strict: true` no tsconfig. Sem `any` explícito sem comentário justificando.

8. **Sem credenciais no código** — tudo via variáveis de ambiente. Checar `.env.example` para a lista completa.

---

## Multi-tenancy — como funciona

Cada cliente (tenant) roda em um **container Docker isolado** na sua própria porta:
- Cliente X → porta 29000
- Cliente Y → porta 29001

O container lê as credenciais do cliente via variáveis de ambiente (`TENANT_ID`, `ALLOWED_SERIALS`, `SONICWALL_*`, `ZENVIA_TOKEN`).

O **middleware `serial-guard`** roda em todas as rotas do portal e rejeita qualquer requisição cujo serial SonicWall (`X-Sonicwall-Serial` header ou `?serial=` query param) não esteja na lista `ALLOWED_SERIALS` do container. Suporta HA pair (2 seriais).

---

## Integração SonicWall — dois modos (padrão Strategy)

```
services/sonicwall/
├── index.ts      ← sempre importar daqui — lê SONICWALL_MODE do env
├── rest-api.ts   ← SonicOS REST API (implementado)
└── lhm.ts        ← Lightweight Hotspot Messaging (stub — implementar depois)
```

`SONICWALL_MODE=rest` → usa SonicOS API REST com user/pass admin.
`SONICWALL_MODE=lhm` → usa LHM na porta 4043 com conta `guest_service`. **Ainda não implementado — lhm.ts é um stub que lança erro descritivo.**

---

## Sistema de roles do admin

| Role | Permissões |
|------|-----------|
| `superadmin` | Tudo, incluindo criar usuários admin e ver audit log |
| `admin` | Criar/editar/ativar/desativar tenants. Ver sessões e relatórios. |
| `viewer` | Somente leitura |

---

## Banco de dados — tabelas principais

- `tenants` — clientes cadastrados (nome, porta, status, config SonicWall criptografada)
- `tenant_serials` — seriais SonicWall por tenant (suporte a HA pair)
- `wifi_sessions` — cada autenticação bem-sucedida. **Particionada por `year_month` (int YYYYMM)**. Retenção de 5 anos.
- `auth_attempts` — todas as tentativas (sucesso e falha). Para auditoria e rate limiting.
- `admin_users` — usuários do painel
- `audit_logs` — toda ação de admin registrada aqui

---

## Como rodar localmente

```bash
# 1. Subir infraestrutura base
cd infra && docker compose up -d postgres redis

# 2. Rodar migrations
cd apps/admin-backend && npm install && npm run migrate && npm run seed

# 3. Subir tudo
cd infra && docker compose up -d

# Serviços:
# Admin painel:   http://localhost:8080
# Admin API:      http://localhost:8000
# Portal exemplo: http://localhost:29000
```

---

## Padrões de código

### Fastify — estrutura de uma rota

```typescript
// routes/auth.ts
import { FastifyPluginAsync } from 'fastify'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/request-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'mac', 'ip'],
        properties: {
          phone: { type: 'string' },
          mac: { type: 'string' },
          ip: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    // implementação
  })
}

export default authRoutes
```

### Erros — sempre usar este formato

```typescript
return reply.code(422).send({
  error: 'invalid_phone',
  message: 'Número de telefone inválido.',
  code: 422,
})
```

### Logs — usar o logger do Fastify, nunca console.log

```typescript
request.log.info({ tenantId: req.tenantId }, 'otp_sent')
request.log.error({ error: err.message }, 'sonicwall_failed')
```

---

## Quando criar uma nova task

Antes de implementar qualquer coisa nova que não está nas specs:
1. Escrever o contrato em `docs/` (endpoint, campos, erros esperados)
2. Commitar o doc antes do código
3. Referenciar o doc no PR

Isso garante que o outro dev (e o Claude) saibam exatamente o que está sendo construído.

---

## Workflow de Git — OBRIGATÓRIO para todo agente

Toda task deve seguir este fluxo. Sem exceção.

### 1. Criar branch a partir de `develop`

```bash
git checkout develop
git pull origin develop
git checkout -b feat/task-b2    # nome: feat/task-{id}
```

### 2. Implementar e commitar

```bash
# Commits pequenos e descritivos
git add <arquivos específicos>
git commit -m "feat(task-b2): descrição curta do que foi feito"
```

Regras de commit:
- Prefixo: `feat(task-XX)`, `fix(task-XX)` ou `chore(task-XX)`
- Mensagem curta e em português
- Nunca `git add .` ou `git add -A` (risco de subir .env ou arquivos sensíveis)
- Nunca `--no-verify` ou `--force`

### 3. Push e criar PR para `develop`

```bash
git push -u origin feat/task-b2

# Criar PR via gh CLI:
gh pr create --base develop \
  --title "feat(task-B2): migrations do banco de dados" \
  --body "$(cat <<'EOF'
## Summary
- Descrição das mudanças

## Task
B2 — Migrations do banco de dados

## Checklist
- [ ] Segui a spec em docs/
- [ ] Sem credenciais no código
- [ ] Campos sensíveis criptografados
- [ ] Testado localmente
EOF
)"
```

### 4. Após aprovação, merge para `develop`

```bash
# Via GitHub (botão Merge) ou:
git checkout develop
git merge feat/task-b2
git push origin develop
git branch -d feat/task-b2          # limpa branch local
git push origin --delete feat/task-b2  # limpa branch remota
```

### 5. Quando tudo estiver pronto: `develop` → `main`

Só após todas as tasks passarem em `develop`:
```bash
git checkout main
git merge develop
git push origin main
```

### Nomenclatura de branches

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Feature backend | `feat/task-b{N}` | `feat/task-b2` |
| Feature frontend | `feat/task-f{N}` | `feat/task-f1` |
| Bugfix | `fix/{descrição}` | `fix/serial-guard-header` |
| Hotfix produção | `hotfix/{descrição}` | `hotfix/otp-timeout` |

---

## Contexto de prazo

Semana 1 — MVP completo com todas as tasks B1–B8 e F1–F7 do `docs/TASKS.md`.
Não há fase 2 separada — a arquitetura já está preparada para relatórios avançados,
LHM e painel de gestão completo sem refatoração estrutural.
