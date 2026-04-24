# Plano: Abstracao Multi-Vendor para o Captive Portal

> Documento de planejamento arquitetural. Gerado em 2026-04-16.
> Status: aguardando revisao do Carlos.

---

## Contexto

O sistema hoje esta 100% acoplado ao SonicWall em **8 camadas**: middleware de serial, servico SonicWall (strategy pattern), implementacao LHM, frontend (redirect + validacao), config/env vars, schema do banco, tipos compartilhados e UI do admin. Para escalar o produto para clientes com outros fabricantes (FortiGate, UniFi, Mikrotik, etc.), precisamos de uma camada de abstracao vendor-agnostica que preserve o funcionamento atual do SonicWall LHM em producao.

**Prioridade de vendors:** FortiGate > UniFi > SonicWall Gen 7.x (ja implementado)

**Migracao:** zero-downtime (backward compatible)

---

## 1. Analise do Acoplamento Atual

### Pontos de acoplamento identificados

| Camada | Arquivo | Acoplamento |
|--------|---------|-------------|
| Middleware | `apps/backend/src/plugins/serial-guard.ts` | Header `X-Sonicwall-Serial`, env `ALLOWED_SERIALS` |
| Service | `apps/backend/src/services/sonicwall/index.ts` | `SonicwallConfig`, mode `rest\|lhm` |
| LHM | `apps/backend/src/services/sonicwall/lhm.ts` | `externalGuestLogin.cgi`, `sessionId`, `mgmtBaseUrl` |
| Config | `apps/backend/src/config.ts` | Env vars `SONICWALL_*`, `PortalConfig.sonicwall` |
| Frontend | `apps/frontend/lib/lhm-params.ts` | `extractLhmParams()`, `isValidLhmRedirectUrl()` |
| DB Schema | `infra/postgres/migrations/001_create_tenants.sql` | Coluna `sonicwall_config JSONB` |
| DB Schema | `infra/postgres/migrations/003_create_wifi_sessions.sql` | Colunas `sonicwall_raw`, `sonicwall_mode` |
| Shared Types | `packages/shared/src/types/tenant.ts` | Interface `SonicwallConfig`, campo obrigatorio em `CreateTenantRequest` |
| Provisioner | `apps/provisioner/src/docker.ts` | Env vars `SONICWALL_*` no container |
| Provisioner | `apps/provisioner/src/db.ts` | `SonicwallConfigDecrypted`, `decryptSonicwallConfig()` |
| Admin UI | `apps/admin/components/tenant-modal.tsx` | Secao "SonicWall Config" hardcoded, sem seletor de vendor |

### O que ja esta bem abstraido

- **OTP flow** (otp.ts, zenvia.ts) — nenhum acoplamento ao firewall
- **Rate limiting** — generico
- **Audit logging** — generico
- **Branding/session duration** — generico
- **Strategy pattern** em `sonicwall/index.ts` — a arquitetura ja permite trocar implementacoes

---

## 2. Descoberta Chave: TODOS os vendors prioritarios suportam browser-redirect

Pesquisando a documentacao oficial de cada fabricante, descobrimos que **FortiGate, UniFi e Mikrotik TODOS suportam o padrao "External Captive Portal" com browser-redirect** — ou seja, o mesmo principio do SonicWall LHM onde **a VPS NUNCA precisa acessar o ambiente do cliente**. O browser do usuario, que esta DENTRO da rede local, faz a comunicacao com o gateway.

### Como cada vendor funciona

| Vendor | Redirect inicial (firewall -> portal) | Auth confirmation (portal -> firewall) | Metodo |
|--------|--------------------------------------|---------------------------------------|--------|
| **SonicWall LHM** | `?sessionId=...&mgmtBaseUrl=...&mac=...` | GET `${mgmtBaseUrl}/externalGuestLogin.cgi?sessId=...` | GET redirect |
| **FortiGate** | `?post=https://<FGT>:1000/fgtauth&magic=...&usermac=...` | POST `https://<FGT>:1000/fgtauth` body: `magic=...&username=...&password=...` | **POST form** |
| **UniFi** | `?ap=...&id=...&ssid=...&t=...&url=...` | POST `/guest/login` no gateway com token | **POST form** |
| **Mikrotik** | `?mac=...&ip=...&link-login=...&link-orig=...` | POST/GET `link-login` com credentials | POST/GET |

### O padrao universal

