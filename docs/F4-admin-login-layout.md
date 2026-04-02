# F4 — Admin: login + layout base do painel

> Documento tecnico explicando tudo que foi implementado na task F4.
> PR: #7 | Branch: `feat/task-f4`

---

## Indice

1. [Visao geral — o que foi criado](#1-visao-geral)
2. [AuthProvider + useAuth() — contexto de autenticacao](#2-authprovider--useauth)
3. [Tela de login](#3-tela-de-login)
4. [Layout protegido — sidebar + header](#4-layout-protegido)
5. [Sidebar — navegacao contextual por role](#5-sidebar)
6. [Header — usuario logado + logout](#6-header)
7. [RequireRole — protecao granular por role](#7-requirerole)
8. [Estrutura de rotas no App Router](#8-estrutura-de-rotas)
9. [Fluxo completo — do acesso ao dashboard](#9-fluxo-completo)
10. [Correcoes da revisao](#10-correcoes-da-revisao)
11. [Como testar](#11-como-testar)

---

## 1. Visao geral

A F4 criou a **infraestrutura de autenticacao e navegacao** do painel admin:

```
apps/admin/
├── lib/
│   └── auth-context.tsx        ← AuthProvider + hook useAuth()
├── components/
│   ├── sidebar.tsx             ← Navegacao lateral contextual por role
│   ├── header.tsx              ← Barra superior com nome/role/logout
│   └── require-role.tsx        ← Guard de role para paginas restritas
├── app/
│   ├── layout.tsx              ← Layout raiz (atualizado com Providers)
│   ├── page.tsx                ← Raiz: redireciona para /login ou /dashboard
│   ├── providers.tsx           ← Client wrapper com AuthProvider
│   ├── login/
│   │   └── page.tsx            ← Tela de login
│   └── (dashboard)/
│       ├── layout.tsx          ← Layout protegido: exige autenticacao
│       ├── dashboard/page.tsx  ← Placeholder para F7
│       ├── tenants/page.tsx    ← Placeholder para F5
│       ├── tenants/[id]/page.tsx ← Placeholder para F5
│       ├── sessions/page.tsx   ← Placeholder para F7
│       ├── users/page.tsx      ← Protegido com RequireRole superadmin
│       └── audit/page.tsx      ← Protegido com RequireRole superadmin
```

**Decisoes arquiteturais:**

- **JWT em localStorage** com cache em memoria. O `api.ts` (criado na F1) ja injeta o token em todo request e faz auto-redirect para `/login` em caso de 401.
- **Hierarquia de roles** definida numericamente: `viewer(0) < admin(1) < superadmin(2)`. O hook `hasRole('admin')` retorna true para admin e superadmin.
- **Route group `(dashboard)/`** do Next.js App Router: todas as paginas internas compartilham o mesmo layout (sidebar + header) sem afetar a URL.

---

## 2. AuthProvider + useAuth()

**Arquivo:** `apps/admin/lib/auth-context.tsx`

### O que faz

Gerencia o estado de autenticacao de toda a aplicacao via React Context. Fornece dados do usuario logado, funcoes de login/logout e verificacao de role.

### Interface exposta

```typescript
interface AuthContextValue {
  user: AdminUser | null    // dados do usuario logado (ou null)
  loading: boolean          // true enquanto verifica token no mount
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (minRole: AdminRole) => boolean
}
```

### Hierarquia de roles

```typescript
const ROLE_HIERARCHY: Record<AdminRole, number> = {
  viewer: 0,
  admin: 1,
  superadmin: 2,
}
```

`hasRole('admin')` verifica se o numero da role do usuario e >= ao numero da role pedida. Assim:
- `viewer` chamando `hasRole('admin')` → `0 >= 1` → **false**
- `admin` chamando `hasRole('admin')` → `1 >= 1` → **true**
- `superadmin` chamando `hasRole('admin')` → `2 >= 1` → **true**

Isso evita precisar listar roles manualmente em cada ponto de verificacao.

### Fluxo de inicializacao (mount)

```typescript
useEffect(() => {
  const token = getToken()        // le do localStorage
  if (!token) {
    setState({ user: null, loading: false })  // sem token = nao autenticado
    return
  }
  getMe()                          // GET /admin/auth/me com o token
    .then((user) => setState({ user, loading: false }))
    .catch(() => {
      setToken(null)               // token invalido/expirado = limpa
      setState({ user: null, loading: false })
    })
}, [])
```

**Por que verificar no mount?** Quando o usuario recarrega a pagina ou abre uma nova aba, o React perde todo estado em memoria. O `useEffect` reidrata o estado fazendo uma chamada `GET /admin/auth/me` com o token salvo no `localStorage`. Se o token expirou (8h), o backend retorna 401, o catch limpa o token e o usuario e tratado como nao autenticado.

### Login

```typescript
const login = useCallback(async (email: string, password: string) => {
  const res = await apiLogin({ email, password })  // POST /admin/auth/login
  setToken(res.token)                               // salva JWT
  const user = await getMe()                        // busca dados completos
  setState({ user, loading: false })                // atualiza contexto
}, [])
```

O login faz duas chamadas: primeiro autentica (recebe token), depois busca os dados completos do usuario com `getMe()`. O `LoginResponse` retorna dados basicos (`id`, `name`, `email`, `role`), mas o `getMe()` retorna dados completos incluindo `last_login` e `created_at`.

### Logout — hard navigation intencional

```typescript
const logout = useCallback(() => {
  setToken(null)
  setState({ user: null, loading: false })
  // Hard navigation intencional para limpar todo estado client-side
  window.location.href = '/login'
}, [])
```

Usa `window.location.href` ao inves de `router.replace()` para forcar um **reload completo** da pagina. Isso garante que todo cache do React, refs, timers e estado em memoria sejam limpos. Com `router.replace()` a SPA continuaria carregada e poderia reter dados sensíveis em memoria.

### Como usar nos componentes

```typescript
'use client'
import { useAuth } from '../lib/auth-context'

function MeuComponente() {
  const { user, loading, hasRole, logout } = useAuth()

  if (loading) return <Spinner />
  if (!user) return null  // redirect ja acontece no layout

  return (
    <div>
      <p>Ola, {user.name}</p>
      {hasRole('admin') && <button>Criar Tenant</button>}
      <button onClick={logout}>Sair</button>
    </div>
  )
}
```

---

## 3. Tela de login

**Arquivo:** `apps/admin/app/login/page.tsx`

### O que faz

Pagina publica (sem protecao) com formulario de email e senha. Autentica via `POST /admin/auth/login` e redireciona para `/dashboard`.

### Campos

| Campo | Tipo | Validacao | Atributos |
|-------|------|-----------|-----------|
| Email | `input[type=email]` | `required`, validacao nativa do browser | `autoComplete="email"` |
| Senha | `input[type=password]` | `required` | `autoComplete="current-password"` |

Os atributos `autoComplete` permitem que gerenciadores de senha do browser preencham automaticamente.

### Estados da tela

| Estado | O que mostra |
|--------|-------------|
| `authLoading` (mount) | Spinner centralizado enquanto verifica token existente |
| `user` ja autenticado | Spinner + redirect via useEffect para `/dashboard` |
| Formulario | Campos de email/senha + botao "Entrar" |
| `loading` (submit) | Botao desabilitado com spinner e texto "Entrando..." |
| Erro | Bloco vermelho abaixo do formulario com mensagem da API |

### Tratamento de erro

```typescript
try {
  await login(email, password)
  router.replace('/dashboard')
} catch (err) {
  if (err instanceof ApiRequestError) {
    setError(err.message)  // mensagem legivel da API (ex: "Email ou senha incorretos.")
  } else {
    setError('Erro de comunicacao com o servidor. Tente novamente.')
  }
}
```

O `ApiRequestError` vem do `lib/api.ts` (criado na F1). A API retorna `{ error: "invalid_credentials", message: "Email ou senha incorretos.", code: 401 }` e o frontend mostra a `message` diretamente.

### Redirect de usuario ja autenticado

```typescript
useEffect(() => {
  if (!authLoading && user) {
    router.replace('/dashboard')
  }
}, [authLoading, user, router])

if (authLoading || user) {
  return <Spinner />  // mostra spinner enquanto redireciona
}
```

Se o usuario acessa `/login` com um token valido, o `useAuth()` detecta que ja esta autenticado e a pagina redireciona sem mostrar o formulario. O `useEffect` faz o redirect (correcao da revisao — evita state update durante render).

---

## 4. Layout protegido

**Arquivo:** `apps/admin/app/(dashboard)/layout.tsx`

### O que faz

Layout compartilhado por todas as paginas internas (`/dashboard`, `/tenants`, `/sessions`, etc). Renderiza sidebar + header e protege contra acesso nao autenticado.

### Protecao de rota

```typescript
useEffect(() => {
  if (!loading && !user) {
    router.replace('/login')
  }
}, [loading, user, router])

if (loading) return <Spinner />
if (!user) return null  // retorna nada enquanto redireciona
```

Se o usuario tenta acessar qualquer rota dentro de `(dashboard)/` sem estar autenticado, e redirecionado para `/login`.

### Estrutura visual

```
┌──────────────────────────────────────────────────┐
│ ┌─────────┐ ┌──────────────────────────────────┐ │
│ │         │ │ Header (nome, role, logout)       │ │
│ │ Sidebar │ ├──────────────────────────────────┤ │
│ │  (nav)  │ │                                  │ │
│ │         │ │   Main content (page.tsx)         │ │
│ │         │ │                                  │ │
│ └─────────┘ └──────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

```tsx
<div className="flex h-screen overflow-hidden">
  <Sidebar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <Header />
    <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
      {children}
    </main>
  </div>
</div>
```

O `h-screen` + `overflow-hidden` no container pai garante que a sidebar tem altura total da tela. O `overflow-y-auto` no main permite scroll apenas no conteudo, mantendo sidebar e header fixos.

---

## 5. Sidebar

**Arquivo:** `apps/admin/components/sidebar.tsx`

### O que faz

Barra de navegacao lateral com links para todas as secoes do painel. Esconde links conforme a role do usuario.

### Links de navegacao

| Label | Rota | Icone | Role minima |
|-------|------|-------|-------------|
| Dashboard | `/dashboard` | Grafico de barras | viewer |
| Tenants | `/tenants` | Predio | viewer |
| Sessoes | `/sessions` | Wi-Fi | viewer |
| Usuarios | `/users` | Grupo | superadmin |
| Audit Log | `/audit` | Escudo | superadmin |

### Filtragem por role

```typescript
{NAV_ITEMS.map((item) => {
  if (item.minRole && !hasRole(item.minRole)) return null
  // ...renderiza o link
})}
```

Se o usuario e `admin` ou `viewer`, os links de "Usuarios" e "Audit Log" nao aparecem na sidebar. A protecao e dupla: alem de esconder o link, as paginas tambem usam `RequireRole` (secao 7).

### Destaque da rota ativa

```typescript
const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
```

Verifica se o pathname atual e exatamente a rota do link OU se comeca com ela seguida de `/`. Assim, ao acessar `/tenants/uuid-do-tenant`, o link "Tenants" continua destacado.

### Icones

Icones SVG inline do Heroicons (outline, 24x24). Usar SVG inline evita dependencia externa e permite estilizar com Tailwind (`className="h-5 w-5"`, `stroke="currentColor"`).

---

## 6. Header

**Arquivo:** `apps/admin/components/header.tsx`

### O que faz

Barra superior com informacoes do usuario logado e botao de logout.

### Elementos

```
┌────────────────────────────────────────────────────┐
│                               Administrador  [Sair]│
│                               Super Admin          │
└────────────────────────────────────────────────────┘
```

### Badge de role com cores

```typescript
const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}
```

Cada role tem uma cor diferente para identificacao visual rapida:
- **Super Admin** → roxo
- **Admin** → azul
- **Viewer** → cinza

---

## 7. RequireRole

**Arquivo:** `apps/admin/components/require-role.tsx`

### O que faz

Componente guard que protege paginas que exigem uma role minima. Se o usuario nao tem permissao, redireciona para `/dashboard`.

### Uso

```tsx
// Em apps/admin/app/(dashboard)/users/page.tsx
export default function UsersPage() {
  return (
    <RequireRole minRole="superadmin">
      <div>
        <h1>Usuarios Admin</h1>
        {/* conteudo da pagina */}
      </div>
    </RequireRole>
  )
}
```

### Logica

```typescript
export function RequireRole({ minRole, children }: RequireRoleProps) {
  const { hasRole, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !hasRole(minRole)) {
      router.replace('/dashboard')    // redireciona sem permissao
    }
  }, [loading, hasRole, minRole, router])

  if (loading) return <Spinner />
  if (!hasRole(minRole)) return null  // retorna nada enquanto redireciona

  return <>{children}</>              // renderiza conteudo se tem permissao
}
```

### Protecao em camadas

A seguranca funciona em 3 camadas:

1. **Sidebar** — esconde o link (usuario nem ve a opcao)
2. **RequireRole** — redireciona se acessar por URL direta
3. **Backend** — retorna 403 `insufficient_role` se a role nao permite (ultima linha de defesa)

Nunca confiar apenas no frontend para seguranca. O `RequireRole` e UX, nao seguranca — a seguranca real esta no backend.

---

## 8. Estrutura de rotas

### Route group `(dashboard)/`

No Next.js App Router, pastas com parenteses `()` sao **route groups** — organizam arquivos e compartilham layout sem afetar a URL.

```
app/
├── login/page.tsx           → URL: /login       (SEM layout protegido)
└── (dashboard)/
    ├── layout.tsx           → Layout compartilhado (sidebar + header + auth guard)
    ├── dashboard/page.tsx   → URL: /dashboard
    ├── tenants/page.tsx     → URL: /tenants
    ├── sessions/page.tsx    → URL: /sessions
    ├── users/page.tsx       → URL: /users
    └── audit/page.tsx       → URL: /audit
```

O `(dashboard)` nao aparece na URL. A vantagem: todas as paginas dentro herdam automaticamente o layout com sidebar/header/protecao, sem precisar importar nada.

### Providers — wrapper client

**Arquivo:** `apps/admin/app/providers.tsx`

```tsx
'use client'
import { AuthProvider } from '../lib/auth-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
```

O `layout.tsx` raiz e um Server Component (para metadata). O `AuthProvider` precisa ser client (`useState`, `useEffect`). O `providers.tsx` e a ponte — um client component que envolve toda a arvore.

```tsx
// app/layout.tsx (Server Component)
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>  {/* client boundary */}
      </body>
    </html>
  )
}
```

### Pagina raiz — redirect inteligente

**Arquivo:** `apps/admin/app/page.tsx`

```typescript
useEffect(() => {
  if (!loading) {
    router.replace(user ? '/dashboard' : '/login')
  }
}, [loading, user, router])
```

Quem acessa `http://localhost:3000/` e redirecionado para `/dashboard` (se autenticado) ou `/login` (se nao). Mostra spinner durante a verificacao.

---

## 9. Fluxo completo

### Primeiro acesso (sem token)

```
1. Usuario acessa http://localhost:3000
2. app/page.tsx monta → useAuth() inicia com loading=true
3. AuthProvider verifica localStorage → sem token → loading=false, user=null
4. page.tsx ve !loading && !user → router.replace('/login')
5. login/page.tsx monta → mostra formulario
6. Usuario digita email/senha e clica "Entrar"
7. login() chama POST /admin/auth/login → recebe JWT
8. setToken(jwt) salva no localStorage
9. getMe() chama GET /admin/auth/me → recebe dados do usuario
10. setState({ user, loading: false }) → contexto atualizado
11. router.replace('/dashboard')
12. (dashboard)/layout.tsx monta → user existe → renderiza sidebar + header + conteudo
```

### Acesso com token valido (recarregar pagina)

```
1. Usuario recarrega http://localhost:3000/tenants
2. AuthProvider monta → le token do localStorage → chama getMe()
3. Backend valida JWT → retorna dados do usuario
4. setState({ user, loading: false })
5. (dashboard)/layout.tsx ve user → renderiza normalmente
6. Nenhum redirect, pagina /tenants aparece diretamente
```

### Acesso com token expirado

```
1. Usuario recarrega a pagina apos 8h
2. AuthProvider monta → le token do localStorage → chama getMe()
3. Backend retorna 401 (JWT expirado)
4. api.ts intercepta 401 → setToken(null), window.location.href = '/login'
5. AuthProvider catch → setState({ user: null, loading: false })
6. Usuario ve tela de login
```

### Acesso sem permissao (ex: viewer tenta /users)

```
1. Viewer digita http://localhost:3000/users na URL
2. (dashboard)/layout.tsx → user existe → renderiza
3. users/page.tsx → <RequireRole minRole="superadmin">
4. RequireRole → hasRole('superadmin') → false (viewer=0 < superadmin=2)
5. useEffect → router.replace('/dashboard')
6. Usuario e redirecionado para o dashboard
```

---

## 10. Correcoes da revisao

Tres pontos foram identificados na revisao e corrigidos:

### 1. Race condition no redirect do login (MEDIO)

**Problema:** O redirect de usuario ja autenticado era feito no corpo do render, fora de um `useEffect`. Isso causa state update durante render — React strict mode emite warning.

**Antes:**
```typescript
if (!authLoading && user) {
  router.replace('/dashboard')
  return null
}
```

**Depois:**
```typescript
useEffect(() => {
  if (!authLoading && user) {
    router.replace('/dashboard')
  }
}, [authLoading, user, router])

if (authLoading || user) {
  return <Spinner />  // mostra spinner enquanto redireciona
}
```

### 2. Flash de conteudo no RequireRole (MEDIO)

**Problema:** Quando o usuario nao tinha permissao, o componente mostrava uma mensagem amarela "Voce nao tem permissao" E fazia redirect ao mesmo tempo. O usuario via o aviso por um frame antes do redirect.

**Antes:**
```typescript
if (!hasRole(minRole)) {
  return (
    <div className="rounded-lg bg-yellow-50 p-6 text-center">
      <p>Voce nao tem permissao para acessar esta pagina.</p>
    </div>
  )
}
```

**Depois:**
```typescript
if (!hasRole(minRole)) {
  return null  // retorna nada, o useEffect ja esta redirecionando
}
```

### 3. Hard navigation no logout (BAIXO — observacao)

**Acao:** Adicionado comentario explicando que o `window.location.href` e intencional para garantir limpeza completa de estado client-side.

---

## 11. Como testar

### Subir o ambiente

```bash
# Terminal 1 — postgres e redis
cd infra && sudo docker compose up -d postgres redis

# Terminal 2 — admin backend
cd apps/admin-backend
DATABASE_URL="postgresql://captive:captive123@localhost:5432/captive_portal" \
JWT_SECRET="dev-jwt-secret-para-testes-locais-apenas" \
ENCRYPTION_KEY="gere-com-openssl-rand-base64-32" \
REDIS_URL="redis://:redis123@localhost:6379" \
npm run dev

# Terminal 3 — admin frontend
cd apps/admin
NEXT_PUBLIC_API_URL="http://localhost:8000" npm run dev
```

### Credenciais do seed

- **Email:** `admin@captiveportal.local`
- **Senha:** `Admin@123`
- **Role:** `superadmin`

### Cenarios de teste

| # | Cenario | Resultado esperado |
|---|---------|-------------------|
| 1 | Acessar `/` sem token | Redireciona para `/login` |
| 2 | Login com credenciais erradas | Mensagem vermelha "Email ou senha incorretos." |
| 3 | Login com credenciais corretas | Redireciona para `/dashboard` |
| 4 | Sidebar como superadmin | Mostra todos os 5 links (incluindo Usuarios e Audit Log) |
| 5 | Header | Mostra "Administrador", badge roxo "Super Admin", botao "Sair" |
| 6 | Clicar em cada link da sidebar | Navega corretamente, link ativo fica azul |
| 7 | Clicar "Sair" | Limpa token, reload completo, volta para `/login` |
| 8 | Acessar `/dashboard` direto sem token | Redireciona para `/login` |
| 9 | Acessar `/login` com token valido | Redireciona para `/dashboard` |
| 10 | Recarregar pagina com token valido | Mostra spinner breve, depois carrega normalmente |

---

## Proximas tasks que constroem em cima da F4

| Task | O que vai adicionar |
|------|-------------------|
| **F5** | CRUD de tenants — tabela, modal criar/editar, acoes (ativar/desativar/deletar) |
| **F6** | CRUD de usuarios admin — tabela, modal, protecao superadmin |
| **F7** | Dashboard com metricas, graficos (recharts), tabela de sessoes com filtros |
