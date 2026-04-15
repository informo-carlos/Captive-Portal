# Protocolo LHM / External Guest Authentication — SonicWall TZ 570

> Documento de referência pra integração do portal captivo com o modo
> "External Guest Authentication" do SonicWall via LHM (a partir do
> SonicOS 7.3.2 / 8.2.0).

## Visão geral

LHM (Lightweight Hotspot Messaging) é o protocolo do SonicWall que delega
a autenticação de guests pra um servidor externo (nosso portal).

A partir do **SonicOS 7.3.2 / 8.2.0** a SonicWall **removeu** os CGIs
legados (`externalGuestLogin.cgi`, `externalGuestLogout.cgi`, etc.) e
substituiu tudo por uma API REST única:

```
POST {mgmtBaseUrl}/lhmapi/externalAAAGuest
Content-Type: application/json
```

**Importante**: o endpoint é `externalAAAGuest` (AAA = Authentication,
Authorization, Accounting) — *não* `externalGuest`. Documentação
oficial: `docs/LHM_API_DOC and Codes/REST API for External Guest
Authentication 1-2.pdf`.

## Fluxo end-to-end

```
[Usuário Wi-Fi] ──http──▶ [SonicWall TZ 570]
                                │
                                │ 1. Intercepta + redireciona com query params
                                ▼
                          [Nosso Portal Next.js (VPS)]
                                │
                                │ 2. Captura params LHM, mostra form
                                │ 3. Usuário informa telefone, recebe OTP
                                │ 4. Backend valida OTP
                                ▼
                          [Nosso Backend Fastify (VPS)]
                                │
                                │ 5. POST {mgmtBaseUrl}/lhmapi/externalAAAGuest
                                ▼
                          [SonicWall TZ 570 (rede local)]
                                │
                                │ 6. Valida sessId + HMAC, libera MAC
                                │ 7. Responde { code: "50", message: "..." }
                                ▼
                          [Nosso Backend]
                                │
                                │ 8. Devolve redirect_url pro frontend
                                ▼
                          [Browser do usuário]
                                │
                                │ 9. window.location → req original
                                ▼
                          [Site original]
```

O backend precisa alcançar `{mgmtBaseUrl}` — tipicamente o IP de
gerência do SonicWall na LAN do cliente. Em produção isso exige
VPN/túnel entre VPS e LAN (OpenVPN, WireGuard, SD-WAN, ou rota estática
via port forward com ACL). **Sem credenciais de admin** — a única coisa
necessária é rota IP.

## Etapa 1 — Redirect inicial do SonicWall pro portal

Quando o usuário tenta acessar qualquer site sem estar autenticado, o
SonicWall responde com um HTTP 302 pra URL configurada no External Guest
Auth ("Web Server Address"), injetando query params:

| Param | Tipo | Descrição |
|-------|------|-----------|
| `ssid` | string | SSID da rede Wi-Fi |
| `sessionId` | hex string | ID único da sessão guest. **Obrigatório ecoar no POST de retorno.** |
| `ip` | IP | IP do cliente na LAN |
| `mac` | MAC | MAC do cliente |
| `ufi` | string | Unique Firewall Identifier |
| `mgmtBaseUrl` | URL | URL base do SonicWall pro retorno (ex: `https://10.50.165.193:4043/`) |
| `clientRedirectUrl` | URL | URL alternativa do firewall |
| `req` | URL | URL original que o usuário tentou acessar |
| `hmac` | hex | (opcional) HMAC dos params acima, se Message Auth estiver habilitado |
| `cc` | int | Código de erro (quando houver) |

## Etapa 2 — Frontend captura e propaga

[apps/frontend/lib/lhm-params.ts](../apps/frontend/lib/lhm-params.ts) extrai
todos os query params que **não** são internos do nosso fluxo (`serial`,
`mac`, `ip`, `phone`, `name`, `lhm`) e trata como params LHM.

A página inicial envia esses params no body do `POST /auth/request-otp`
no campo `lhm_params`. O backend guarda em Redis junto com o OTP.

Entre `/` → `/otp` os params são serializados como JSON URI-encoded no
query param `lhm` da URL, pra sobreviver a reload.

## Etapa 3 — Backend POSTa pro firewall

[apps/backend/src/services/sonicwall/lhm.ts](../apps/backend/src/services/sonicwall/lhm.ts)
monta e envia:

```
POST {mgmtBaseUrl}/lhmapi/externalAAAGuest
Content-Type: application/json

{
  "info": {
    "action": 1,
    "sessId": "<sessionId recebido no redirect>",
    "userName": "<MAC do cliente>",
    "sessionLifetime": "<segundos; max 9999>",
    "idleTimeout": "<segundos; >= 60 e < sessionLifetime>",
    "maxRx": "0",
    "maxTx": "0",
    "quotaCycleType": "0",
    "cycleSessionLifeTime": "0",
    "cycleMaxRx": "0",
    "cycleMaxTx": "0",
    "hmac": "<opcional, hex>"
  }
}
```

