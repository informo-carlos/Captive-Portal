# TASKS — Captive Portal (Semana 1)

> Workflow de cada task:
> 1. Abrir o Claude Code na raiz do projeto: `claude`
> 2. Dizer: `"implemente a task B3 seguindo os specs em docs/"`
> 3. Revisar o código gerado
> 4. Abrir PR com o título da task
> 5. Merge e partir pra próxima

---

## Dia 1 — os dois juntos (manhã)

- [ ] **SETUP-0** — Ler e validar `docs/spec-auth-api.md` e `docs/spec-admin-api.md` juntos
- [ ] **SETUP-1** — Criar repositório no GitHub, definir estrutura de branches (`main`, `dev`, `feat/*`)
- [ ] **SETUP-2** — Criar o monorepo com a estrutura de pastas (ver `docs/estrutura-pastas.md`)

Depois do SETUP, cada um segue sua trilha de forma independente.

---

## Trilha Dev 1 — Backend + Infra

### [ ] B1 — Setup de infraestrutura base
**Branch:** `feat/b1-infra-setup`
**Entrega:** Docker Compose rodando localmente com todos os serviços up

Tarefas:
- Criar `infra/docker-compose.yml` com serviços: postgres, redis, nginx, portal-tenant-example, admin-backend, admin-frontend
- Criar `infra/nginx/nginx.conf` com roteamento: porta 29000+ → portal containers, porta 8080 → admin frontend, porta 8000 → admin backend
- Criar `apps/backend/Dockerfile` e `apps/admin-backend/Dockerfile`
- Criar `.env.example` com todas as variáveis necessárias
- Validar: `docker compose up` sobe tudo sem erro

---

### [ ] B2 — Migrations do banco de dados
**Branch:** `feat/b2-migrations`
**Depende de:** B1
**Entrega:** Banco criado com todas as tabelas e índices

Tarefas:
- Instalar e configurar `node-postgres` + `node-pg-migrate` (ou `drizzle-orm`)
- Criar migration `001_create_tenants.sql`
- Criar migration `002_create_tenant_serials.sql`
- Criar migration `003_create_wifi_sessions.sql` — com particionamento por `year_month`
- Criar migration `004_create_auth_attempts.sql`
- Criar migration `005_create_admin_users.sql`
- Criar migration `006_create_audit_logs.sql`
- Criar índices: `tenant_id + auth_at` em wifi_sessions, `tenant_id + created_at` em auth_attempts
- Criar seed: 1 superadmin padrão + 1 tenant de exemplo na porta 29000
- Validar: `npm run migrate` roda sem erro

Schema de cada tabela — seguir exatamente o ERD em `docs/spec-admin-api.md`.

---

### [ ] B3 — Admin backend: autenticação e estrutura base
**Branch:** `feat/b3-admin-auth`
**Depende de:** B2
**Entrega:** POST /admin/auth/login e GET /admin/auth/me funcionando com JWT

Tarefas:
- Inicializar `apps/admin-backend` com Fastify + TypeScript
- Instalar: `@fastify/jwt`, `bcryptjs`, `@fastify/cors`
- Implementar `POST /admin/auth/login` (spec: seção "Autenticação")
- Implementar `GET /admin/auth/me`
- Implementar middleware de auth JWT aplicado globalmente (exceto /login)
- Implementar middleware de role check como decorator Fastify
- Implementar plugin de audit_log (função utilitária reutilizável)
- Validar com curl ou Postman

---

### [ ] B4 — Admin backend: CRUD de tenants
**Branch:** `feat/b4-admin-tenants`
**Depende de:** B3
**Entrega:** API completa de tenants funcionando

Tarefas:
- Implementar `GET /admin/tenants` com filtros e paginação
- Implementar `POST /admin/tenants` com validação de porta e serial duplicados
- Implementar `GET /admin/tenants/:id`
- Implementar `PUT /admin/tenants/:id`
- Implementar `PATCH /admin/tenants/:id/status`
- Implementar `DELETE /admin/tenants/:id` (soft delete, superadmin only)
- Todos os endpoints gravam audit_log
- Campos sensíveis (password, zenvia_token) criptografados com AES-256
- Validar todos os cenários de erro da spec

---

### [ ] B5 — Portal backend: estrutura base + serial-guard
**Branch:** `feat/b5-portal-base`
**Depende de:** B2
**Entrega:** Container do portal inicializando com middleware de serial funcionando

Tarefas:
- Inicializar `apps/backend` com Fastify + TypeScript
- Implementar leitura das variáveis de ambiente (`TENANT_ID`, `ALLOWED_SERIALS`, etc.)
- Implementar plugin `serial-guard` (spec: seção "Middleware global")
  - Aceita serial via header `X-Sonicwall-Serial` OU query param `?serial=`
  - Suporte a múltiplos seriais (HA pair)
  - Retorna 403 com payload correto se serial inválido
- Implementar `GET /health`
- Validar com curl simulando serial válido e inválido

---