```
1. Firewall/AP intercepta trafego do usuario nao autenticado
2. Redireciona pro nosso portal com: token de sessao + info do device + URL de retorno
3. Nosso portal faz OTP
4. Nosso portal redireciona o BROWSER do usuario de volta pro gateway local
5. Gateway valida o token e libera o acesso
```

**A VPS nunca precisa ter conectividade com o firewall do cliente em NENHUM vendor.**

### Diferenca importante: GET vs POST

- **SonicWall**: usa GET redirect (`window.location.href = url`)
- **FortiGate, UniFi, Mikrotik**: usam POST form submit (hidden form no frontend)

Isso exige uma pequena extensao no `ReleaseAccessResult`:

```typescript
interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  vendor: VendorType
  // Redirect info — presente quando o frontend precisa redirecionar
  redirect?: {
    url: string
    method: 'GET' | 'POST'           // GET = window.location, POST = form submit
    body?: Record<string, string>     // Params do POST (se method=POST)
  }
}
```

No frontend:
- `method: 'GET'` -> `window.location.href = url` (comportamento atual do SonicWall)
- `method: 'POST'` -> cria `<form>` hidden com os params e faz `.submit()` (novo, pra FortiGate/UniFi/Mikrotik)

### Fontes consultadas

- [FortiGate — Captive Portal Flow](https://community.fortinet.com/t5/FortiGate/Troubleshooting-Tip-General-captive-portal-explanation-flow-and/ta-p/355925)
- [FortiGate — Captive Portal Security (7.6.5)](https://docs.fortinet.com/document/fortiap/7.6.5/fortiwifi-and-fortiap-configuration-guide/292926/captive-portal-security)
- [UniFi — External Hotspot API](https://help.ui.com/hc/en-us/articles/31228198640023-External-Hotspot-API-for-Authorization-Clients)
- [UniFi — How Captive Portal Works (Art of WiFi)](https://artofwifi.net/blog/how-unifi-captive-portal-works-technical-guide)
- [Mikrotik — HotSpot Captive Portal (RouterOS)](https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal)

---

## 3. Taxonomia de Protocolos

Embora existam 3 categorias teoricas, **todos os vendors prioritarios caem em browser-redirect**:

| Protocolo | Como libera acesso | Vendors |
|-----------|-------------------|---------|
| **browser-redirect (GET)** | Backend monta URL -> browser navega via GET | SonicWall LHM |
| **browser-redirect (POST)** | Backend monta URL + body -> frontend submete form POST | **FortiGate**, **UniFi (legacy)**, Mikrotik |
| **api-call** | Backend faz HTTP ao controlador/cloud | UniFi (moderno), Meraki — **NAO prioritario** |
| **radius-coa** | Backend envia pacote RADIUS CoA | RADIUS generico — **futuro** |

Para a fase inicial, **so precisamos implementar browser-redirect (GET e POST)**. API-call e RADIUS-CoA ficam para o futuro quando/se houver demanda.

---

## 4. Arquitetura Proposta

### 4.1. Interface VendorStrategy

```typescript
// apps/backend/src/services/vendor/types.ts

type VendorType = 'sonicwall' | 'fortigate' | 'unifi' | 'mikrotik' | 'stub'
// Futuros: 'meraki' | 'radius'

interface RedirectInfo {
  url: string
  method: 'GET' | 'POST'
  body?: Record<string, string>  // Params do POST form
}

interface ReleaseAccessParams {
  mac: string
  ip: string
  phone: string
  sessionMinutes?: number
  vendorParams?: Record<string, string>  // Params capturados do redirect inicial
}

interface ReleaseAccessResult {
  success: boolean
  raw: unknown
  vendor: VendorType
  redirect?: RedirectInfo  // Presente = frontend redireciona; Ausente = vai pra /success
}

interface VendorStrategy {
  readonly vendor: VendorType

  /** Monta o redirect de confirmacao com base nos params capturados. */
  releaseAccess(
    params: ReleaseAccessParams,
    config: VendorConfig,
    logger: FastifyBaseLogger,
  ): Promise<ReleaseAccessResult>

  /** Valida que a URL de redirect e segura (anti-SSRF/phishing). */
  isValidRedirectUrl?(url: string): boolean
}
```

### 4.2. Config como Discriminated Union

```typescript
// packages/shared/src/types/vendor.ts

interface SonicwallVendorConfig {
  vendor: 'sonicwall'
  mode: 'lhm'                 // REST mode vira 'stub' vendor
  firmware?: number            // 6 ou 7
  lhm_port?: number           // default 4043
  guest_service_user?: string
  guest_service_pass?: string
}

interface FortigateVendorConfig {
  vendor: 'fortigate'
  // Nao precisa de campos extras! O FortiGate injeta tudo no redirect:
  // `post` (URL do fgtauth), `magic` (token), `usermac`, etc.
  // O backend so precisa montar o POST de volta.
  // Opcionais pra referencia/validacao:
  auth_port?: number           // default 1000 (HTTP) ou 1003 (HTTPS)
  use_https?: boolean          // default true
}

interface UnifiVendorConfig {
  vendor: 'unifi'
  // Modo browser-redirect (legacy /guest/login):
  // O AP injeta `ap`, `id`, `ssid`, `t`, `url` no redirect.
  // Backend monta POST de volta pro gateway.
  // Nenhuma credencial necessaria no modo browser-redirect!
  site?: string                // default 'default'
  gateway_port?: number        // default 8843 (HTTPS guest portal)
}

interface MikrotikVendorConfig {
  vendor: 'mikrotik'
  // Mikrotik HotSpot injeta `link-login` (URL de retorno) no redirect.
  // Backend monta POST/GET de volta pra esse link.
  // Credenciais do HotSpot user (pre-cadastrado no Mikrotik):
  hotspot_username?: string
  hotspot_password?: string
}

interface StubVendorConfig {
  vendor: 'stub'
  // Sempre sucesso, sem redirect. Pra dev/demo.
}

type VendorConfig =
  | SonicwallVendorConfig
  | FortigateVendorConfig
  | UnifiVendorConfig
  | MikrotikVendorConfig
  | StubVendorConfig
  // Futuros: | MerakiVendorConfig | RadiusVendorConfig
```

**Observacao importante**: No modo browser-redirect, a maioria dos vendors **injeta tudo que precisamos no redirect inicial** (URL de retorno, token, MAC, etc.). Isso significa que a config do vendor no banco fica **muito mais simples** do que no modelo api-call — muitas vezes nao precisa de credenciais nenhuma!

### 4.3. Generalizacao do Device Identifier

O conceito de "serial SonicWall" vira **device identifier** generico:

| Vendor | Identificador | Injetado como |
|--------|--------------|---------------|
| SonicWall | Serial number | Query param `serial` ou header `X-Sonicwall-Serial` |
| FortiGate | Serial | Query param `sn` ou no redirect |
| UniFi | AP MAC | Query param `ap` |
| Mikrotik | Router identity | Query param configuravel |

**Solucao**: O middleware `device-guard` aceita **multiplos headers/params** com fallback:
- `X-Device-Id` header (novo, padrao)
- `X-Sonicwall-Serial` header (backward compat)
- `?device_id=` query param (novo)
- `?serial=` query param (backward compat)
- `?ap=` query param (UniFi)

### 4.4. Implementacao concreta de cada strategy

**FortiGate** (`strategies/fortigate.ts`):
```typescript
// O FortiGate injeta no redirect: post, magic, usermac, apmac, apip, userip
// Apos OTP, montamos o POST de volta:
async releaseAccess(params, config, logger) {
  const vp = params.vendorParams ?? {}
  const postUrl = vp['post']         // URL do fgtauth (ex: https://10.0.0.1:1000/fgtauth)
  const magic = vp['magic']          // Token de sessao
  if (!postUrl || !magic) return { success: false, ... }

  return {
    success: true,
    vendor: 'fortigate',
    redirect: {
      url: postUrl,
      method: 'POST',
      body: {
        magic,
        username: params.mac,        // MAC como username (ou phone, configuravel)
        password: 'guest',           // Password pre-configurado no FortiGate
      }
    }
  }
}
```

**UniFi** (`strategies/unifi.ts`):
```typescript
// O UniFi AP injeta no redirect: ap, id, ssid, t, url
// Apos OTP, fazemos POST pro gateway /guest/login:
async releaseAccess(params, config, logger) {
  const vp = params.vendorParams ?? {}
  const token = vp['t']             // Token de sessao
  const apMac = vp['ap']            // MAC do AP
  if (!token) return { success: false, ... }

  const gatewayUrl = `https://<gateway>:${config.gateway_port ?? 8843}/guest/s/${config.site ?? 'default'}/login`

  return {
    success: true,
    vendor: 'unifi',
    redirect: {
      url: gatewayUrl,
      method: 'POST',
      body: { token, ap: apMac }
    }
  }
}
```

**Mikrotik** (`strategies/mikrotik.ts`):
```typescript
// O Mikrotik HotSpot injeta: link-login, link-orig, mac, ip, username, error
// link-login ja e a URL completa de retorno!
async releaseAccess(params, config, logger) {
  const vp = params.vendorParams ?? {}
  const loginUrl = vp['link-login']
  if (!loginUrl) return { success: false, ... }

  return {
    success: true,
    vendor: 'mikrotik',
    redirect: {
      url: loginUrl,
      method: 'POST',
      body: {
        username: config.hotspot_username ?? params.mac,
        password: config.hotspot_password ?? '',
      }
    }
  }
}
```

### 4.5. Estrutura do servico vendor

```
apps/backend/src/services/
├── vendor/                       # NOVO — camada vendor-agnostica
│   ├── index.ts                  # releaseAccess() dispatcher via registry
│   ├── types.ts                  # VendorStrategy, ReleaseAccessParams/Result, RedirectInfo
│   ├── registry.ts               # Map<VendorType, VendorStrategy>
│   └── strategies/
│       ├── sonicwall-lhm.ts      # Extraido de sonicwall/lhm.ts (mesmo codigo)
│       ├── fortigate.ts          # POST fgtauth com magic (prioridade 1)
│       ├── unifi.ts              # POST /guest/login com token (prioridade 2)
│       ├── mikrotik.ts           # POST/GET link-login (futuro)
│       └── stub.ts               # Always-succeed, sem redirect (dev/demo)
├── sonicwall/                    # MANTIDO — wrapper que delega pra vendor/
│   ├── index.ts                  # releaseAccess() agora chama vendor/index.ts
│   ├── lhm.ts                   # Re-exporta de vendor/strategies/sonicwall-lhm.ts
│   └── rest-api.ts               # Removido (virou vendor/strategies/stub.ts)
```

### 4.6. Migration do banco

```sql
-- 012_multi_vendor.sql

-- 1) Novo campo vendor_type nos tenants
ALTER TABLE tenants ADD COLUMN vendor_type VARCHAR(20) NOT NULL DEFAULT 'sonicwall';
ALTER TABLE tenants ADD COLUMN vendor_config JSONB NOT NULL DEFAULT '{}';

-- 2) Backfill: tenants existentes sao sonicwall
UPDATE tenants SET vendor_config = sonicwall_config;

-- 3) Generalizar tenant_serials -> tenant_device_ids
ALTER TABLE tenant_serials RENAME TO tenant_device_ids;
ALTER TABLE tenant_device_ids RENAME COLUMN serial TO device_id;
-- View de compatibilidade
CREATE VIEW tenant_serials AS
  SELECT id, tenant_id, device_id AS serial, role, created_at FROM tenant_device_ids;

