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

**Resumo das tentativas:**
1. POST backend-side direto pro `externalGuestLogin.cgi` — endpoint
   removido/alterado no 7.3.2
2. Tentativa no endpoint novo `lhmapi/externalGuest` (REST) — 7.3.2+
3. Browser-side POST do navegador do cliente (que está na LAN do firewall) —
   esbarra em CORS preflight quando o firewall responde com cert self-signed
4. Estratégias de bypass: top-level form POST, no-cors fetch com `text/plain`,
   fire-and-forget, shotgun em todos os candidatos
5. Último estado conhecido: WIP, antes de sync com develop

**O QUE TRAVOU — preencher quando confirmar com o time:**

> _(Pendente: o usuário vai detalhar qual foi o erro exato — CORS? endpoint
> 404? POST chega mas firewall ignora? Resposta vazia?)_

**Arquivos relevantes:**
- `apps/backend/src/services/sonicwall/lhm.ts`
- `apps/frontend/lib/lhm-params.ts`
- `docs/lhm-protocol-tz570.md` (spec do protocolo)

---

## Caminhos possíveis daqui

### A. Retomar LHM com diagnóstico fechado

Voltar pra branch da investigação LHM (`fix/lhm-debug-log` /
commits `c7f7eeb`, `3230736`, `50c99a5`), reproduzir o último cenário
contra o TZ 370 atual e capturar exatamente onde a chamada do navegador
falha. Possíveis trabalhos:

- Confirmar qual é o endpoint correto no 7.3.2 (CGI vs REST `lhmapi`)
- Se for CORS/cert: aceitar o cert self-signed do firewall no navegador antes,
  ou intermediar via página HTTP servida pelo próprio firewall
- Se for endpoint novo: ler resposta JSON e tratar adequadamente

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

## Próximos passos sugeridos

1. **Curto prazo:** desligar `Remote MAC Access Control` no VAP pra Wi-Fi voltar
   ao estado funcional (OTP + tela de sucesso, sem release).
2. **Decisão arquitetural:** time decide entre A/B/C/D acima.
3. **Documentar follow-up:** atualizar este arquivo conforme avançam testes.
