# Protocolo LHM / External Guest Authentication — SonicWall TZ 570

> Documento de referência pra integração do portal captivo com o modo
> "External Guest Authentication" do SonicWall via LHM.

## Visão geral

LHM (Lightweight Hotspot Messaging) é o protocolo do SonicWall que delega
a autenticação de guests pra um servidor externo (nosso portal). O fluxo
elimina a necessidade de credenciais REST no firewall e funciona mesmo
quando o cliente não tem IP fixo — é tudo feito via redirect do navegador
do usuário, que está dentro da rede do cliente.

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
                                │ 4. Backend monta redirect_url
                                ▼
                          [Browser do usuário]
                                │
                                │ 5. window.location → externalGuestLogin.cgi
                                ▼
                          [SonicWall TZ 570 (rede local)]
                                │
                                │ 6. Valida sessId, libera tráfego
                                │ 7. Redireciona pro `req` original
                                ▼
                          [Site original]
```

A nossa VPS **nunca** fala diretamente com o SonicWall. Toda a confirmação
da auth passa pelo navegador do usuário, que está na LAN do cliente.

## Etapa 1 — Redirect inicial do SonicWall pro portal

Quando o usuário tenta acessar qualquer site sem estar autenticado, o
SonicWall responde com um HTTP 302 pra URL configurada no External Guest
Auth ("Web Server Address"), injetando query params:

| Param | Tipo | Descrição |
|-------|------|-----------|
| `sessionId` | hex string | ID único da sessão guest. **Obrigatório ecoar de volta.** |
| `ip` | IP | IP do cliente na LAN |
| `mac` | MAC | MAC do cliente |
| `ufi` | string | Unique Firewall Identifier |
| `mgmtBaseUrl` | URL | URL base do SonicWall pro retorno (ex: `https://10.50.165.193:4043/`) |
| `clientRedirectUrl` | URL | URL alternativa do firewall (raramente usada) |
| `req` | URL | URL original que o usuário tentou acessar |
| `cc` | int | Código de erro (quando houver) |

Exemplo de redirect:

```
https://portal.example.com/?sessionId=0b712fd83b9f5313db5af1cea6b1004f
  &ip=10.50.165.231
  &mac=00:0e:35:bd:c9:37
  &ufi=0006b11184300
  &mgmtBaseUrl=https://10.50.165.193:4043/
  &clientRedirectUrl=https://10.50.165.193:444/
  &req=http%3A//www.google.com/
```

## Etapa 2 — Frontend captura e propaga

[apps/frontend/lib/lhm-params.ts](../apps/frontend/lib/lhm-params.ts) extrai
todos os query params que **não** são internos do nosso fluxo (`serial`,
`mac`, `ip`, `phone`, `name`, `lhm`) e trata como params LHM.

A página inicial envia esses params no body do `POST /auth/request-otp` no
campo `lhm_params`. O backend guarda em Redis junto com o OTP.

Entre /home → /otp os params são serializados como JSON URI-encoded no
query param `lhm` da URL, pra não perder no recarregamento de página.

## Etapa 3 — Backend monta a URL de retorno

[apps/backend/src/services/sonicwall/lhm.ts](../apps/backend/src/services/sonicwall/lhm.ts)
após validar o OTP constrói:

```
${mgmtBaseUrl}externalGuestLogin.cgi
  ?sessId=<sessionId do redirect inicial>
  &userName=<MAC do cliente>
  &sessionLifetime=<segundos — vem de tenants.session_duration_minutes>
  &idleTimeout=1800
```

Parâmetros suportados pelo `externalGuestLogin.cgi` (KB SonicWall 170504507130894):

| Param | Tipo | Descrição |
|-------|------|-----------|
| `sessId` | hex | **Obrigatório.** Mesmo `sessionId` recebido no redirect inicial. |
| `userName` | string | Nome de usuário pro log do firewall (usamos o MAC). |
| `sessionLifetime` | int (s) | Duração total da sessão. |
| `idleTimeout` | int (s) | Timeout por inatividade. |
| `maxRx` | int (MB) | Quota de download (opcional). |
| `maxTx` | int (MB) | Quota de upload (opcional). |

## Etapa 4 — Frontend redireciona o navegador

O backend devolve `redirect_url` na resposta do `verify-otp`. O frontend
valida (ver [`isValidLhmRedirectUrl`](../apps/frontend/lib/lhm-params.ts):
deve ser HTTPS/HTTP e o path deve terminar em `/externalGuestLogin.cgi`)
e faz `window.location.href`.

O SonicWall recebe a chamada, valida o `sessId`, libera o tráfego do MAC
e redireciona o usuário pro `req` original.

## Configuração no SonicWall TZ 570

1. **Network → Zones → WLAN/LAN** → enable Guest Services + External Guest Auth
2. **Web Server Address**: `https://portal.example.com` (URL do nosso portal)
3. **Session Lifetime / Idle Timeout**: deixar em 0 — quem dita é o portal via querystring
4. **Allow Traffic From / To**: configurar conforme política do cliente

## ⚠️ BLOQUEIO CONFIRMADO — SonicOS 7.3.2+

A SonicWall **removeu** o endpoint `externalGuestLogin.cgi` e todo o
mecanismo de External Web Server CGI a partir do **SonicOS 7.3.2** e
**SonicOS 8.2.0**. Citação oficial:

> *"Support for customizing guest login pages using an external web
> server with the CGI mechanism has been deprecated and has been removed
> starting with SonicOS 7.3.2 and SonicOS 8.2.0 and later releases."*

Validado em campo (08/04/2026) contra um TZ 570 rodando
**SonicOS 7.3.2-7010-R9118**:
- O SW continua mandando o redirect com todos os params LHM
  (`sessionId`, `mac`, `ufi`, `mgmtBaseUrl`, `clientRedirectUrl`, `req`)
- Os campos "Logout CGI / Server Status CGI / Session Sync CGI" ainda
  aparecem na UI (Network → Zones → Guest Services → Advanced) mas são
  vestígios mortos da feature deprecada
- Qualquer chamada a `externalGuestLogin.cgi` em qualquer porta retorna
  `404 SonicWall Server` — o handler simplesmente não existe mais

**Conclusão:** o modo `lhm` deste código só funciona em **SonicOS ≤ 7.2.x**.
Pra firmwares 7.3.2+ e 8.2.0+, é obrigatório usar:
1. Modo `rest` via `/api/sonicos/user-management/guest/*` (requer alcance
   de rede VPS → SW, ex: port forward na WAN com ACL whitelist)
2. RADIUS/LDAP backend
3. Downgrade do firmware pra 7.2.x

## Pontos validados / pendentes

- [x] Nomes dos query params do redirect inicial (KB + django-sonicwall)
- [x] Endpoint `externalGuestLogin.cgi` e parâmetros (KB SonicWall 170504507130894)
- [x] Implementação backend e frontend
- [x] Testar end-to-end contra TZ 570 ao vivo — **falhou em 7.3.2** (CGI removida)
- [ ] Validar contra TZ 570 rodando 7.2.x (caminho feliz teórico)

## Referências

- KB SonicWall 170504507130894 — *What LHM parameters are supported by NGFW*
- [django-sonicwall](https://github.com/claymation/django-sonicwall) (referência de implementação)
- LHM FAQ (Scribd 247193147)