-- 4) Novos campos em wifi_sessions (nao dropa os antigos)
ALTER TABLE wifi_sessions ADD COLUMN vendor_type VARCHAR(20);
ALTER TABLE wifi_sessions ADD COLUMN vendor_raw JSONB;
-- Backfill
UPDATE wifi_sessions SET vendor_type = 'sonicwall', vendor_raw = sonicwall_raw;

-- Colunas sonicwall_config, sonicwall_raw, sonicwall_mode NAO sao removidas.
-- Deprecar apos 6 meses de convivencia.
```

### 4.7. Mudancas no Frontend

- `lhm-params.ts` -> `vendor-params.ts` (com re-export para compat)
- `extractVendorParams()` substitui `extractLhmParams()` — mesma logica, nome generico
- `isValidRedirectUrl()` substitui `isValidLhmRedirectUrl()` — validacao por vendor:
  - SonicWall: valida `externalGuestLogin.cgi` (existente)
  - FortiGate: valida que URL contem `/fgtauth`
  - UniFi: valida que URL contem `/guest/` path
  - Mikrotik: valida protocolo HTTP/HTTPS + hostname presente
  - Stub: sem redirect, vai direto pra `/success`
- Header `X-Device-Id` (com fallback a `X-Sonicwall-Serial`)
- Campo `vendor_params` no body (com fallback a `lhm_params`)

**Nova funcionalidade no frontend — POST form submit:**

```typescript
// apps/frontend/lib/vendor-redirect.ts
export function executeRedirect(redirect: RedirectInfo) {
  if (redirect.method === 'GET') {
    // Comportamento atual do SonicWall
    window.location.href = redirect.url
    return
  }
  // POST form submit — FortiGate, UniFi, Mikrotik
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = redirect.url
  for (const [key, value] of Object.entries(redirect.body ?? {})) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}
