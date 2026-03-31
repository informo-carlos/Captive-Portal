# Estrutura de pastas — Captive Portal Monorepo

```
captive-portal/
│
├── apps/
│   │
│   ├── backend/                        # Portal captivo (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── app.ts                  # Entry point, registro de plugins
│   │   │   ├── config.ts               # Leitura e validação de env vars
│   │   │   ├── plugins/
│   │   │   │   ├── serial-guard.ts     # Middleware de validação de serial
│   │   │   │   ├── redis.ts            # Plugin Redis (decorator no fastify)
│   │   │   │   └── postgres.ts         # Plugin Postgres
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts             # /auth/request-otp e /auth/verify-otp
│   │   │   │   └── health.ts           # /health
│   │   │   └── services/
│   │   │       ├── otp.ts              # Geração, armazenamento e validação
│   │   │       ├── zenvia.ts           # Envio de SMS
│   │   │       └── sonicwall.ts        # Liberação IP/MAC na API SonicOS
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── admin-backend/                  # API do painel admin (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── config.ts
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts             # JWT + middleware de role check
│   │   │   │   ├── postgres.ts
│   │   │   │   └── audit.ts            # Utilitário de audit_log
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts             # /admin/auth/login e /me
│   │   │   │   ├── tenants.ts          # CRUD de tenants
│   │   │   │   ├── sessions.ts         # Leitura de sessões Wi-Fi
│   │   │   │   ├── reports.ts          # Endpoint de relatórios/summary
│   │   │   │   ├── users.ts            # CRUD de usuários admin
│   │   │   │   └── audit-logs.ts       # Listagem de audit log
│   │   │   └── services/
│   │   │       └── crypto.ts           # AES-256 para campos sensíveis
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/                       # Portal captivo (Next.js 14)
│   │   ├── app/
│   │   │   ├── page.tsx                # Tela 1: input de celular
│   │   │   ├── otp/
│   │   │   │   └── page.tsx            # Tela 2: input OTP
│   │   │   ├── success/
│   │   │   │   └── page.tsx            # Tela 3: sucesso
│   │   │   └── error/
│   │   │       └── page.tsx            # Tela de serial não autorizado
│   │   ├── lib/
│   │   │   └── api.ts                  # Cliente HTTP para o portal backend
│   │   ├── components/
│   │   │   ├── PhoneInput.tsx
│   │   │   ├── OtpInput.tsx            # 6 campos com auto-focus
│   │   │   └── CountdownTimer.tsx
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── admin/                          # Painel admin (Next.js 14)
│       ├── app/
│       │   ├── login/
│       │   │   └── page.tsx
│       │   └── (dashboard)/            # Route group — requer auth
│       │       ├── layout.tsx          # Sidebar + header
│       │       ├── dashboard/
│       │       │   └── page.tsx        # Métricas + gráfico
│       │       ├── tenants/
│       │       │   ├── page.tsx        # Lista de tenants
│       │       │   └── [id]/
│       │       │       └── page.tsx    # Detalhes do tenant
│       │       ├── sessions/
│       │       │   └── page.tsx
│       │       └── users/
│       │           └── page.tsx        # Superadmin only
│       ├── lib/
│       │   ├── api.ts                  # Cliente HTTP para admin-backend
│       │   └── auth.ts                 # useAuth hook + token management
│       ├── components/
│       │   ├── TenantModal.tsx         # Modal criar/editar tenant
│       │   ├── UserModal.tsx
│       │   └── DataTable.tsx           # Tabela reutilizável com paginação
│       ├── Dockerfile
│       ├── package.json
│       └── next.config.ts
│
├── packages/
│   └── shared/                         # Tipos TypeScript compartilhados
│       ├── src/
│       │   ├── types/
│       │   │   ├── tenant.ts
│       │   │   ├── session.ts
│       │   │   └── admin.ts
│       │   └── index.ts
│       └── package.json
│
├── infra/
│   ├── docker-compose.yml              # Orquestração de todos os serviços
│   ├── docker-compose.override.yml     # Overrides para desenvolvimento local
│   ├── nginx/
│   │   ├── nginx.conf                  # Config principal
│   │   └── conf.d/
│   │       ├── portal.conf             # Roteamento por porta (29000+)
│   │       └── admin.conf              # Admin backend (8000) e frontend (8080)
│   └── postgres/
│       └── migrations/                 # Arquivos SQL de migration em ordem
│           ├── 001_create_tenants.sql
│           ├── 002_create_tenant_serials.sql
│           ├── 003_create_wifi_sessions.sql
│           ├── 004_create_auth_attempts.sql
│           ├── 005_create_admin_users.sql
│           ├── 006_create_audit_logs.sql
│           └── 007_seed_initial_data.sql
│
├── docs/
│   ├── spec-auth-api.md                # Contrato dos endpoints do portal
│   ├── spec-admin-api.md               # Contrato dos endpoints do admin
│   ├── TASKS.md                        # Tasks numeradas da semana 1
│   └── estrutura-pastas.md             # Este arquivo
│
├── .env.example                        # Template de variáveis de ambiente
├── .gitignore
└── README.md
```
