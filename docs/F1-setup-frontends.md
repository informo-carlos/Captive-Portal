# F1 — Setup dos dois apps Next.js, Dockerfiles e camada api.ts

> Documento tecnico explicando tudo que foi implementado na task F1.
> PR: #3 | Branch: `feat/task-f1`

---

## Indice

1. [Visao geral — o que foi criado](#1-visao-geral)
2. [apps/frontend — Portal Captivo UI](#2-appsfrontend)
3. [apps/admin — Painel Admin UI](#3-appsadmin)
4. [packages/shared — Tipos compartilhados](#4-packagesshared)
5. [lib/api.ts — Camada HTTP do portal](#5-libapits-portal)
6. [lib/api.ts — Camada HTTP do admin](#6-libapits-admin)
7. [Dockerfiles — Como funciona o build](#7-dockerfiles)
8. [docker-compose — Servicos adicionados](#8-docker-compose)
9. [nginx — Roteamento frontend + backend](#9-nginx)
10. [Como testar](#10-como-testar)

---

## 1. Visao geral

A F1 criou a **base dos dois frontends** do projeto:

```
apps/
├── frontend/    ← Portal captivo (o que o usuario Wi-Fi ve)
├── admin/       ← Painel de gestao (usado internamente)

packages/
└── shared/      ← Tipos TypeScript usados por ambos
```

**Stack escolhida:**
- Next.js 14 (App Router)
- TypeScript com `strict: true`
- Tailwind CSS
- Output `standalone` para Docker

**Decisao arquitetural importante:** O portal frontend e um **container unico compartilhado** entre todos os tenants. O nginx roteia cada porta de tenant (29000, 29001...) separando o que e API (vai pro backend do tenant) e o que e UI (vai pro frontend compartilhado). Isso evita ter N containers de frontend identicos.

---

## 2. apps/frontend

**O que e:** Interface web mobile-first que o usuario ve ao ser redirecionado pelo SonicWall para se autenticar na rede Wi-Fi.

### Estrutura de arquivos

```
apps/frontend/
├── app/
│   ├── layout.tsx       ← Layout raiz (HTML base, metadata, Tailwind)
│   ├── page.tsx         ← Pagina inicial (placeholder — F2 vai implementar as telas)
│   └── globals.css      ← Apenas as diretivas do Tailwind (@tailwind base/components/utilities)
├── lib/
│   └── api.ts           ← Cliente HTTP para chamar o backend (explicado na secao 5)
├── next.config.mjs      ← Config do Next.js
├── tailwind.config.ts   ← Config do Tailwind
├── tsconfig.json        ← TypeScript strict
├── package.json         ← Dependencias
└── Dockerfile           ← Build multi-stage para Docker
```

### app/layout.tsx — Layout raiz

```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
```

- `lang="pt-BR"` — acessibilidade e SEO corretos para usuarios brasileiros
- `bg-gray-50` — fundo cinza claro, padrao para interfaces clean
- `antialiased` — suaviza fontes no navegador
- `metadata` define titulo "Wi-Fi Login" e descricao para SEO

### next.config.mjs — Configuracao

```js
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@captive-portal/shared'],
}
```

Duas configs importantes:

1. **`output: 'standalone'`** — Diz ao Next.js para gerar um build auto-contido na pasta `.next/standalone`. Esse build inclui um `server.js` que roda sem precisar de `node_modules`. Essencial para Docker — a imagem final fica ~150MB ao inves de ~1GB.

2. **`transpilePackages`** — O Next.js por padrao nao compila codigo dentro de `node_modules`. Como o `@captive-portal/shared` e um pacote local que exporta TypeScript puro (sem build pre-compilado), precisamos dizer ao Next.js para transpilar esse pacote durante o build.

### package.json — Dependencia local

```json
"dependencies": {
  "@captive-portal/shared": "file:../../packages/shared",
  ...
}
```

O `file:../../packages/shared` diz ao npm para linkar o pacote direto da pasta local, sem precisar publicar no npm. Ao rodar `npm install`, o npm cria um symlink em `node_modules/@captive-portal/shared` apontando para `packages/shared`.

---

## 3. apps/admin

**O que e:** Painel web desktop-first para a equipe interna gerenciar tenants, usuarios, sessoes e relatorios.

### Estrutura de arquivos

```
apps/admin/
├── app/
│   ├── layout.tsx       ← Layout raiz (bg-gray-100 para diferenciar do portal)
│   ├── page.tsx         ← Pagina inicial (placeholder — F4 vai implementar login)
│   └── globals.css      ← Diretivas Tailwind
├── lib/
│   └── api.ts           ← Cliente HTTP completo para todos endpoints admin (secao 6)
├── next.config.mjs      ← Mesmo padrao: standalone + transpilePackages
├── Dockerfile           ← Mesmo padrao multi-stage
└── ...                  ← (tsconfig, tailwind, package.json identicos ao frontend)
```

A estrutura e **identica ao portal** — a diferenca esta no conteudo do `lib/api.ts` (muito mais endpoints) e no design (desktop-first vs mobile-first). As telas serao implementadas nas tasks F4-F7.

---

## 4. packages/shared

**O que e:** Pacote TypeScript que define os **tipos** compartilhados entre todos os apps (frontend, admin, e futuramente backends). Serve como "contrato" — se a API retorna um `Tenant`, ambos frontends usam a mesma interface.

### Estrutura

```
packages/shared/
├── src/
│   ├── index.ts              ← Re-exporta tudo (ponto de entrada)
│   ├── types/
│   │   ├── api.ts            ← ApiError, Pagination, PaginatedResponse
│   │   ├── tenant.ts         ← Tenant, TenantDetail, SonicwallConfig, Create/UpdateTenantRequest
│   │   ├── session.ts        ← WifiSession
│   │   └── admin.ts          ← AdminUser, LoginRequest/Response, AuditLog, ReportSummary
├── package.json
└── tsconfig.json
```

### types/api.ts — Tipos base de comunicacao

```typescript
// Todo erro da API segue este formato (definido nas specs)
export interface ApiError {
  error: string              // codigo snake_case (ex: "invalid_phone", "rate_limit")
  message: string            // mensagem legivel para exibir ao usuario
  code: number               // HTTP status code
  field?: string             // campo que causou erro (ex: "port" em conflito)
  attempts_remaining?: number // tentativas restantes (usado no OTP)
  retry_after?: number       // segundos ate poder tentar de novo (usado no rate limit)
}

// Toda listagem paginada segue este formato
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}
```

Esses tipos garantem que o tratamento de erros e paginacao e **consistente** em toda a aplicacao. Quando a API retorna um erro, o frontend sabe exatamente quais campos esperar.

### types/tenant.ts — Tipos de tenant

```typescript
export interface Tenant {
  id: string
  name: string
  port: number
  status: 'active' | 'inactive' | 'deleted'
  serials: TenantSerial[]
  sonicwall_config?: Omit<SonicwallConfig, 'password'>  // NUNCA expoe a senha
  // ...
}
```

O `Omit<SonicwallConfig, 'password'>` e importante: garante **em nivel de tipo** que a senha do SonicWall nunca aparece no frontend. Mesmo que alguem tente acessar `tenant.sonicwall_config.password`, o TypeScript vai dar erro de compilacao.

### types/admin.ts — Tipos de admin

Define `AdminUser`, `LoginRequest`, `LoginResponse`, `ReportSummary`, `AuditLog` etc. Todos derivados diretamente das specs em `docs/spec-admin-api.md`.

### Como outros apps importam

```typescript
// Em qualquer app:
import type { Tenant, ApiError, PaginatedResponse } from '@captive-portal/shared'
```

O `type` no import garante que so a tipagem e importada — nenhum codigo JavaScript e incluido no bundle final.

---

## 5. lib/api.ts — Portal

**Arquivo:** `apps/frontend/lib/api.ts`

**O que faz:** Cliente HTTP que o portal usa para chamar os dois endpoints do backend (`/auth/request-otp` e `/auth/verify-otp`).

### Classe ApiRequestError

```typescript
export class ApiRequestError extends Error {
  public readonly error: string           // "invalid_phone", "rate_limit", etc
  public readonly code: number            // 422, 429, 502, etc
  public readonly field?: string
  public readonly attempts_remaining?: number
  public readonly retry_after?: number
}
```

Estende `Error` nativo do JavaScript. Isso permite usar `instanceof` nos componentes:

```typescript
try {
  await requestOtp(params, serial)
} catch (err) {
  if (err instanceof ApiRequestError) {
    // Acesso tipado a err.error, err.code, err.retry_after etc
    if (err.error === 'rate_limit') {
      mostrarMensagem(`Aguarde ${err.retry_after} segundos`)
    }
  }
}
```

### Funcao request() — Core do cliente

```typescript
async function request<T>(path, options): Promise<T> {
  // 1. Faz o fetch
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })

  // 2. Tenta parsear JSON (com try/catch para proteger contra HTML 502)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiRequestError({
      error: 'network_error',
      message: 'Erro de comunicação com o servidor.',
      code: res.status,
    })
  }

  // 3. Se nao OK, lanca erro tipado
  if (!res.ok) throw new ApiRequestError(body as ApiError)

  // 4. Retorna body tipado
  return body as T
}
```

**Por que o try/catch no `res.json()`?** (Correcao da review do PR)
Se o backend cair e o nginx retornar uma pagina HTML de erro 502, `res.json()` tenta parsear HTML como JSON e lanca um `SyntaxError` generico. O try/catch captura isso e transforma em um `ApiRequestError` com mensagem amigavel.

### Funcoes de endpoint

```typescript
// Envia OTP por SMS
export function requestOtp(params: RequestOtpParams, serial: string)

// Valida OTP e libera acesso
export function verifyOtp(params: VerifyOtpParams, serial: string)
```

Ambas recebem o `serial` do SonicWall e o passam via header `X-Sonicwall-Serial`, como a spec exige.

---

## 6. lib/api.ts — Admin

**Arquivo:** `apps/admin/lib/api.ts`

**O que faz:** Cliente HTTP completo para todos os endpoints do admin backend. Inclui gestao de token JWT.

### Token management

```typescript
let authToken: string | null = null  // cache em memoria

export function setToken(token: string | null) {
  authToken = token
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
}

export function getToken(): string | null {
  if (authToken) return authToken
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('token')
  }
  return authToken
}
```

**Como funciona:**
1. Ao fazer login, `setToken(token)` salva no `localStorage` e no cache em memoria
2. Toda requisicao posterior chama `getToken()` e injeta `Authorization: Bearer {token}` no header
3. Se qualquer requisicao retornar 401, limpa o token e redireciona para `/login`

**Nota:** Para o MVP usamos `localStorage`. Na F4 vamos migrar para cookies `httpOnly` — mais seguro contra XSS porque JavaScript nao consegue ler o cookie.

O `typeof window !== 'undefined'` protege contra erro no server-side (SSR) do Next.js, onde `localStorage` nao existe.

### Auto-redirect no 401

```typescript
if (res.status === 401) {
  setToken(null)                        // limpa token
  if (typeof window !== 'undefined') {
    window.location.href = '/login'     // redireciona
  }
}
```

Se o JWT expirar (8h de validade) ou for invalido, o usuario e automaticamente levado de volta ao login. Nenhuma pagina do admin precisa tratar isso manualmente.

### Endpoints disponiveis

| Funcao | Endpoint | Descricao |
|--------|----------|-----------|
| `login()` | POST /admin/auth/login | Autentica com email/senha |
| `getMe()` | GET /admin/auth/me | Retorna dados do usuario logado |
| `getTenants()` | GET /admin/tenants | Lista tenants com filtros e paginacao |
| `getTenant(id)` | GET /admin/tenants/:id | Detalhes de um tenant |
| `createTenant()` | POST /admin/tenants | Cria novo tenant |
| `updateTenant()` | PUT /admin/tenants/:id | Atualiza tenant |
| `updateTenantStatus()` | PATCH /admin/tenants/:id/status | Ativa/desativa |
| `deleteTenant()` | DELETE /admin/tenants/:id | Soft delete |
| `getSessions()` | GET /admin/sessions | Lista sessoes Wi-Fi |
| `getReportSummary()` | GET /admin/reports/summary | Metricas do dashboard |
| `getUsers()` | GET /admin/users | Lista admins |
| `createUser()` | POST /admin/users | Cria admin |
| `updateUser()` | PUT /admin/users/:id | Atualiza admin |
| `deleteUser()` | DELETE /admin/users/:id | Remove admin |
| `getAuditLogs()` | GET /admin/audit-logs | Historico de acoes |

Todas as funcoes de listagem suportam query params (filtros, paginacao) via `URLSearchParams`.

---

## 7. Dockerfiles

**Arquivos:** `apps/frontend/Dockerfile` e `apps/admin/Dockerfile`

Ambos usam o mesmo padrao: **multi-stage build** em 3 etapas.

### Stage 1 — deps (instalar dependencias)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/shared ./packages/shared
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN sed -i 's|file:../../packages/shared|file:./packages/shared|' package.json
RUN npm ci
```

**O que acontece:**
1. Copia o `packages/shared` para dentro do container
2. Copia o `package.json` do app
3. `sed` ajusta o caminho do shared (de `../../packages/shared` para `./packages/shared`) — necessario porque dentro do Docker o caminho relativo e diferente
4. `npm ci` instala as dependencias (usa o lockfile para builds reprodutiveis)

### Stage 2 — builder (compilar Next.js)

```dockerfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/frontend/ ./
RUN npm run build
```

Copia o `node_modules` do stage anterior, copia o codigo fonte e roda `next build`. O output `standalone` gera uma pasta `.next/standalone` com tudo necessario.

### Stage 3 — runner (imagem final)

```dockerfile
FROM base AS runner
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
CMD ["node", "server.js"]
```

**O que acontece:**
1. Cria usuario `nextjs` nao-root (seguranca — se o container for comprometido, o atacante nao tem root)
2. Copia apenas o necessario do build: `public/`, `standalone/`, `static/`
3. Roda como usuario nao-root
4. Inicia com `node server.js` — o servidor standalone do Next.js

**Resultado:** Imagem final ~150MB ao inves de ~1GB (sem `node_modules`, sem codigo fonte, sem devDependencies).

### Por que o context e a raiz do repo?

```yaml
# docker-compose.yml
admin-frontend:
  build:
    context: ..              # raiz do monorepo
    dockerfile: apps/admin/Dockerfile
```

O Docker nao permite `COPY` de arquivos fora do build context. Como precisamos copiar `packages/shared` (que esta fora de `apps/admin/`), o context precisa ser a raiz do monorepo.

---

## 8. docker-compose

**Arquivo:** `infra/docker-compose.yml`

### Servico adicionado: portal-frontend

```yaml
portal-frontend:
  build:
    context: ..
    dockerfile: apps/frontend/Dockerfile
  environment:
    NEXT_PUBLIC_API_URL: ""      # vazio = chamadas relativas (mesmo origin)
  networks:
    - internal
```

**Por que `NEXT_PUBLIC_API_URL` e vazio?**

O portal frontend faz chamadas para `/auth/request-otp` (caminho relativo). Como o nginx serve frontend e backend na mesma porta (29000), o browser resolve o caminho relativo para `http://ip:29000/auth/request-otp`, que o nginx roteia para o backend correto. Nao precisa de URL absoluta.

### Servico atualizado: admin-frontend

```yaml
admin-frontend:
  build:
    context: ..                    # antes: ../apps/admin
    dockerfile: apps/admin/Dockerfile  # novo: aponta para o Dockerfile
```

Context mudou para a raiz para permitir copiar o `packages/shared`.

---

## 9. nginx — Roteamento por porta

**Arquivo:** `infra/nginx/nginx.conf`

### Antes (F1)

Porta 29000 mandava tudo para o backend:
```
location / → portal-cliente-exemplo:3000
```

### Depois (F1)

Porta 29000 separa API e UI:
```
location /auth/   → portal-cliente-exemplo:3000   (backend Fastify)
location /health  → portal-cliente-exemplo:3000   (backend Fastify)
location /        → portal-frontend:3000           (Next.js compartilhado)
```

**Como funciona o fluxo completo:**

```
1. SonicWall redireciona usuario para http://ip:29000/?serial=SN-ABC123
2. Nginx recebe na porta 29000
3. Path e "/" → nginx manda para portal-frontend:3000 (Next.js)
4. Next.js renderiza a tela de input de celular
5. Usuario digita celular e clica "Receber codigo"
6. Browser faz POST /auth/request-otp (mesmo origin, porta 29000)
7. Nginx ve /auth/ → manda para portal-cliente-exemplo:3000 (Fastify)
8. Backend processa OTP, envia SMS, retorna 200
9. Frontend mostra tela de OTP
```

O nginx usa **longest prefix match** — `/auth/` tem prioridade sobre `/` para qualquer rota que comece com `/auth/`. O `/health` e exact match. Tudo que nao casa com `/auth/` nem `/health` cai no `/` (frontend).

---

## 10. Como testar

### Teste rapido — dev server local

```bash
# Terminal 1: portal
cd apps/frontend
npm run dev
# Abrir http://localhost:3000 → deve mostrar "Wi-Fi Login"

# Terminal 2: admin
cd apps/admin
npm run dev -- -p 3001
# Abrir http://localhost:3001 → deve mostrar "Captive Portal Admin"
```

### Teste de build de producao

```bash
cd apps/frontend && npm run build
# Esperar "Compiled successfully" e "Generating static pages"

cd apps/admin && npm run build
# Mesmo resultado esperado
```

### Teste de TypeScript

```bash
# Verificar que nao ha erros de tipo
cd apps/frontend && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
```

### Teste dos tipos compartilhados

```bash
cd packages/shared && npx tsc --noEmit
```

### Teste via Docker (requer infra rodando)

```bash
cd infra
docker compose build admin-frontend portal-frontend
docker compose up admin-frontend portal-frontend
# admin: http://localhost:8080
# portal: http://localhost:29000 (precisa do backend para API, mas o frontend carrega)
```

---

## Proximas tasks que constroem em cima da F1

| Task | O que vai adicionar |
|------|-------------------|
| **F2** | Telas do portal (PhoneInput, OtpInput, CountdownTimer, tela de erro) |
| **F3** | Integracao real do portal com backend (substituir mocks) |
| **F4** | Login admin, layout com sidebar, hook useAuth(), protecao de rotas |
| **F5** | CRUD de tenants na UI (tabela, modal, acoes) |
| **F6** | CRUD de usuarios admin |
| **F7** | Dashboard com metricas, graficos e tabela de sessoes |