```

Este e o unico codigo novo significativo no frontend — substitui o `window.location.href` atual por uma funcao que sabe lidar com GET e POST.

### 4.8. Mudancas no Admin UI

- **Seletor de vendor** no topo do formulario de tenant (dropdown: SonicWall, FortiGate, UniFi, Mikrotik, Stub)
- Config dinamica baseada no vendor selecionado:
  - `sonicwall`: formulario atual (inalterado)
  - `fortigate`: Porta auth (default 1000), HTTPS toggle, password do guest service
  - `unifi`: Site name (default 'default'), porta gateway (default 8843)
  - `mikrotik`: HotSpot username/password
  - `stub`: nenhum campo (mensagem "Modo desenvolvimento")
- Label "Seriais SonicWall" -> "Identificadores de Dispositivo"
- Help text contextual por vendor:
  - SonicWall: "Numero de serie do firewall (ex: SN-ABC123)"
  - FortiGate: "Numero de serie do FortiGate (ex: FG100F1234567890)"
  - UniFi: "MAC do AP ou site name (ex: default)"
  - Mikrotik: "Identity do router (configurado em /system/identity)"

### 4.9. Mudancas no Provisioner

- `apps/provisioner/src/docker.ts`: Env var `VENDOR_TYPE` sempre presente. Env vars vendor-specific baseadas no tipo:
  - `sonicwall`: continua com `SONICWALL_*` (backward compat)
  - `fortigate`: `FORTIGATE_AUTH_PORT`, `FORTIGATE_USE_HTTPS`
  - `unifi`: `UNIFI_SITE`, `UNIFI_GATEWAY_PORT`
  - `mikrotik`: `MIKROTIK_HOTSPOT_USER`, `MIKROTIK_HOTSPOT_PASS`
  - `stub`: nenhuma env var extra
- `apps/provisioner/src/db.ts`: `decryptSonicwallConfig()` -> `decryptVendorConfig()` que le o campo `vendor` e parseia adequadamente

---

## 5. Questao Resolvida: VPS NAO precisa acessar o ambiente do cliente

Ao contrario do que inicialmente parecia, **nao precisamos de VPN, tunnel ou qualquer acesso da VPS ao firewall do cliente** para nenhum dos vendors prioritarios. Todos suportam o padrao browser-redirect:

- **FortiGate**: O firewall injeta `post=https://<FGT>:1000/fgtauth&magic=<token>` no redirect. Apos OTP, o frontend submete um `<form>` POST diretamente pro FortiGate local via browser.
- **UniFi**: O AP injeta `ap`, `t` (token), `url` no redirect. O frontend POSTa pra `/guest/login` no gateway local.
- **Mikrotik**: O HotSpot injeta `link-login` (URL de retorno). O frontend POSTa/GETa pra esse link.

