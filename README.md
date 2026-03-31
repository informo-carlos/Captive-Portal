# Captive Portal

Sistema de autenticação Wi-Fi com OTP por SMS, integrado ao SonicWall via API REST.
Multi-tenant por porta, painel admin web, relatórios com retenção de 5 anos.

---

## Como começar (Dia 1)

### 1. Pré-requisitos na máquina local

```bash
# Node.js 20+
node -v

# Docker + Docker Compose
docker -v
docker compose version

# Claude Code (agente de IA no terminal)
npm install -g @anthropic-ai/claude-code
```

### 2. Clonar e configurar

```bash
git clone https://github.com/sua-org/captive-portal.git
cd captive-portal

# Copiar e preencher as variáveis
cp .env.example .env
# Editar .env com suas credenciais reais
```

### 3. Subir a infra local

```bash
cd infra
docker compose up -d postgres redis
docker compose logs -f  # acompanhar os logs
```

### 4. Rodar as migrations

```bash
cd apps/admin-backend
npm install
npm run migrate
npm run seed   # cria superadmin padrão (ver output para a senha)
```

### 5. Subir tudo

```bash
cd infra
docker compose up -d
```

Serviços disponíveis:
- **Painel admin:** http://localhost:8080
- **Admin API:** http://localhost:8000
- **Portal tenant exemplo:** http://localhost:29000

---

## Usar o Claude Code no projeto

```bash
# Na raiz do projeto
claude

# O agente lê todos os arquivos do projeto automaticamente
# Exemplos de comandos:
```

```
"implemente a task B5 seguindo docs/spec-auth-api.md seção serial-guard"
"crie as migrations da task B2 seguindo o ERD descrito em docs/spec-admin-api.md"
"implemente GET /admin/tenants com paginação e filtro por status conforme docs/spec-admin-api.md"
"adicione tratamento do erro rate_limit na tela de OTP conforme docs/spec-auth-api.md"
```

---

## Adicionar um novo cliente (tenant)

1. Acesse o painel admin em `:8080`
2. Login com superadmin
3. Menu **Tenants** → **Novo cliente**
4. Preencha: nome, porta (ex: 29002), seriais SonicWall, credenciais SonicWall, token Zenvia
5. Salvar

Depois no servidor:
1. Adicionar as variáveis do novo tenant no `.env`
2. Adicionar o bloco do serviço no `infra/docker-compose.yml` (copiar o bloco comentado)
3. Adicionar o bloco no `infra/nginx/nginx.conf` (copiar o bloco comentado)
4. `docker compose up -d portal-cliente-novo`

> Em breve: o painel vai fazer isso automaticamente via Docker API.

---

## Estrutura do projeto

```
captive-portal/
├── apps/
│   ├── backend/          # Portal captivo (Fastify)
│   ├── admin-backend/    # API do painel admin (Fastify)
│   ├── frontend/         # Portal captivo UI (Next.js)
│   └── admin/            # Painel admin UI (Next.js)
├── packages/
│   └── shared/           # Tipos TypeScript compartilhados
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── postgres/migrations/
└── docs/
    ├── spec-auth-api.md   # Contrato da API do portal
    ├── spec-admin-api.md  # Contrato da API do admin
    ├── TASKS.md           # Tasks da semana 1
    └── estrutura-pastas.md
```

---

## Branches e workflow de PR

```
main          ← produção, protegida
dev           ← integração, base para PRs
feat/b1-*     ← features do Dev 1
feat/f1-*     ← features do Dev 2
```

Fluxo:
1. `git checkout -b feat/b5-portal-base`
2. Implementar com Claude Code
3. `git push origin feat/b5-portal-base`
4. Abrir PR para `dev`
5. Outro dev revisa
6. Merge

---

## Variáveis de ambiente

Ver `.env.example` para todas as variáveis necessárias com descrição.

Geração de secrets:
```bash
openssl rand -base64 64   # JWT_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```
