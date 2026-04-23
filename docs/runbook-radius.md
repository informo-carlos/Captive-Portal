# Runbook — Tenant RADIUS

> Guia operacional pra criar, configurar e diagnosticar tenants em modo RADIUS (MAB + CoA).
> Complementa a spec `docs/spec-radius-auth.md`.

---

## 1. Criar tenant RADIUS no painel admin

1. Admin → **Tenants** → **Novo Tenant**
2. Em **"Tipo de autenticação"**, selecionar **RADIUS**
3. Preencher:
   - **Nome** — ex: "Cliente XPTO"
   - **Porta HTTP** — 29000-29999 (admin escolhe livre)
   - **Serial do firewall** — serial do SonicWall/firewall (validado no serial-guard pra requests HTTP, ver §6 abaixo)
   - **Shared Secret RADIUS** — gerar com `openssl rand -base64 32`. **Guardar agora** — painel nunca mostra de novo.
   - **CoA Port** — default 3799 (RFC 5176). Normalmente não mudar.
   - **Session Timeout** — 4h default, 300s-86400s
   - **Zenvia Token / Sender** — igual SonicWall
4. Confirmar → provisioner cria container automaticamente em ~10s

Response inclui as **portas UDP alocadas** (range 18120-18219):

```json
{
  "id": "uuid",
  "auth_mode": "radius",
  "radius_auth_port": 18120,
  "radius_acct_port": 18121,
  "status": "provisioning"
}
```

Essas portas vão no firewall do cliente (passo 2 abaixo).

---

## 2. Configurar firewall — Mikrotik, Unifi, SonicWall, pfSense

Na página de detalhe do tenant RADIUS, o painel mostra snippets prontos (aba **"Configurar firewall"** — entregue na F11 do Carlos).

### 2.1 Dados que o admin precisa colar no firewall

| Campo | Onde achar | Exemplo |
|-------|------------|---------|
| IP/host da VPS | IP público onde roda o Docker | `45.7.53.80` |
| Porta UDP Auth | Response do POST tenant (`radius_auth_port`) | `18120` |
| Porta UDP Accounting | Response do POST tenant (`radius_acct_port`) | `18121` |
| Shared Secret | O que você colou na criação (não volta da API) | `(valor gerado com openssl rand)` |
| CoA Port | `radius_config.coa_port` do tenant | `3799` |

### 2.2 Mikrotik RouterOS — exemplo

```
/radius add service=hotspot,login address=45.7.53.80 \
    secret="<SEU_SHARED_SECRET>" \
    authentication-port=18120 accounting-port=18121

/radius incoming set accept=yes port=3799

/ip hotspot profile set [find name=default] \
    use-radius=yes radius-accounting=yes \
    radius-interim-update=5m \
    mac-auth-mode=mac-as-username-and-password

# Walled garden — antes do OTP o guest SÓ alcança o portal
/ip hotspot walled-garden add dst-host=portal.exemplo.com action=allow
```

### 2.3 Unifi Network Application

```
Settings → Profiles → RADIUS → Create profile
  Auth: 45.7.53.80:18120 secret=<SHARED_SECRET>
  Acct: 45.7.53.80:18121 secret=<SHARED_SECRET>
  CoA: habilitar, porta 3799

Wireless Networks → SSID guest → Advanced → RADIUS MAC Auth: ON
  MAC format: aabbccddeeff (sem separador, minúsculo)
```

### 2.4 pfSense

```
System → User Manager → Authentication Servers → Add
  Type: RADIUS  Protocol: PAP
  Host: 45.7.53.80
  Auth port: 18120  Acct port: 18121
  Shared Secret: <SHARED_SECRET>

Services → Captive Portal → <zone>
  Authentication Method: RADIUS
  Primary RADIUS: escolher o server acima
  MAC authentication: ON
  Accounting: ON
```

### 2.5 Walled garden — checklist universal

Antes do guest autenticar via OTP, o firewall precisa permitir **apenas** o acesso ao portal captivo (HTTP/HTTPS pra VPS). Sem isso, o guest nunca consegue abrir a tela de OTP.

Destinos a liberar:
- IP da VPS, porta 80/443/`tenant.port` (HTTP)
- DNS do cliente (53/udp) — pra resolver o domínio do portal
- Evitar NAT reversa que quebre o redirect

---

## 3. Fluxo do guest ao conectar (sequência esperada)

```
1. Guest associa ao SSID
   └─ Firewall detecta MAC novo

2. Firewall envia Access-Request (UDP/18120 na VPS)
   └─ Backend: MAB miss → Access-Reject
   └─ Backend: grava radius:last_nas:<tenant>:<mac> no Redis (TTL 15min)

3. Firewall mantém guest no walled-garden
   └─ Única saída: portal HTTP

4. Guest abre browser → redirect pro portal → digita celular
   └─ POST /auth/request-otp → Zenvia envia SMS

5. Guest digita código → POST /auth/verify-otp
   └─ Backend: SET radius:authorized:<tenant>:<mac> TTL=4h no Redis
   └─ Backend: lê last_nas → dispara CoA-Disconnect (UDP/3799 no firewall)
   └─ Backend: INSERT wifi_sessions release_status=active

6. Firewall recebe CoA → desconecta MAC → re-Access-Request
   └─ Backend: MAB hit → Access-Accept + Session-Timeout + Termination-Action

7. Guest online ✓

8. Firewall envia Accounting-Request Start/Interim/Stop (UDP/18121 na VPS)
   └─ Backend: INSERT/UPDATE radius_sessions (bytes_in, bytes_out, duração)
```