### [ ] B6 — Portal backend: OTP (request + verify)
**Branch:** `feat/b6-otp`
**Depende de:** B5
**Entrega:** Fluxo completo de OTP funcionando (sem SMS e sem SonicWall reais ainda)

Tarefas:
- Implementar serviço Redis (connect, get, set, del com TTL)
- Implementar `POST /auth/request-otp` (spec completa)
  - Normalização de telefone para E.164
  - Geração de OTP com `crypto.randomInt`
  - Rate limiting via Redis
  - Stub do serviço Zenvia (loga no console em dev)
  - Registro em auth_attempts
- Implementar `POST /auth/verify-otp` (spec completa)
  - Validação contra Redis
  - Controle de tentativas erradas
  - Stub do serviço SonicWall (loga no console em dev)
  - Registro em wifi_sessions com year_month
- Validar fluxo completo end-to-end com curl

---

### [ ] B7 — Serviço SonicWall com padrão Strategy + Zenvia
**Branch:** `feat/b7-integrations`
**Depende de:** B6
**Entrega:** SMS real enviado e SonicWall liberando acesso via REST. LHM pronto como stub.

Tarefas:
- Criar estrutura `services/sonicwall/`:
  - `index.ts` — exporta `releaseAccess()`, lê `SONICWALL_MODE` do env, seleciona estratégia
  - `rest-api.ts` — implementação real via SonicOS REST API:
    - Autenticação com user/pass, obtenção de session token
    - POST no endpoint correto por firmware (Gen6 vs Gen7 — ver spec)
    - Timeout 10s, retorna `{ success, raw, mode: 'rest' }`
  - `lhm.ts` — **stub apenas**: loga aviso claro `"LHM não implementado"` e lança erro descritivo. Estrutura pronta para implementação futura.
- Implementar `services/zenvia.ts`:
  - POST para `https://api.zenvia.com/v2/channels/sms/messages`
  - Header `X-API-Token: {ZENVIA_TOKEN}`
  - Mensagem: `"Seu código Wi-Fi: {otp}. Válido por 5 min."`
  - Timeout: 5 segundos
  - Substituir stub criado em B6
- Substituir stub do SonicWall em B6 pelo `releaseAccess()` real
- Adicionar campo `sonicwall_mode` na tabela `wifi_sessions` (nova migration)
- Testar com SonicWall real em ambiente de staging

---

### [ ] B8 — Admin backend: sessões e relatórios
**Branch:** `feat/b8-reports`
**Depende de:** B3, B2
**Entrega:** Endpoints de sessões e relatórios prontos para o frontend consumir

Tarefas:
- Implementar `GET /admin/sessions` com todos os filtros e paginação
  - Telefone sempre mascarado na response
  - Filtro por tenant obrigatório para roles não-superadmin
- Implementar `GET /admin/reports/summary`
  - totals: sessions, unique_phones, auth_attempts, success_rate
  - by_tenant (se superadmin sem filtro)
  - by_day para o período solicitado
- Implementar `GET /admin/users` + `POST /admin/users` + `PUT /admin/users/:id` + `DELETE /admin/users/:id`
- Implementar `GET /admin/audit-logs`

---

## Trilha Dev 2 — Frontend Portal + Admin

### [ ] F1 — Setup dos dois apps Next.js
**Branch:** `feat/f1-frontend-setup`
**Entrega:** Dois apps Next.js rodando no Docker Compose

Tarefas:
- Inicializar `apps/frontend` (portal captivo) com Next.js 14 + TypeScript + Tailwind
- Inicializar `apps/admin` (painel admin) com Next.js 14 + TypeScript + Tailwind
- Criar Dockerfiles para ambos
- Configurar variáveis de ambiente: `NEXT_PUBLIC_API_URL`
- Criar utilitário `lib/api.ts` para chamadas HTTP com tratamento de erro padronizado
- Validar: ambos sobem via Docker Compose

---

### [ ] F2 — Portal: telas de autenticação
**Branch:** `feat/f2-portal-screens`
**Depende de:** F1
**Entrega:** Três telas do portal funcionando com mock da API

Tarefas:
- Tela 1 — Input de celular:
  - Máscara BR: `(11) 9 9999-9999`
  - Validação: DDD válido, comprimento correto
  - Botão "Receber código" → chama `POST /auth/request-otp` (mock)
  - Estado de loading durante chamada
- Tela 2 — Input OTP:
  - 6 campos separados (um dígito cada) com auto-focus
  - Timer de countdown 5:00 (300s) com barra de progresso
  - Botão "Reenviar" aparece após timer zerar
  - Botão "Verificar" → chama `POST /auth/verify-otp` (mock)
- Tela 3 — Sucesso:
  - Mensagem de boas-vindas
  - Instrução para o usuário fechar e navegar
- Tela de erro — Serial não autorizado:
  - Exibida quando API retorna 403 `unauthorized_firewall`
  - Mensagem amigável, sem detalhes técnicos

Design: limpo, mobile-first (a maioria acessará por celular), logo do tenant no topo (futuramente configurável).

---

### [ ] F3 — Portal: integração real com backend
**Branch:** `feat/f3-portal-integration`
**Depende de:** F2, B6 (endpoints prontos)
**Entrega:** Fluxo completo end-to-end funcionando