### Valores do campo `action`

| Action | Significado |
|--------|-------------|
| 1 | Login (autorizar MAC) |
| 2 | Logout (revogar MAC) |
| 3 | Session Sync (status da sessão) |
| 4 | Update (alterar timeouts/quotas) |

### Limites documentados (SonicOS 7.3.2-7010)

- `sessionLifetime` ∈ (0, 9999] segundos — ~2h46min máximo
- `idleTimeout` ∈ [60, sessionLifetime) segundos
- `cycleSessionLifeTime` ∈ [0, 9999]
- `userName`: até 64 chars
- `sessId`: até 128 chars

Nosso código clampa automaticamente esses limites em
[lhm.ts:99-111](../apps/backend/src/services/sonicwall/lhm.ts#L99-L111).

### HMAC (opcional)

Se a UI do SW tiver **Zone Settings → External Guest Authentication →
Message Authentication** habilitada, o firewall exige HMAC em todos os
POSTs. O algoritmo é MD5 / SHA-1 / SHA-256 sobre a concatenação:

```
sessId + encodeURIComponent(userName) + sessionLifetime + idleTimeout
  + maxRx + maxTx + quotaCycleType + cycleSessionLifeTime
  + cycleMaxRx + cycleMaxTx
```

Chave compartilhada entre firewall e nosso backend via env
`TENANT_LHM_HMAC_KEY` + `TENANT_LHM_HMAC_ALGO` (default sha256).

## Etapa 4 — Resposta do firewall

O SW responde com JSON:

```json
{ "code": "50", "message": "Authenticate Success!!!" }
```

Tabela de códigos de resposta (seção 1.5 da doc oficial):

| Código | Significado |
|--------|-------------|
| `50` | Success |
| `51` | Limit reached (quota / max sessions) |
| `100` | Rejected by rule |
| `251` | HMAC validation failed |
| `253` | Invalid sessId |
| `254` | Missing/invalid parameter |
| `255` | Internal firewall error |

Nosso backend trata **apenas** `code === "50"` como sucesso; qualquer
outro valor vira `sonicwall_failed` (HTTP 502) pro frontend.

## Etapa 5 — Frontend redireciona

Com `code: "50"`, o backend calcula `redirect_url` via
[`pickLhmRedirectTarget`](../apps/backend/src/services/sonicwall/lhm.ts#L288-L291):
- Usa `req` original se for uma URL http(s) válida de até 2048 chars
- Senão cai pro probe `http://connectivitycheck.gstatic.com/generate_204`
  (Android/iOS detectam internet disponível e dispensam o captive prompt)

O frontend faz `window.location.href = redirect_url` —
`apps/frontend/app/otp/page.tsx`.

## Configuração no SonicWall TZ 570

1. **Network → Zones → WLAN/LAN** → enable *Guest Services* + *External Guest Authentication*
2. **Web Server Address**: `https://portal.example.com` (URL do nosso portal)
3. **Session Lifetime / Idle Timeout**: configurar no SW conforme default, o portal sobrescreve via POST
4. **Message Authentication** (opcional): habilitar e colar a mesma chave configurada no backend
5. **Allow Traffic From / To**: conforme política do cliente
6. **Rota entre VPS e LAN**: VPN/túnel/port forward com ACL restrita ao IP da VPS

## Pontos validados

- [x] Nomes dos query params do redirect inicial (doc oficial + KB SonicWall)
- [x] Endpoint real: `POST {mgmtBaseUrl}/lhmapi/externalAAAGuest` (doc oficial SonicWall, 16 páginas)
- [x] Estrutura do body com `info.*` + action codes (doc oficial seção 1.4)
- [x] Response codes (doc oficial seção 1.5)
- [x] Algoritmo HMAC e ordem dos campos (doc oficial seção 1.6)
- [x] Limites de sessionLifetime/idleTimeout (doc oficial + testes em 7.3.2-7010)
- [x] Implementação backend e frontend refatorados
- [ ] Teste end-to-end contra TZ 570 7.3.2 ao vivo (pendente deploy VPS + VPN)

## Referências

- **Doc oficial SonicWall**: `docs/LHM_API_DOC and Codes/REST API for External Guest Authentication 1-2.pdf` (16 páginas, enviada pelo suporte)
- **Exemplo PHP oficial**: `docs/LHM_API_DOC and Codes/guestLHMLogin.php`
- KB SonicWall 170504507130894 — *What LHM parameters are supported by NGFW*
- [django-sonicwall](https://github.com/claymation/django-sonicwall) (referência de implementação legada, ainda útil pros nomes dos params)
