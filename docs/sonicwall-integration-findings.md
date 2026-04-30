# SonicWall TZ 370 / SonicOS 7.3.2 — Achados de integração

> Documento de campo consolidando o que aprendemos tentando integrar o
> portal captivo com SonicWall TZ 370 rodando SonicOS 7.3.2-7010.
> Atualizar à medida que novas tentativas/diagnósticos forem feitos.

**Data inicial:** 2026-04-30
**Hardware testado:** SonicWall TZ 370 (TZ370) — Firmware **SonicOS 7.3.2-7010**
**APs:** SonicWave (gerenciados pelo TZ via VAP Profile)
**Tenant de teste:** `INFORMO-RADIUS` — porta 29003 — `auth_mode=radius`

---

## TL;DR

- **RADIUS+MAB+CoA não é viável nesse hardware.** O SonicWave não tem fallback
  "MAB-Reject → Captive Portal redirect" que APs enterprise (Cisco/Aruba) têm.
  Quando o RADIUS responde Access-Reject, o AP **bloqueia a associação inteira**
  — cliente não chega a abrir browser, captive portal nunca aparece.
- **LHM clássico** (`externalGuestLogin.cgi`) foi descontinuado/alterado no
  SonicOS 7.3.2. Tentativa anterior (PRs #17, #19 + 24 commits `fix(lhm): …`)
  ficou em WIP — última estratégia era POST do browser do cliente, que esbarra
  em CORS/preflight quando o gateway local responde com cert self-signed.
- **Status atual (2026-04-30):** o fluxo OTP funciona até "Acesso autorizado",
  mas a **liberação no firewall não acontece**. Cliente vê tela de sucesso e
  permanece sem internet.

---

## O que validamos que FUNCIONA

| Etapa | Status |
|---|---|
| SonicWall enviar redirect pro nosso portal | ✅ funciona |
| Captive Portal Authentication na zona WGUEST | ✅ funciona |
| Backend serial-guard aceitar o param `UFI` (alias do serial no 7.x) | ✅ PR #47 |
| Frontend reconhecer params `userMAC`, `userIP`, `UFI` (case-insensitive) | ✅ PR #48 |
| RADIUS server responder Access-Reject ao probe `status-check` do SonicWall | ✅ PR #45 |
| OTP via Zenvia (SMS) | ✅ funciona |
| Verify-OTP no backend | ✅ retorna sucesso |

---

## O que NÃO funciona (e por quê)

### 1. RADIUS+MAB+CoA pelo SonicWave

**Setup tentado:**
- VAP "Portal Captive" → `Advanced` → `REMOTE MAC ADDRESS ACCESS CONTROL SETTINGS`
- ✅ Enable Remote MAC Access Control
- RADIUS Server 1: `45.7.53.80:18120` + shared secret do tenant
- RADIUS Accounting Server 1: `45.7.53.80:18121` + shared secret
- NAS Identifier Type: Access Point MAC Address
- (Server 2 obrigatório no SonicOS — preenchido com mesmos valores do Server 1)

**Resultado:**
- `tcpdump` na VPS nas portas 18120/18121 — **zero pacotes** Access-Request reais
  (>50 bytes) chegando, em múltiplas tentativas
- Cliente Wi-Fi para de associar no SSID — fica em "Salva / Sem acesso à
  Internet / Conexão automática desativada"
- Logs do container `portal-informo-radius-29003` não mostram nenhum
  `radius_accept` / `radius_reject` correlacionado a tentativa real de cliente

**Causa raiz:**
- SonicWave (consumer-grade) não foi projetado pra fluxo "MAB-Reject como
  trigger pro Captive Portal". Quando RADIUS responde Reject, o AP simplesmente
  **nega a associação** — não cai no fallback de captive portal.
- Mesmo se MAB funcionasse, o **CoA-Disconnect** dependeria de uma sessão
  registrada no firewall (User-Name=MAC), que só existe se o MAB tiver
  acontecido com sucesso antes — quebra de design circular.

**Evidências:**
- `apps/backend/src/services/radius/listener.ts` — handler MAB
- `apps/backend/src/services/radius/release.ts` — log
  `radius_coa_skipped_no_nas_ip` quando não há Access-Request prévio
- Logs reais do container (sessão de 2026-04-30):
  ```
  "msg":"radius_coa_skipped_no_nas_ip"
  "releaseStatus":"degraded"
  ```

### 2. LHM (External Guest Authentication)

**Histórico:** 24 commits `fix(lhm): …` em PRs #17 e #19 + WIP `4c5d8e7`.

**Sintoma observado em produção:**
> Após o usuário digitar o OTP correto e a tela de "acesso autorizado"
> aparecer, o navegador é redirecionado de volta pra tela inicial (input
> de nome+telefone) — entrando em **loop infinito**. O usuário nunca
> chega a navegar.

**Causa raiz (descoberta via referência oficial SonicWall):**

O código atual em [`apps/backend/src/services/sonicwall/lhm.ts`](../apps/backend/src/services/sonicwall/lhm.ts)
monta a URL de autorização no formato antigo:

```
${mgmtBaseUrl}externalGuestLogin.cgi?sessId=...&userName=...
```

Esse CGI **foi descontinuado no SonicOS 7.3.2**. O endpoint atual é REST
e exige POST com body JSON, conforme `docs/guestLHMLogin.php` enviado
pelo suporte SonicWall:

```
POST ${mgmtBaseUrl}/lhmapi/externalAAAGuest
Content-Type: application/json

{
  "info": {
    "action": 1,
    "sessId": "<sessionId do redirect inicial>",
    "userName": "<MAC ou username>",
    "sessionLifetime": 7200,
    "idleTimeout": 300,
    "maxRx": 0, "maxTx": 0,
    "quotaCycleType": 0,
    "cycleSessionLifeTime": 7200,
    "cycleMaxRx": 0, "cycleMaxTx": 0,
    "hmac": "<sha256 opcional, ver phase2 abaixo>"
  }
}
```

Resposta de sucesso: `{"code": "50"}`. Qualquer outro código → falha
silenciosa: navegador volta a hit do captive portal → redirect pra
home → **loop**.

**HMAC (opcional, ativo se firewall configurado com shared key):**

- Algoritmo: `sha256`
- Key: shared secret configurado em `Network → Wireless → Guest Services →
  Authentication Settings → HMAC Key`
- **Phase 1** (validação do `?hmac=` que o firewall manda no redirect inicial):
  ```
  text = ssid + sessionId + ip + mac + ufi + mgmtBaseUrl + clientRedirectUrl + reqEncoded
  hmac = HMAC-SHA256(key, text)
  ```
  onde `reqEncoded` aplica o duplo-encode específico
  (`%`→`%25`, depois `:`→`%3A`, ` `→`%20`, `?`→`%3F`, `+`→`%2B`,
  `&`→`%26`, `=`→`%3D`).
- **Phase 2** (HMAC do POST que o nosso server envia):
  ```
  text = sessionId + urlencode(userName) + sessionLifetime + idleTimeout
       + maxRx + maxTx + quotaCycleType + cycleSessionLifeTime
       + cycleMaxRx + cycleMaxTx
  hmac = HMAC-SHA256(key, text)
  ```

**Tentativas anteriores que NÃO resolveram (e por quê):**

1. **POST backend-side direto** pro CGI antigo — endpoint não existe mais no 7.3.2
2. **Tentativa no endpoint REST `lhmapi/externalGuest`** (sem `AAA`) — nome
   incorreto. O correto é `lhmapi/externalAAAGuest`
3. **Browser-side POST** do navegador do cliente — esbarra em CORS preflight
   porque `Content-Type: application/json` é "non-simple", e o firewall
   responde com cert self-signed que browsers móveis bloqueiam por padrão
4. **Bypass de CORS** com `no-cors fetch + text/plain` carregando JSON,
   top-level form POST, fire-and-forget — chamadas chegam mas não conseguem
   ler a resposta `{"code": "50"}`, e o body com `text/plain` provavelmente
   é rejeitado pelo firewall que espera `application/json` exato
5. **Último estado:** snapshot WIP `4c5d8e7`, branch `fix/lhm-debug-log`

**Material de referência oficial recém-recebido (2026-04-30):**
- `docs/REST API for External Guest Authentication.pdf` — doc oficial da SonicWall
- `docs/guestLHMLogin.php` — exemplo funcional que mostra exatamente o protocolo correto
- `docs/guestLHMLogout.php`, `docs/guestLHMUpdateSess.php`, `docs/createGuestAccount.php`

**Caminho recomendado pra retomar:**

1. Reescrever `apps/backend/src/services/sonicwall/lhm.ts` pra:
   - Usar endpoint `${mgmtBaseUrl}/lhmapi/externalAAAGuest`
   - Montar body JSON com wrapper `{"info": {...}}`
   - Suportar HMAC opcional (Phase 1 + Phase 2)
2. **Importante:** se a VPS continuar **sem rota direta** pro firewall na LAN,
   o POST tem que sair do navegador. Pra esse caminho:
   - Tentar `Content-Type: application/x-www-form-urlencoded` com body como
     campo `payload=<json>` (CORS simple request, sem preflight)
   - **OU** servir uma página HTML que faz `fetch` de mesmo origin (HTTPS
     captive portal contra HTTP/HTTPS firewall) — depende de browser
   - **OU** o usuário aceitar o cert self-signed do firewall numa página
     intermediária antes do POST
3. Se a VPS tiver rota pro firewall (VPN site-to-site, peering), o caminho
   ideal é POST backend-side (igual o PHP de referência) — sem mexer no browser.

**Arquivos relevantes:**
- `apps/backend/src/services/sonicwall/lhm.ts`
- `apps/frontend/lib/lhm-params.ts`
- `docs/lhm-protocol-tz570.md` (spec do protocolo — desatualizada, precisa de revisão à luz do PDF oficial)
- `docs/guestLHMLogin.php` ⭐ (referência canônica)
- `docs/REST API for External Guest Authentication.pdf` ⭐ (doc oficial)

---

## Caminhos possíveis daqui

### A. ⭐ Retomar LHM com endpoint correto (recomendado)

Agora que temos o protocolo oficial confirmado via `guestLHMLogin.php`,
reescrever `lhm.ts` pra:

- Endpoint: `${mgmtBaseUrl}/lhmapi/externalAAAGuest`
- POST JSON `{"info": {action: 1, sessId, userName, sessionLifetime, ...}}`
- HMAC SHA256 nas duas fases (se firewall configurado)
- Tratar resposta `{"code": "50"}` = sucesso

Sub-questão pendente: o POST sai do **backend** (precisa rota pro firewall
LAN — VPN site-to-site) ou do **navegador do cliente** (sem rota da VPS,
mas esbarra em CORS+cert self-signed)? **Validar conforme topologia real
de cada cliente.**

A solução do PHP oficial usa POST backend-side. Se replicarmos isso,
precisamos de túnel VPN/wireguard entre VPS e a LAN do firewall — ou
hospedar uma instância do backend na LAN do cliente (modo on-prem).

### B. SonicOS REST API com auth-aware bypass de captive portal

Em vez de LHM, usar a REST API do firewall (`/api/sonicos/...`) pra adicionar
o MAC do cliente em uma tabela de **MAC Address Object Group** que é
**Pass Networks** da zona WGUEST. Efeito: o MAC autorizado para de cair no
captive portal e navega direto.

- ✅ REST API existe e é estável no 7.3.2
- ⚠️ Precisa credencial admin do firewall salva no backend (já existe campo no tenant)
- ⚠️ Não é instantâneo — pode haver delay de propagação
- ⚠️ Requer regra de Access Rule WGUEST→WAN pré-configurada referenciando o
  Address Group

### C. Mudar o hardware Wi-Fi do cliente

Se o roadmap aceita, usar AP enterprise (Unifi/Mikrotik) que tem suporte real
a MAB+CaptivePortal+CoA. Aí o `auth_mode=radius` funciona como projetado e
o SonicWall fica só fazendo NAT/firewall.

- ✅ Arquitetura RADIUS+CoA do projeto funciona como spec
- ❌ Custo (cliente já comprou SonicWall)
- ❌ Reorganização da topologia

### D. Manter LHM com workaround do navegador

Forçar o usuário a aceitar o cert self-signed do firewall ANTES do POST LHM,
servindo uma página intermediária `https://gateway.local/aceitar-cert` ou
similar.

- ⚠️ UX ruim (usuário tem que clicar "aceitar risco")
- ⚠️ Pode falhar em iOS/Android dependendo da política de cert

---

## Configuração final de rede / portas (resumo)

| Componente | Detalhe |
|---|---|
| VPS pública | `45.7.53.80` (DNAT) / `45.7.53.75` (saída) |
| Provedor | NAT 1:1 + SNAT na entrada (IP origem rewrite pra `172.16.10.167`) |
| Container RADIUS auth | UDP `18120` (mapeado ↔ container :1812) |
| Container RADIUS acct | UDP `18121` (mapeado ↔ container :1813) |
| LB healthcheck | Pacotes UDP de 1 byte na 18120/18121/18122 — barulho conhecido |
| SonicWall TZ 370 | LAN privada do cliente — IP público variável |

---

## PRs e commits relevantes (linha do tempo 2026-04-29 → 2026-04-30)

| PR | Commit | O que corrigiu |
|---|---|---|
| #45 | `11ba2b7` | RADIUS responde Access-Reject ao probe `status-check` (servidor sai de DOWN no SonicWall) |
| #46 | `4ace555` | Listagem de tenants retorna `auth_mode` (modal admin abre como RADIUS) |
| #47 | `860ffa1` | Backend serial-guard aceita `?UFI=` |
| #48 | `c508a40` | Frontend reconhece `UFI`/`userMAC`/`userIP` |
| — | `radius_coa_skipped_no_nas_ip` | (não-PR) constatado em produção, motivo do "degraded" no verify-otp |

---

## RADIUS funciona em outros vendors?

**Sim — o problema é específico do SonicWave.** A arquitetura
RADIUS+MAB+CoA do projeto (validada na spec `docs/spec-radius-auth.md`)
funciona em controladoras/APs enterprise que implementam o ciclo
"MAB-Reject → Captive Portal redirect → CoA-Disconnect → re-MAB → Accept":

| Vendor | Suporte | Recurso correspondente |
|---|---|---|
| **Mikrotik** (CHR/RouterOS) | ✅ | `walled garden` + `radius` + `coa` |
| **Ubiquiti UniFi** | ✅ | "Pre-shared / RADIUS MAC Auth" + Captive Portal externo |
| **pfSense / OPNsense** | ✅ | Captive portal com RADIUS + Disconnect-Request |
| **Cisco ISE / WLC** | ✅ | MAB nativo, padrão de mercado |
| **Aruba ClearPass + Instant** | ✅ | Suporte completo a CoA dinâmico |
| **SonicWall + SonicWave (TZ 370 / 7.3.2)** | ❌ | AP rejeita associação no Reject |

Em outras palavras: **a stack do projeto está correta** — só não casa
com esse hardware específico. Para clientes com SonicWall, **LHM é o
caminho oficial** (e era o que o projeto fazia originalmente).

## Próximos passos sugeridos

1. **Curto prazo:** desligar `Remote MAC Access Control` no VAP pra Wi-Fi voltar
   ao estado funcional (OTP + tela de sucesso, sem release).
2. **Decisão arquitetural:** time decide entre A/B/C/D acima.
3. **Documentar follow-up:** atualizar este arquivo conforme avançam testes.