Tarefas:
- Substituir mocks pelas chamadas reais
- Tratar todos os estados de erro da spec:
  - 422 `invalid_phone` → mensagem em linha no campo
  - 429 `rate_limit` → mensagem com tempo de espera
  - 422 `invalid_otp` → shake no campo + tentativas restantes
  - 422 `otp_blocked` → redirecionar para tela 1 com mensagem
  - 404 `otp_not_found` → código expirado, botão de reenvio
  - 502 `sonicwall_failed` → mensagem para contatar suporte
- Validar fluxo completo em staging

---

### [ ] F4 — Admin: login + layout base
**Branch:** `feat/f4-admin-layout`
**Depende de:** F1, B3 (login pronto)
**Entrega:** Login funcionando, sidebar navegável, proteção de rotas

Tarefas:
- Tela de login:
  - Campos email + senha
  - Salvar JWT em cookie httpOnly (ou localStorage como fallback)
  - Redirecionar para `/dashboard` após login
  - Mensagem de erro para credenciais inválidas
- Layout base do painel:
  - Sidebar com links: Dashboard, Tenants, Sessões, Relatórios, Usuários (superadmin only)
  - Header com nome do usuário logado + role + botão de logout
  - Proteção de rotas: redirecionar para `/login` se não autenticado
  - Proteção por role: páginas restritas redirecionam com mensagem
- Hook `useAuth()` reutilizável para acessar dados do usuário logado

---

### [ ] F5 — Admin: gestão de tenants
**Branch:** `feat/f5-admin-tenants`
**Depende de:** F4, B4 (CRUD de tenants pronto)
**Entrega:** CRUD completo de tenants via interface web

Tarefas:
- Página `/tenants`:
  - Tabela com: nome, porta, status (badge colorido), quantidade de seriais, data de criação
  - Filtro por status (ativo/inativo)
  - Botão "Novo cliente" (admin+ apenas)
- Modal "Criar/Editar cliente":
  - Campo nome
  - Campo porta (número, validação de range 29000-29999)
  - Seção seriais: até 2 seriais, campo para cada, label primary/secondary
  - Seção SonicWall: host, usuário, senha (campo password)
  - Campo token Zenvia
  - Botão salvar com loading + mensagem de sucesso/erro
- Ações na tabela:
  - Botão ativar/desativar (admin+)
  - Botão editar (admin+)
  - Botão deletar com confirmação (superadmin)
- Página `/tenants/:id` com detalhes + stats de uso

---

### [ ] F6 — Admin: usuários admin
**Branch:** `feat/f6-admin-users`
**Depende de:** F4, B8 (endpoints de usuários prontos)
**Entrega:** CRUD de usuários do painel

Tarefas:
- Página `/users` (superadmin only):
  - Tabela com: nome, email, role (badge), último login
  - Botão "Novo usuário"
- Modal criar/editar usuário:
  - Campos: nome, email, senha, role (select: superadmin/admin/viewer)
  - Na edição: campo senha opcional (deixar vazio = não alterar)
- Ação deletar com confirmação

---

### [ ] F7 — Admin: sessões e relatórios
**Branch:** `feat/f7-admin-reports`
**Depende de:** F4, B8 (relatórios prontos)
**Entrega:** Dashboard com números e tabela de sessões

Tarefas:
- Página `/dashboard`:
  - 4 cards de métricas: total de sessões, usuários únicos, tentativas, taxa de sucesso
  - Seletor de período (from/to)
  - Seletor de tenant (superadmin vê todos)
  - Gráfico de sessões por dia (linha simples com recharts ou chart.js)
- Página `/sessions`:
  - Tabela de sessões com: telefone mascarado, MAC, IP, tenant, data/hora de auth, expiração
  - Filtros: tenant, período, telefone (busca parcial)
  - Paginação

---

## Checklist de entrega (fim da semana)

- [ ] Fluxo completo portal funcionando: Wi-Fi → redirect → celular → OTP → SMS real → SonicWall liberado
- [ ] Serial inválido exibe tela de erro correta
- [ ] Painel admin acessível em `https://admin.seudominio.com` (ou IP:8080)
- [ ] Login com JWT funcionando
- [ ] Criar tenant via painel reflete no banco
- [ ] Sessões registradas no banco após autenticação
- [ ] Docker Compose sobe tudo com um comando
- [ ] Nginx com SSL (certbot ou certificado próprio)
- [ ] `.env.example` documentado com todas as variáveis

---

## Comandos úteis do Claude Code

```bash
# Na raiz do projeto
claude

# Exemplos de prompts diretos:
"implemente a task B5 seguindo docs/spec-auth-api.md, seção middleware serial-guard"
"crie as migrations da task B2 seguindo o ERD em docs/spec-admin-api.md"
"implemente GET /admin/tenants da task B4 com paginação e filtro por status"
"escreva testes de integração para os endpoints de OTP (B6)"
"crie o modal de criar tenant da task F5, com os campos descritos na task"
```