**A unica diferenca pro SonicWall**: SonicWall usa GET redirect, os outros usam POST form submit. O frontend precisa suportar ambos — trivial de implementar com a funcao `executeRedirect()`.

---

## 6. Prioridade de Implementacao

| Prioridade | Vendor | Redirect | Justificativa |
|-----------|--------|----------|---------------|
| 1 (feito) | SonicWall LHM | GET redirect | Producao, preservar |
| 2 | **Stub** | n/a (sem redirect) | Limpar REST stub como vendor proprio, dev/demo |
| 3 | **FortiGate** | POST form | **Prioridade maxima do cliente**. Valida o path POST pela primeira vez |
| 4 | **UniFi** | POST form | Segunda prioridade. Mesma mecanica do FortiGate |
| 5 | Mikrotik | POST/GET | Popular em ISPs BR, mesma mecanica |
| 6+ | Meraki, RADIUS | api-call, coa | Futuro, se houver demanda |

---

## 7. Migracao Zero-Downtime

1. **DB**: Adiciona colunas novas sem dropar as antigas. Backfill `vendor_type='sonicwall'`
2. **Backend**: `VENDOR_TYPE` default `'sonicwall'`. Containers sem essa var continuam funcionando
3. **Frontend**: Aceita headers/params antigos e novos (fallback chain)
4. **Provisioner**: Seta env vars antigos E novos pra tenants SonicWall
5. **Admin API**: Aceita `sonicwall_config` ou `vendor_config` no request