Tempo total OTP → online: tipicamente **<5s**. Se o CoA falhar 3x, a resposta fica `release_status=degraded` e o firewall re-MAB sozinho em alguns minutos.

---

## 4. Verificar saúde do container

### 4.1 /health do portal

```bash
curl http://localhost:<tenant.port>/health
```

Response esperado:

```json
{
  "status": "ok",
  "auth_mode": "radius",
  "radius": {
    "enabled": true,
    "authListening": true,
    "acctListening": true,
    "auth_port": 1812,
    "acct_port": 1813
  }
}
```

Se algum listener caiu, response é `503` e o Docker HEALTHCHECK marca unhealthy (provisioner restart).

### 4.2 /admin/tenants/:id/radius-status (painel admin)

```json
{
  "enabled": true,
  "online": true,
  "active_sessions": 42,
  "last_accounting_at": "2026-04-23T11:37:39.461Z"
}
```

"online" = tenant ativo + accounting visto <5min (ou nunca visto = tenant recém-criado, aceito como online).

### 4.3 docker inspect

```bash
docker inspect portal-<slug>-<port> --format '{{.NetworkSettings.Ports}}'
# Esperado:
# 1812/udp -> 0.0.0.0:18120
# 1813/udp -> 0.0.0.0:18121
# 3000/tcp -> (sem binding externo, passa por nginx)
```

---

## 5. Diagnóstico de problemas comuns

### "Firewall manda Access-Request mas nunca chega a Accept"

1. `docker logs portal-<slug>-<port> --tail 50 | grep radius_`
   - `radius_bad_secret` → secret não bate. Verificar shared_secret no firewall vs painel.
   - `radius_missing_message_authenticator` → firewall antigo não manda attribute. Atualizar firmware.
   - `radius_invalid_mac_format` → User-Name não é MAC. Na config do firewall, habilitar MAC authentication.
   - `radius_reject_mab_miss` → MAC não está no Redis. Guest precisa fazer OTP primeiro.

2. Do servidor, testar UDP bind:
   ```bash
   docker exec portal-<slug>-<port> ss -lnup | grep -E '1812|1813'
   ```

### "OTP valida mas guest fica offline"

- Verificar release_status em wifi_sessions:
  ```sql
  SELECT release_status, sonicwall_raw FROM wifi_sessions
   WHERE phone_e164='+55...' ORDER BY auth_at DESC LIMIT 1;
  ```
- Se `degraded`: CoA falhou 3x. Investigar o firewall — porta 3799 acessível a partir da VPS? Firewall realmente aceita CoA?
- Se `active`: MAB não está achando a chave. Chegar ao Redis:
  ```bash
  docker exec infra-redis-1 redis-cli \
      --scan --pattern 'radius:authorized:<tenant-id>:*'
  ```

### "Accounting não aparece no DB"

- Verificar `radius_accounting_rate_limited` no log — flood do firewall está sendo bloqueado.
- Verificar que `radius_acct_port` está aberto no firewall de borda da VPS.
- `radius_accounting_bad_secret` indica que o secret do accounting server no firewall difere do auth.

---

## 6. Serial-guard em tenants RADIUS

A validação de serial **continua ativa** pra todas as rotas HTTP do portal (request-otp, verify-otp, branding). O fluxo do OTP passa pelo captive portal HTTP antes de tocar RADIUS, então o firewall precisa continuar mandando o serial via `?serial=XYZ` no redirect inicial.

**Observação:** o RADIUS em si (UDP/1812, 1813) **não** valida serial — é autenticado apenas por shared_secret. Isso é intencional: alguns firewalls não têm como expor o serial via RADIUS attribute e queremos multi-vendor de fato.

Impacto de segurança: o shared_secret é a credencial forte do RADIUS. Se vazar, qualquer atacante com rota até a VPS pode fazer MAB (e ainda assim precisa do MAC já estar no Redis). Gerar com `openssl rand -base64 32` e não reusar entre tenants.

---

## 7. Operações comuns

### Rotacionar shared_secret

```bash
# Admin UI → editar tenant → novo secret → salvar
# (container é reprovisionado automaticamente, ~10s de downtime)
# Depois: atualizar secret no firewall do cliente
```

### Revogar sessão ativa (forçar re-OTP)

```bash
docker exec infra-redis-1 redis-cli \
    DEL 'radius:authorized:<tenant-id>:<mac-sem-separador>'

# Próximo re-MAB do firewall vai Reject → walled-garden → novo OTP
```

Implementação futura (v2): botão "Disconnect" no painel admin que dispara CoA sem depender de re-MAB automático.

### Aumentar range de portas UDP

Se 18120-18219 (100 slots) esgotar, editar:
- `apps/admin-backend/src/routes/tenants.ts` — constantes `RADIUS_PORT_MIN/MAX`
- `infra/postgres/migrations/014_add_radius_ports.sql` — CHECK constraint do range

Limite prático: depende das portas livres na VPS. Evitar colidir com outros serviços.
