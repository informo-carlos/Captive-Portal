# F5 — Admin: gestao de tenants no painel

> Documento tecnico explicando tudo que foi implementado na task F5.
> PR: #10 | Branch: `feat/task-f5`

---

## Indice

1. [Visao geral — o que foi criado](#1-visao-geral)
2. [Pagina /tenants — Listagem com tabela](#2-pagina-tenants)
3. [TenantModal — Modal criar/editar](#3-tenantmodal)
4. [Pagina /tenants/:id — Detalhes e stats](#4-pagina-tenantsid)
5. [Fix no api.ts — Content-Type condicional](#5-fix-no-apits)
6. [Fix no admin-backend — CORS para PATCH/DELETE](#6-fix-no-admin-backend)
7. [Controle de permissoes por role](#7-controle-de-permissoes)
8. [Como testar](#8-como-testar)
9. [Tenants RADIUS — guia operacional](#9-tenants-radius--guia-operacional)

---

## 1. Visao geral

A F5 implementou o **CRUD completo de tenants** na interface web do painel admin. Antes da F5, as paginas `/tenants` e `/tenants/:id` eram placeholders. Agora:

```
apps/admin/
├── app/(dashboard)/tenants/
│   ├── page.tsx              ← Tabela de tenants com filtros, paginacao e acoes
│   └── [id]/page.tsx         ← Detalhes do tenant com stats e config
├── components/
│   └── tenant-modal.tsx      ← Modal reutilizado para criar E editar tenants
└── lib/
    └── api.ts                ← Fix no Content-Type para DELETE sem body
```

Alem do frontend, dois bugs foram corrigidos:
- **CORS do admin-backend** nao permitia metodos PATCH e DELETE no browser
- **Content-Type do api.ts** era enviado em requests sem body, causando erro no Fastify

**Dependencias satisfeitas:**
- F4 (login + layout base) — ja temos auth, sidebar, header e protecao de rotas
- B4 (CRUD de tenants no backend) — todos os endpoints ja estao funcionando

---

## 2. Pagina /tenants

**Arquivo:** `apps/admin/app/(dashboard)/tenants/page.tsx`

### O que o usuario ve

Uma tabela com todos os tenants do sistema, com:
- **Colunas:** Nome (link clicavel), Porta, Status (badge colorido), Seriais (contagem), Criado em
- **Filtro** por status (Todos / Ativo / Inativo)
- **Botao "Novo cliente"** no topo (visivel apenas para admin+)
- **Acoes** por linha: Desativar/Ativar, Editar, Deletar (por permissao)
- **Paginacao** quando ha mais de 20 resultados

### Estado do componente

```typescript
// Dados
const [tenants, setTenants] = useState<Tenant[]>([])
const [pagination, setPagination] = useState<Pagination>(...)
const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
const [loading, setLoading] = useState(true)
const [error, setError] = useState('')

// Modal de criar/editar
const [modalOpen, setModalOpen] = useState(false)
const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)

// Modal de confirmacao de delete
const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
const [deleting, setDeleting] = useState(false)

// Loading individual por tenant (ativar/desativar)
const [togglingStatus, setTogglingStatus] = useState<string | null>(null)
```

O `togglingStatus` guarda o **ID do tenant** que esta sendo ativado/desativado. Isso permite mostrar loading apenas no botao daquele tenant especifico, sem afetar os outros.

### fetchTenants — Busca de dados

```typescript
const fetchTenants = useCallback(async (page = 1) => {
  setLoading(true)
  setError('')
  try {
    const res = await getTenants({
      status: statusFilter || undefined,
      page,
      limit: 20,
    })
    setTenants(res.data)
    setPagination(res.pagination)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      setError(err.message)
    } else {
      setError('Erro ao carregar tenants.')
    }
  } finally {
    setLoading(false)
  }
}, [statusFilter])
```

**Por que `useCallback` com `[statusFilter]`?** A funcao e recriada apenas quando o filtro muda. Isso permite usar no `useEffect` como dependencia sem causar loops infinitos:

```typescript
useEffect(() => {
  fetchTenants(1)
}, [fetchTenants])
```

Quando o usuario troca o filtro de status, o `useCallback` cria uma nova referencia → o `useEffect` roda → volta para pagina 1 com o novo filtro. Resultado: mudou o filtro → recarrega automaticamente.

### handleToggleStatus — Ativar/Desativar

```typescript
const handleToggleStatus = async (tenant: Tenant) => {
  const newStatus = tenant.status === 'active' ? 'inactive' : 'active'
  setTogglingStatus(tenant.id)
  try {
    await updateTenantStatus(tenant.id, newStatus)
    await fetchTenants(pagination.page)  // recarrega a mesma pagina
  } catch (err) {
    if (err instanceof ApiRequestError) {
      setError(err.message)
    }
  } finally {
    setTogglingStatus(null)
  }
}
```

O botao muda de texto baseado no status atual:
- Tenant ativo → botao amarelo "Desativar"
- Tenant inativo → botao verde "Ativar"

Apos a acao, recarrega a lista da mesma pagina para refletir a mudanca.

### handleDelete — Deletar com confirmacao

O delete tem duas etapas:
1. Clicar "Deletar" → abre modal de confirmacao (`setDeleteTarget(tenant)`)
2. Clicar "Deletar" no modal → executa a acao

```typescript
const handleDelete = async () => {
  if (!deleteTarget) return
  setDeleting(true)
  try {
    await deleteTenant(deleteTarget.id)
    setDeleteTarget(null)      // fecha o modal
    await fetchTenants(pagination.page)
  } catch (err) { ... }
  finally { setDeleting(false) }
}
```

O modal de confirmacao e renderizado condicionalmente:

```tsx
{deleteTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    ...
    <p>Tem certeza que deseja deletar <strong>{deleteTarget.name}</strong>?</p>
    <button onClick={handleDelete}>Deletar</button>
    <button onClick={() => setDeleteTarget(null)}>Cancelar</button>
  </div>
)}
```

### statusBadge — Badges coloridos

```typescript
const statusBadge = (status: string) => {
  const colors = {
    active: 'bg-green-100 text-green-800',    // verde
    inactive: 'bg-yellow-100 text-yellow-800', // amarelo
    deleted: 'bg-red-100 text-red-800',        // vermelho
  }
  const labels = {
    active: 'Ativo',
    inactive: 'Inativo',
    deleted: 'Deletado',
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}>
    {labels[status]}
  </span>
}
```

Usa Tailwind para cores semanticas — verde para ativo, amarelo para inativo, vermelho para deletado. O badge e reutilizado na tabela e na pagina de detalhes.

### Paginacao

Renderizada apenas quando `pagination.pages > 1`:

```tsx
<p>Mostrando {inicio}–{fim} de {total}</p>
<button onClick={() => fetchTenants(page - 1)} disabled={page <= 1}>Anterior</button>
<button onClick={() => fetchTenants(page + 1)} disabled={page >= pages}>Proxima</button>
```

Os botoes ficam desabilitados nas bordas (primeira/ultima pagina) via `disabled:opacity-50 disabled:cursor-not-allowed`.

---

## 3. TenantModal

**Arquivo:** `apps/admin/components/tenant-modal.tsx`

### O que faz

Modal reutilizado para **criar** e **editar** tenants. A prop `tenant` determina o modo:
- `tenant = null` → modo criacao
- `tenant = { ... }` → modo edicao

### Props

```typescript
interface TenantModalProps {
  tenant: Tenant | null   // null = criar, Tenant = editar
  onClose: () => void     // fechar sem salvar
  onSuccess: () => void   // fechou com sucesso — pai recarrega dados
}
```

### FormData — Estado do formulario

```typescript
interface FormData {
  name: string
  port: string            // string porque vem do input
  serial_primary: string
  serial_secondary: string
  sw_host: string
  sw_user: string
  sw_password: string
  sw_firmware: string     // "6" ou "7"
  sw_mode: 'rest' | 'lhm'
  sw_lhm_port: string
  sw_guest_user: string
  sw_guest_pass: string
  zenvia_token: string
}
```

**Por que tudo e `string`?** Inputs HTML sempre retornam strings. Converter para `number` no `handleSubmit` e mais simples e evita bugs com `NaN` durante a digitacao.

### Preenchimento no modo edicao

```typescript
useEffect(() => {
  if (tenant) {
    const primary = tenant.serials.find((s) => s.role === 'primary')
    const secondary = tenant.serials.find((s) => s.role === 'secondary')
    setForm({
      name: tenant.name,
      port: String(tenant.port),
      serial_primary: primary?.serial || '',
      serial_secondary: secondary?.serial || '',
      sw_host: tenant.sonicwall_config?.host || '',
      sw_user: tenant.sonicwall_config?.user || '',
      sw_password: '',          // ← vazio — API nunca retorna senha
      sw_firmware: String(tenant.sonicwall_config?.firmware || 7),
      sw_mode: tenant.sonicwall_config?.mode || 'rest',
      // ...
      zenvia_token: '',         // ← vazio — API nunca retorna token
    })
  }
}, [tenant])
```

**Ponto importante:** `sw_password` e `zenvia_token` ficam **vazios na edicao** porque a API nunca retorna campos sensiveis (regra do CLAUDE.md). Os inputs mostram placeholder `••••••••` e o helper `(deixe vazio para manter)` para o usuario entender.

### Validacao client-side

```typescript
const validate = (): string | null => {
  if (!form.name.trim()) return 'Nome e obrigatorio.'

  if (!isEditing) {
    const port = parseInt(form.port)
    if (isNaN(port) || port < 29000 || port > 29999) return 'Porta deve estar entre 29000 e 29999.'
  }

  if (!form.serial_primary.trim()) return 'Serial primario e obrigatorio.'

  if (!isEditing) {
    if (!form.sw_host.trim()) return 'Host SonicWall e obrigatorio.'
    if (!form.sw_user.trim()) return 'Usuario SonicWall e obrigatorio.'
    if (!form.sw_password.trim()) return 'Senha SonicWall e obrigatoria.'
    if (!form.zenvia_token.trim()) return 'Token Zenvia e obrigatorio.'
  }

  if (form.sw_mode === 'lhm') {
    if (!form.sw_guest_user.trim()) return 'Usuario guest service e obrigatorio para modo LHM.'
    if (!isEditing && !form.sw_guest_pass.trim()) return 'Senha guest service e obrigatoria para modo LHM.'
  }

  return null  // null = sem erro
}
```

**Logica por modo:**
- **Criacao:** todos os campos obrigatorios sao exigidos (porta, host, user, senha, token)
- **Edicao:** campos sensiveis (senha, token) sao opcionais — vazio significa "manter valor atual"
- **Modo LHM:** campos extras (`guest_user`, `guest_pass`) sao obrigatorios (guest_pass apenas na criacao)

A validacao da porta (`29000-29999`) segue a constraint `chk_tenants_port` do banco de dados.

### handleSubmit — Envio

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  const validationError = validate()
  if (validationError) { setError(validationError); return }

  if (isEditing) {
    // Monta UpdateTenantRequest — envia apenas campos preenchidos
    const data: UpdateTenantRequest = {
      name: form.name.trim(),
      serials: buildSerials(),
    }
    // sonicwall_config so e enviado se algum campo foi preenchido
    if (form.sw_host || form.sw_user || form.sw_password) {
      data.sonicwall_config = { ... }
    }
    // zenvia_token so e enviado se preenchido
    if (form.zenvia_token.trim()) data.zenvia_token = form.zenvia_token.trim()

    await updateTenant(tenant!.id, data)
  } else {
    // Monta CreateTenantRequest — todos os campos obrigatorios
    const data: CreateTenantRequest = {
      name: form.name.trim(),
      port: parseInt(form.port),
      serials: buildSerials(),
      sonicwall_config: { ... },
      zenvia_token: form.zenvia_token.trim(),
    }
    await createTenant(data)
  }

  onSuccess()
}
```

**Na edicao**, so envia campos que o usuario realmente preencheu. Se o usuario editou apenas o nome, a API recebe `{ name: "Novo nome", serials: [...] }` — sem tocar na config do SonicWall.

### buildSerials — Monta array de seriais

```typescript
const buildSerials = () => {
  const serials: { serial: string; role: 'primary' | 'secondary' }[] = []
  if (form.serial_primary.trim()) {
    serials.push({ serial: form.serial_primary.trim(), role: 'primary' })
  }
  if (form.serial_secondary.trim()) {
    serials.push({ serial: form.serial_secondary.trim(), role: 'secondary' })
  }
  return serials
}
```

O serial secundario e opcional (HA pair). Se o usuario deixar vazio, o array tera apenas 1 item.

### Tratamento de erros da API

```typescript
catch (err) {
  if (err instanceof ApiRequestError) {
    if (err.field) {
      setFieldError({ field: err.field, message: err.message })
    }
    setError(err.message)
  }
}
```

Se a API retornar erro com `field` (ex: `{ error: "conflict", field: "port", message: "Porta ja em uso" }`), o campo correspondente ganha borda vermelha:

```tsx
className={`... ${fieldError?.field === 'port' ? 'border-red-300' : 'border-gray-300'}`}
```

### Campos LHM condicionais

Os campos do modo LHM (porta LHM, usuario guest, senha guest) so aparecem quando `sw_mode === 'lhm'`:

```tsx
{form.sw_mode === 'lhm' && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
    {/* Porta LHM, usuario guest, senha guest */}
  </div>
)}
```

O container usa `border-amber-200 bg-amber-50` (fundo ambar) para visualmente diferenciar os campos LHM dos campos REST.

### Secoes do formulario

O modal e organizado em 4 secoes com headers `uppercase tracking-wider`:

1. **Informacoes basicas** — Nome e Porta
2. **Seriais SonicWall** — Primario e Secundario (HA pair)
3. **Configuracao SonicWall** — Host, Usuario, Senha, Firmware (Gen 6/7), Modo (REST/LHM)
4. **Zenvia (SMS)** — Token

A porta e **desabilitada na edicao** (`disabled={isEditing}`) com `bg-gray-100` para indicar visualmente que nao e editavel. Isso segue a regra da spec: "port nao pode ser alterado apos criacao".

---

## 4. Pagina /tenants/:id

**Arquivo:** `apps/admin/app/(dashboard)/tenants/[id]/page.tsx`

### O que o usuario ve

Pagina de detalhes de um tenant com:
- **Breadcrumb** "← Voltar para tenants"
- **Nome + badge de status** no topo
- **3 cards de stats:** total de sessoes, sessoes ultimos 30 dias, ultima autenticacao
- **Informacoes gerais:** ID, nome, porta, datas de criacao/atualizacao
- **Configuracao SonicWall:** host, usuario, firmware, modo (+ campos LHM se aplicavel)
- **Lista de seriais** com badges Primario/Secundario
- **Botoes de acao:** Ativar/Desativar, Editar, Deletar

### Rota dinamica do Next.js

```typescript
const params = useParams()
const tenantId = params.id as string
```

O `[id]` na pasta cria uma rota dinamica. O Next.js captura o valor da URL e disponibiliza via `useParams()`. Exemplo: `/tenants/b0000000-...` → `params.id = "b0000000-..."`.

### fetchTenant — Carrega detalhes

```typescript
const fetchTenant = useCallback(async () => {
  const data = await getTenant(tenantId)  // GET /admin/tenants/:id
  setTenant(data)
}, [tenantId])
```

O endpoint retorna `TenantDetail` que estende `Tenant` com o campo `stats`:

```typescript
interface TenantDetail extends Tenant {
  stats: {
    total_sessions: number
    sessions_last_30d: number
    last_auth_at: string | null
  }
}
```

### Cards de stats

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
  <Card titulo="Total de sessoes" valor={stats.total_sessions.toLocaleString('pt-BR')} />
  <Card titulo="Sessoes ultimos 30 dias" valor={stats.sessions_last_30d.toLocaleString('pt-BR')} />
  <Card titulo="Ultima autenticacao" valor={stats.last_auth_at ? new Date(...).toLocaleString('pt-BR') : 'Nenhuma'} />
</div>
```

`toLocaleString('pt-BR')` formata numeros com separador de milhar brasileiro (ex: `1.250` ao inves de `1250`). Datas sao formatadas no padrao BR (`dd/mm/aaaa hh:mm:ss`).

### Layout em grid

```tsx
<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
  {/* Stats: ocupa 3 colunas */}
  <div className="lg:col-span-3">...</div>

  {/* Detalhes: ocupa 2 colunas */}
  <div className="lg:col-span-2">
    {/* Info gerais + Config SonicWall */}
  </div>

  {/* Seriais: ocupa 1 coluna */}
  <div>
    {/* Lista de seriais */}
  </div>
</div>
```

Em telas grandes (`lg:`), o layout fica 2/3 + 1/3. Em mobile, empilha verticalmente. Os cards de stats sempre ocupam toda a largura.

### InfoRow — Componente auxiliar

```typescript
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
```

Componente simples definido no mesmo arquivo (nao exportado — uso exclusivo dessa pagina). `mono={true}` e usado para IDs, portas e seriais onde a fonte monospacada facilita a leitura.

### Acoes da pagina

As mesmas acoes da tabela estao disponiveis na pagina de detalhes:
- **Ativar/Desativar** — mesma logica, recarrega `fetchTenant()` apos sucesso
- **Editar** — abre `TenantModal` com os dados do tenant
- **Deletar** — modal de confirmacao, redireciona para `/tenants` apos sucesso (`router.push`)

---

## 5. Fix no api.ts

**Arquivo:** `apps/admin/lib/api.ts`

### O problema

A funcao `request()` sempre enviava `Content-Type: application/json`, mesmo em requests DELETE sem body:

```typescript
// ANTES — bug
const headers = {
  'Content-Type': 'application/json',  // ← sempre presente
  ...
}
```

O Fastify do admin-backend rejeita com `"Body cannot be empty when content-type is set to 'application/json'"`.

### A correcao

```typescript
// DEPOIS — correto
const headers = {
  ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  ...
}
```

O spread condicional `...(condição ? { chave: valor } : {})` e um padrao TypeScript para incluir propriedades condicionalmente em objetos. Se `options.body` existe (POST, PUT, PATCH com dados), inclui o header. Se nao (GET, DELETE sem body), nao inclui.

---

## 6. Fix no admin-backend

**Arquivo:** `apps/admin-backend/src/app.ts`

### O problema

O `@fastify/cors` com `{ origin: true }` so permitia `GET, HEAD, POST` por padrao. Requisicoes PATCH e DELETE do browser eram bloqueadas no **preflight** (OPTIONS request que o browser envia antes de metodos "nao simples"):

```
access-control-allow-methods: GET,HEAD,POST   ← faltavam PATCH e DELETE
```

O curl funcionava (nao faz preflight), mas o browser bloqueava silenciosamente.

### A correcao

```typescript
// ANTES
await fastify.register(cors, { origin: true })

// DEPOIS
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

Agora o preflight retorna:

```
access-control-allow-methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS
```

### Por que o curl funcionava mas o browser nao?

O browser implementa a **politica CORS** (Cross-Origin Resource Sharing). Quando o frontend (porta 3001) chama o backend (porta 8000), sao **origens diferentes**. Para metodos "nao simples" (PATCH, DELETE, PUT), o browser envia um **OPTIONS preflight** pedindo permissao antes da request real:

```
1. Browser: OPTIONS /admin/tenants/:id/status (posso fazer PATCH?)
2. Backend: allow-methods: GET, HEAD, POST (nao listou PATCH)
3. Browser: bloqueia a request — sem erro visivel no console em alguns casos
```

O curl nao e um browser — nao implementa CORS, entao as requests funcionavam normalmente.

---

## 7. Controle de permissoes por role

A F5 implementa controle de visibilidade e acesso baseado no role do usuario logado.

### No componente

```typescript
const { hasRole } = useAuth()
const canEdit = hasRole('admin')       // admin ou superadmin
const canDelete = hasRole('superadmin') // apenas superadmin
```

O `hasRole` usa uma hierarquia numerica definida no `auth-context.tsx`:

```typescript
const ROLE_HIERARCHY = { viewer: 0, admin: 1, superadmin: 2 }
// hasRole('admin') retorna true se role >= 1 (admin ou superadmin)
```

### Onde e aplicado

| Elemento | Viewer | Admin | Superadmin |
|----------|--------|-------|------------|
| Ver tabela de tenants | Sim | Sim | Sim |
| Botao "Novo cliente" | Nao | Sim | Sim |
| Botao "Editar" | Nao | Sim | Sim |
| Botao "Ativar/Desativar" | Nao | Sim | Sim |
| Botao "Deletar" | Nao | Nao | Sim |
| Coluna "Acoes" na tabela | Nao | Sim | Sim |

A coluna "Acoes" inteira e **removida da tabela** (nao apenas escondida) para viewers:

```tsx
{canEdit && (
  <th>Acoes</th>  // header
)}
// ...
{canEdit && (
  <td>...</td>    // celulas
)}
```

Isso evita uma coluna vazia na tabela para usuarios viewer.

---

## 8. Como testar

### Pre-requisitos

1. Postgres e Redis rodando (via Docker ou local)
2. Admin-backend rodando na porta 8000 com migrations aplicadas
3. Admin frontend rodando na porta 3001

### Iniciar servicos

```bash
# Postgres + Redis
sudo docker start captive-postgres captive-redis

# Admin backend
cd apps/admin-backend
PORT=8000 DATABASE_URL="postgresql://captive:captive123@localhost:5432/captive_portal" \
REDIS_URL="redis://:redis123@localhost:6379" \
JWT_SECRET="dev-jwt-secret-para-testes-locais-apenas" \
JWT_EXPIRES_IN=8h ENCRYPTION_KEY="dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==" \
NODE_ENV=development npx tsx src/app.ts &

# Admin frontend
cd apps/admin
NEXT_PUBLIC_API_URL=http://localhost:8000 npx next dev -p 3001
```

### Credenciais

- **Email:** admin@captiveportal.local
- **Senha:** Admin@123

### Roteiro de testes

**1. Listagem**
- Acessar http://localhost:3001 → fazer login → clicar "Tenants" na sidebar
- Verificar que "Tenant Exemplo" aparece na tabela com status Ativo
- Testar filtro de status (Todos / Ativo / Inativo)

**2. Criar tenant**
- Clicar "Novo cliente"
- Preencher todos os campos (porta: 29001, serial: SN-TEST-001, etc)
- Salvar — deve aparecer na tabela
- Tentar criar com porta 29000 (duplicada) — deve mostrar erro de conflito

**3. Editar tenant**
- Clicar "Editar" em um tenant
- Verificar que a porta esta desabilitada (cinza)
- Verificar que campos de senha mostram "(deixe vazio para manter)"
- Alterar nome → salvar → verificar na tabela

**4. Ativar/Desativar**
- Clicar "Desativar" — badge deve mudar para amarelo "Inativo"
- Clicar "Ativar" — badge deve voltar para verde "Ativo"

**5. Deletar (superadmin)**
- Clicar "Deletar" — modal de confirmacao aparece
- Confirmar — tenant some da lista

**6. Detalhes**
- Clicar no nome de um tenant na tabela
- Verificar cards de stats, informacoes gerais, config SonicWall, seriais
- Testar acoes (editar, ativar/desativar, deletar) a partir da pagina de detalhes

### Teste de build

```bash
cd apps/admin && npx next build
# Deve compilar sem erros
```

---

## 9. Tenants RADIUS — guia operacional

> Esta seção cobre o fluxo completo de criar, configurar e diagnosticar
> um tenant RADIUS pelo painel. Para a especificação técnica do protocolo
> e do fluxo MAB + CoA, ver [`docs/spec-radius-auth.md`](spec-radius-auth.md).
> Para a operação de baixo nível (provisioner, portas UDP, walled-garden),
> ver [`docs/runbook-radius.md`](runbook-radius.md).

Tenants RADIUS são usados quando o firewall do cliente **não é SonicWall**
(Mikrotik, Unifi, pfSense, SonicWall com RADIUS nativo, etc.). Em vez de
a VPS chamar a API REST do fabricante para liberar acesso, o firewall
fala RADIUS UDP com um container dedicado do tenant. O fluxo MAB funciona
assim:

1. Guest conecta no SSID → Mikrotik envia Access-Request (UDP/1812) para
   a VPS na porta alocada do tenant.
2. Container responde Access-Reject (1ª vez) → guest é redirecionado
   pro portal captivo.
3. Guest preenche celular → OTP por SMS → digita OTP no portal.
4. Portal grava autorização efêmera no Redis + dispara CoA-Disconnect
   (UDP/3799) pro Mikrotik.
5. Mikrotik reconecta o MAC → Access-Request de novo → container
   responde Access-Accept com Session-Timeout.
6. Mikrotik começa a mandar Accounting (UDP/1813) — start, interim
   updates, stop.

### 9.1. Criar um tenant RADIUS

Pré-requisito: o Dev 1 (backend/infra) confirmou que o range UDP
`18120-18219` está liberado no firewall da VPS.

1. `/tenants` → **Novo cliente**.
2. Preencher nome, porta HTTP (29000-29099, única por tenant), seriais.
3. Em **Modo de autenticação**, escolher **RADIUS**. O formulário muda —
   seção SonicWall some, seção RADIUS aparece.
4. **Shared secret:** gerar um segredo forte (32 chars recomendado) em
   um gerador de senhas. Copiar na mesma hora pro gerenciador de senhas
   do cliente — **o painel nunca devolve em claro depois de salvar**.
5. **Porta CoA (NAS):** `3799` (default RFC 5176) — só mudar se o
   firewall do cliente usa porta customizada.
6. **Duração da sessão:** `14400` segundos (4h) default, cobre cafés e
   hotéis. Para cenários longos (hotel com guest fixo), pode subir.
7. **NAS permitidos:** lista de IPs/CIDRs do firewall do cliente. Se
   vazio, aceita de qualquer origem — só use vazio em lab ou quando o
   cliente tem IP dinâmico sem alternativa.
8. Token Zenvia + Sender Zenvia (SMS do OTP continua sendo pela Zenvia
   independente do modo).
9. **Salvar** — tenant entra em `status='provisioning'`.

O provisioner (worker interno) vê o status, aloca um **par de portas UDP**
(`radius_auth_port` + `radius_acct_port`, consecutivas no range 18120-18219),
cria o container Docker com port bindings UDP/1812 + UDP/1813 mapeados
pras portas alocadas, e move pra `status='active'`. Normalmente leva
10-20 segundos. A página `/tenants/:id` faz polling automático — não
precisa dar F5.

### 9.2. Configurar o firewall do cliente

Na página `/tenants/:id` do tenant ativo, o card **"Configurar firewall"**
tem snippets prontos pra copiar pra cada fabricante:

- **Mikrotik RouterOS** — `/radius add`, `/radius incoming`, walled-garden
  via `/ip hotspot walled-garden add`.
- **Unifi Network Application** — RADIUS Profile + MAC Authentication
  no SSID.
- **SonicWall (6.5/7) em modo RADIUS nativo** — Manage → Users → RADIUS.
- **pfSense** — System → User Manager → Authentication Servers (FreeRADIUS).

Os snippets vêm preenchidos com **os valores reais desse tenant** (VPS,
portas UDP alocadas, CoA port). O único placeholder que sobra é
`<SHARED_SECRET>` — o operador cola o segredo salvo no gerenciador de
senhas do cliente.

### 9.3. Verificar que está funcionando — badge online/offline

No card **"Configuração RADIUS"** do tenant tem um badge que atualiza
a cada 15s lendo `GET /admin/tenants/:id/radius-status`:

| Badge | Significado |
|-------|-------------|
| **Verificando...** | Primeiro poll ainda não voltou (<15s após abrir a página) |
| **Aguardando** | Tenant está em `provisioning`/`inactive`/`failed` — não polla |
| **Online** | Container ativo **e** accounting recebido <5min atrás **OU** nunca visto (tenant novo sem tráfego) |
| **Offline** | Container ativo mas último accounting foi >5min atrás (firewall parou de falar) |

Tooltip mostra o horário do último accounting formatado em pt-BR.

### 9.4. Diagnóstico — o que checar quando dá errado

**Badge ficou "Offline" depois de ter funcionado.**
- O firewall parou de mandar accounting. Checar se o equipamento está
  acessível e configurado com as portas UDP corretas.
- Dev 1 pode rodar `docker logs portal-<slug>-<porta>` na VPS pra ver
  se chegam Access-Requests.

**Tenant ficou em `status='failed'` durante o provisionamento.**
- Banner vermelho na página mostra `provisioning_error` com a mensagem
  do worker.
- Botão **"Tentar novamente"** dispara `POST /admin/tenants/:id/retry-provisioning`.
- Causas comuns: range UDP esgotado (100 slots), conflito de nome de
  container, healthcheck falhando.

**Snippet do firewall não tem portas (`<PORTA_AUTH>`, `<PORTA_ACCT>`).**
- Isso aparece enquanto o tenant ainda está em `provisioning`. Espera o
  provisioner fechar e as portas reais aparecem automaticamente.

**Cliente diz "tô digitando o código certo e não libera".**
- Checar `auth_attempts` no DB pra ver se o OTP foi validado.
- Se validado mas o firewall não libera: o CoA pode estar sendo
  bloqueado. Verificar se a porta CoA (default 3799) está aberta no
  firewall do cliente e se o NAS tá listado em `nas_ip_allowlist` (ou
  lista vazia).

**Tenant criado com `auth_mode='radius'` mas campo `shared_secret` vazio
na UI.**
- Impossível — a validação `missing_radius_fields` barra POST sem
  shared_secret. Se viu isso, abrir issue com o payload que gerou.

**Não consigo mudar o modo de `sonicwall` pra `radius` (ou vice-versa).**
- Correto. O PUT explicitamente bloqueia mudança de `auth_mode`. A
  operação completa (dealocar portas + recriar container + trocar
  validações) fica pra v2. Workaround: deletar + recriar tenant.

---

## 10. Proximas tasks que constroem em cima da F5

| Task | O que vai adicionar |
|------|-------------------|
| **F6** | CRUD de usuarios admin (superadmin only) — mesma estrutura de tabela + modal |
| **F7** | Dashboard com metricas, graficos e tabela de sessoes |