**Resultado**: tenants SonicWall existentes continuam sem nenhuma mudanca de config ou re-provisionamento.

---

## 8. Riscos

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| POST form submit cross-origin | Medio | Form submit nativo do browser NAO e bloqueado por CORS (so XHR/fetch sao). Ja validado por outros portais com FortiGate/UniFi. |
| FortiGate porta 1000/1003 inacessivel | Baixo | A porta e LOCAL (rede do cliente). O browser esta na mesma rede. Admin precisa garantir captive portal habilitado. |
| UniFi /guest/login deprecado em versoes novas | Medio | Testar contra Network App 8.x. Se deprecado, oferecer api-call como alternativa futura. |
| Seguranca: redirect pra URL maliciosa | Alto | Cada strategy tem `isValidRedirectUrl()`. Params (`post`, `mgmtBaseUrl`) vem do firewall, nao do usuario. Validacao de path obrigatoria. |
| Over-abstraction | Medio | Interface fina (1 metodo obrigatorio). Config minima por vendor no modo browser-redirect. |
| Migracao de config criptografada | Baixo | `decryptVendorConfig()` aceita formato antigo (sem `vendor`) e novo |

---

## 9. Fases de Implementacao

### Fase 1 — Fundacao (tipos + service layer + stub)
- Criar `packages/shared/src/types/vendor.ts` com `VendorType`, `VendorConfig`, `RedirectInfo`
- Criar `apps/backend/src/services/vendor/` (types.ts, registry.ts, index.ts)
- Extrair SonicWall LHM pra `vendor/strategies/sonicwall-lhm.ts` (mesmo codigo)
- Mover REST stub pra `vendor/strategies/stub.ts` (vendor proprio)
- `services/sonicwall/index.ts` delega pra `vendor/index.ts`
- **Testes confirmando ZERO mudanca de comportamento** no fluxo SonicWall

### Fase 2 — Device identifier + config + migration
- Criar `plugins/device-guard.ts` com fallback chain (X-Device-Id -> X-Sonicwall-Serial -> ?device_id -> ?serial)
- Atualizar `config.ts`: ler `VENDOR_TYPE` + env vars por vendor com fallback
- Criar migration `012_multi_vendor.sql`
- Atualizar provisioner (`db.ts` + `docker.ts`)

### Fase 3 — Frontend + POST form support
- Criar `apps/frontend/lib/vendor-params.ts` (re-export lhm-params pra compat)
- Criar `apps/frontend/lib/vendor-redirect.ts` (GET + POST form submit)
- Atualizar pages pra usar `executeRedirect()` em vez de `window.location.href`
- Atualizar `isValidRedirectUrl()` pra ser vendor-aware

### Fase 4 — Admin backend + UI
- `admin-backend/routes/tenants.ts` aceita `vendor_config`
- Seletor de vendor no `tenant-modal.tsx`
- Config form dinamica por vendor
- "Seriais" -> "Identificadores de Dispositivo"

### Fase 5 — FortiGate strategy
- Implementar `vendor/strategies/fortigate.ts`
- Validacao de `post` URL (deve conter `/fgtauth`)
- Montar POST body: `magic`, `username`, `password`
- **Teste end-to-end com FortiGate real**

### Fase 6 — UniFi strategy
- Implementar `vendor/strategies/unifi.ts`
- POST pro gateway `/guest/login` com token
- **Teste end-to-end com UniFi Controller**

### Fase 7+ — Vendors adicionais (futuro)
- Mikrotik strategy
- Meraki (api-call, se houver demanda)
- RADIUS generico (coa, se houver demanda)

---

## 10. Checklist de Verificacao

- [ ] Tenant SonicWall LHM existente continua funcionando sem NENHUMA mudanca
- [ ] Novo tenant com `vendor_type=stub` funciona end-to-end (OTP -> sucesso, sem redirect)
- [ ] Novo tenant com `vendor_type=fortigate` monta POST form correto com magic+username+password
- [ ] Novo tenant com `vendor_type=unifi` monta POST form correto pro /guest/login
- [ ] Frontend executa GET redirect (SonicWall) e POST form submit (FortiGate/UniFi) corretamente
- [ ] Admin UI mostra formulario correto por vendor selecionado
- [ ] Headers antigos (`X-Sonicwall-Serial`) continuam aceitos
- [ ] Migration e reversivel (colunas novas podem ser dropadas sem afetar fluxo atual)
- [ ] `isValidRedirectUrl()` rejeita URLs maliciosas pra cada vendor
