# Spec — Autenticação via RADIUS + OTP (multi-vendor)

> **Status:** proposta para revisão do time
> **Autor:** Carlos (Dev 2) — com input do Claude
> **Branch:** `docs/spec-radius-auth`
> **Data:** 2026-04-22
> **Prazo de implementação:** 4 dias úteis após aprovação

---

## 1. Motivação

Hoje o portal depende de integrações proprietárias por fabricante:

- **SonicWall REST** — stub de sucesso (API não expõe liberação por guest). Só serve pra dev/demo.
- **SonicWall LHM** — funciona em produção mas exige o navegador do cliente alcançar a porta de management do firewall (não passa pela VPS). Quebra em redes NAT'adas, roteadores que bloqueiam LAN-to-LAN e em qualquer cenário onde o SSID não enxerga o gateway diretamente.

**Problema prático visto em produção (IP `168.181.151.214`, cliente 4Edge):**
o navegador do usuário retorna `Failed to fetch` ao tentar falar com o SonicWall depois do OTP — exatamente o cenário que o LHM não resolve sozinho.

**Proposta:** adicionar um **terceiro modo** de liberação que independe do fabricante — **RADIUS + MAB + CoA** — e deixar a escolha ser feita por tenant, no momento do cadastro.

---

## 2. Por que RADIUS resolve

| Ganho | Detalhe |
|-------|---------|
| Multi-vendor | SonicWall, Mikrotik, Unifi, Meraki, Aruba, Cisco, pfSense — todos falam RADIUS. Um protocolo, um código. |
| Controle centralizado | O firewall delega toda a decisão (accept/reject, tempo de sessão, VLAN) pra VPS. |
| Funciona atrás de NAT | O firewall é quem fala com a VPS via UDP/1812. O cliente nunca precisa alcançar o firewall. |
| Auditoria completa | Accounting (RFC 2866) entrega start/stop/interim com bytes trafegados — relatório grátis. |
| Desconexão remota | CoA/Disconnect (RFC 5176) permite expirar sessão a qualquer momento pelo painel admin. |

---

## 3. Arquitetura proposta

### 3.1 Fluxo de autenticação

```
┌─────────┐   1. associa     ┌──────────┐   2. MAB RADIUS     ┌─────────────────────┐
│ Cliente │ ────────────────▶│ Firewall │ ───────────────────▶│ portal-tenant-X     │
│ (Wi-Fi) │                  │  / AP    │   Access-Request    │ (RADIUS listener    │
└─────────┘                  └──────────┘   user=MAC          │  UDP 1812)          │
     ▲                            │                           └──────┬──────────────┘
     │                            │                                  │
     │  4. walled garden          │                                  │ 3. MAC já
     │     libera HTTPS do        │                                  │    autorizado?
     │     portal captivo         │                                  │
     │                            │         ┌────────────┐           │
     │                            └────────▶│ Access-    │◀──────────┘ não → Access-Reject
     │                                      │ Accept /   │                (MAB falhou)
     │                                      │ Reject     │
     │                                      └────────────┘
     │
     │  5. usuário abre browser → redirect pra portal HTTPS da VPS
     │  6. pede OTP → digita código → backend valida
     │
     │  7. backend grava MAC+IP como "autorizado" no Redis (TTL = sessão)
     │  8. backend dispara CoA-Request pro firewall:
     │     Disconnect + re-MAB  →  firewall manda novo Access-Request
     │                                   │
     │                                   ▼
     │                     agora MAB retorna Access-Accept
     │                     + Session-Timeout (ex: 4h)
     │                     + (opcional) VLAN de acesso full
     │
     └── 9. cliente online, firewall começa a mandar Accounting-Request
             (start/interim/stop) → portal grava em wifi_sessions
```

### 3.2 Componentes novos

```
apps/backend/src/
├── services/
│   ├── radius/
│   │   ├── index.ts        ← Strategy: lê RADIUS_ENABLED, expõe start() / stop() / sendCoA()
│   │   ├── listener.ts     ← UDP/1812 (auth) e UDP/1813 (accounting)
│   │   ├── packet.ts       ← encode/decode RFC 2865 (Access-Req/Accept/Reject, attrs)
│   │   ├── coa.ts          ← cliente CoA/Disconnect (RFC 5176, UDP/3799)
│   │   └── mab.ts          ← lógica de consulta ao Redis pra decidir Accept/Reject
│   └── sonicwall/          (inalterado — REST e LHM continuam disponíveis)
├── plugins/
│   └── radius-start.ts     ← plugin Fastify que sobe o listener RADIUS no boot
└── config.ts               ← adiciona RADIUS_* nas envs
```

### 3.3 Mudanças no schema do banco

```sql
-- migration 012_add_radius_auth.sql

-- modo de autenticação por tenant
ALTER TABLE tenants
    ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'sonicwall'
        CHECK (auth_mode IN ('sonicwall', 'radius'));

-- config RADIUS (criptografado como sonicwall_config)
ALTER TABLE tenants
    ADD COLUMN radius_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenants.radius_config IS
    'shared_secret (criptografado), coa_port (default 3799), session_timeout_sec, nas_ip_allowlist';

-- auditoria RADIUS
CREATE TABLE radius_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    mac             TEXT NOT NULL,
    ip              TEXT,
    nas_ip          TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at      TIMESTAMPTZ,
    bytes_in        BIGINT,
    bytes_out       BIGINT,
    terminate_cause TEXT,
    UNIQUE (tenant_id, nas_ip, session_id)
);

CREATE INDEX radius_sessions_tenant_mac_idx ON radius_sessions (tenant_id, mac, started_at DESC);
```

### 3.4 Docker Compose

Cada container de tenant passa a expor **também** UDP/1812, 1813 e 3799, alocados dinamicamente pelo provisioner no range reservado `18120-18219` (100 slots, espelhando o range HTTP 29000-29099):

```yaml
portal-cliente-exemplo:
  # ... (inalterado)
  environment:
    # ... variáveis atuais
    RADIUS_ENABLED: "true"
    RADIUS_AUTH_PORT: 1812
    RADIUS_ACCT_PORT: 1813
    RADIUS_COA_PORT: 3799
    RADIUS_SHARED_SECRET: ${TENANT_EXEMPLO_RADIUS_SECRET}
  expose:
    - "3000"
    - "1812/udp"
    - "1813/udp"
  ports:
    - "18120:1812/udp"   # provisioner aloca
    - "18121:1813/udp"
```

---

## 4. Decisões arquiteturais pendentes (precisam de validação do time)

| # | Decisão | Opções | Recomendação |
|---|---------|--------|--------------|
| D1 | **Como manter a sessão viva** | (a) CoA com Session-Timeout fixo + re-auth periódico; (b) Session-Timeout + Termination-Action=RADIUS-Request; (c) apenas Session-Timeout sem CoA | **(b)** — padrão da indústria, não precisa CoA em loop |
| D2 | **Walled garden** | (a) responsabilidade do operador configurar no firewall; (b) geramos config exportável no painel | **(a)** no MVP, (b) na v2 |
| D3 | **Alocação de porta UDP** | (a) uma porta UDP por tenant (scalable mas consome); (b) RADIUS único compartilhado que roteia por NAS-IP | **(a)** — mantém isolamento por container, consistente com a arquitetura atual |
| D4 | **Biblioteca** | (a) pacote npm `radius` + socket UDP nativo; (b) FreeRADIUS como sidecar com SQL module | **(a)** — evita container extra, mantém tudo em Node/TS, código auditável no monorepo |

---

## 5. Impacto nos fluxos existentes

### 5.1 O que NÃO muda
- Portal frontend (tela de OTP é a mesma para ambos os modos)
- Integração Zenvia
- Tabelas `wifi_sessions`, `auth_attempts`, `audit_logs`
- Serial-guard (continua protegendo rotas HTTP; RADIUS tem seu próprio shared secret)
- REST/LHM continuam disponíveis como modos alternativos

### 5.2 O que muda
- `verify-otp.ts` precisa, quando `auth_mode=radius`, gravar `{tenant, mac, ip, expires_at}` no Redis E disparar CoA
- Admin pode criar tenants "tipo RADIUS" sem precisar de host/user/pass do SonicWall
- Provisioner aloca porta UDP além da HTTP
- Nginx fica inalterado (RADIUS é UDP direto, não passa pelo Nginx)

---

## 6. Divisão de tarefas — 4 dias

### Legenda

- **Dev 1 (Backend + Infra):** Claudio
- **Dev 2 (Frontend + Admin UX):** Carlos
- **[S]** start — depende só do que já está no repo
- **[D:XX]** depende da task XX

### Visão geral

```
                  Dia 1                Dia 2                Dia 3                Dia 4
Dev 1 (BE)   B9 schema+config   B10 listener+mab   B11 coa+accounting   B13 provisioner+deploy
                                                      B12 integração c/ OTP
Dev 2 (FE)   F9 tipos+form UX   F10 tenant modal    F11 validação+UX      F12 teste e2e + docs
                                                      admin → radius tab
```

---

## 7. Trilha Dev 1 — Backend + Infra

### B9 — Schema, config e Strategy base [S]
**Branch:** `feat/task-b9-radius-schema`
**Dia:** 1
**Entrega:** migration aplicada + `services/radius/index.ts` com stub que responde a start()/stop()

Tarefas:
- Criar migration `012_add_radius_auth.sql` conforme seção 3.3
- Adicionar `auth_mode` e `radius_config` no DTO `Tenant` em `packages/shared`
- Criptografar `radius_config.shared_secret` no admin-backend (usar `services/crypto.ts` existente)
- Adicionar envs `RADIUS_ENABLED`, `RADIUS_AUTH_PORT`, `RADIUS_ACCT_PORT`, `RADIUS_COA_PORT`, `RADIUS_SHARED_SECRET` em `apps/backend/src/config.ts`
- Criar `services/radius/index.ts` exportando `start(fastify)`, `stop()`, `sendCoA(session)`, com noop quando `RADIUS_ENABLED=false`
- Atualizar `.env.example` com bloco RADIUS comentado

Critério de aceite: `npm run migrate` aplica sem erro; tenant existente continua funcionando com `auth_mode='sonicwall'`.

---

### B10 — Listener RADIUS (Auth) + MAB [D:B9]
**Branch:** `feat/task-b10-radius-listener`
**Dia:** 2
**Entrega:** container responde Access-Accept/Reject baseado em Redis

Tarefas:
- Instalar dep `radius` (npm) — encode/decode RFC 2865
- Implementar `services/radius/listener.ts` — socket UDP dgram na porta `RADIUS_AUTH_PORT`
- Implementar `services/radius/mab.ts` — consulta chave Redis `radius:authorized:<tenant>:<mac>`; TTL define tempo de sessão
- Validar shared secret em cada pacote (comparar Message-Authenticator)
- Adicionar atributos na resposta: `Session-Timeout`, `Termination-Action=RADIUS-Request`, `Idle-Timeout`
- Plugin `plugins/radius-start.ts` sobe o listener no boot quando `RADIUS_ENABLED=true`
- Logs estruturados: `radius_accept`, `radius_reject`, `radius_bad_secret` (NUNCA logar o secret)

Critério de aceite: enviar Access-Request manualmente via `radclient` retorna Accept se MAC está no Redis; Reject caso contrário.

---

### B11 — CoA/Disconnect + Accounting [D:B10]
**Branch:** `feat/task-b11-radius-coa-acct`
**Dia:** 3 (manhã)
**Entrega:** CoA funcional + accounting gravado em `radius_sessions`

Tarefas:
- Implementar `services/radius/coa.ts` — envia Disconnect-Request pro NAS na porta 3799
- Implementar listener UDP/1813 (accounting) — grava start/interim/stop na tabela `radius_sessions`
- Correlacionar com `wifi_sessions` por MAC+tenant pra ligar OTP → accounting
- Rate limit nos pacotes (proteger contra flood): max 50 req/s por NAS-IP

Critério de aceite: após OTP, CoA é disparado; accounting-start chega no backend e aparece na tabela.

---

### B12 — Integração com verify-otp [D:B11]
**Branch:** `feat/task-b12-radius-otp-hook`
**Dia:** 3 (tarde)
**Entrega:** quando tenant é RADIUS, o sucesso do OTP grava autorização + dispara CoA

Tarefas:
- Modificar `routes/verify-otp.ts`:
  - Se `tenant.auth_mode === 'radius'`: grava chave Redis `radius:authorized:<tenant>:<mac>` com TTL = session_timeout + dispara `sendCoA()`
  - Se `tenant.auth_mode === 'sonicwall'`: fluxo atual (rest/lhm) inalterado
- Garantir que `wifi_sessions` recebe o registro antes do CoA (caso CoA falhe, ainda temos a sessão registrada)
- Tratamento de erro: se `sendCoA` falhar 3x, marcar sessão com `status='degraded'` mas não bloquear usuário (firewall ainda vai re-MAB)

Critério de aceite: OTP em tenant RADIUS autoriza o MAC e força re-autenticação no firewall dentro de 5s.

---

### B13 — Provisioner + docker-compose + runbook [D:B12]
**Branch:** `feat/task-b13-radius-provisioner`
**Dia:** 4
**Entrega:** criar tenant RADIUS no painel sobe container com portas UDP alocadas

Tarefas:
- Atualizar `apps/provisioner` pra alocar porta UDP no range `18120-18219` além da HTTP
- Gerar template de docker-compose com blocos RADIUS conforme seção 3.4
- Adicionar healthcheck UDP simples (socket abre) no container
- Escrever `docs/runbook-radius.md`: como configurar RADIUS em SonicWall, Mikrotik, Unifi, pfSense (walled garden + NAS config)
- Smoke test em laboratório com Mikrotik hAP (equipamento que temos em casa)

Critério de aceite: criar tenant no painel → container sobe com portas UDP expostas → Mikrotik de teste consegue autenticar via MAB.

---

## 8. Trilha Dev 2 — Frontend + Admin UX

### F9 — Tipos compartilhados + seletor de modo [S]
**Branch:** `feat/task-f9-radius-types`
**Dia:** 1
**Entrega:** types em `packages/shared` + seletor `sonicwall | radius` no modal

Tarefas:
- Adicionar em `packages/shared/src/tenant.ts`:
  - `AuthMode = 'sonicwall' | 'radius'`
  - `RadiusConfig = { shared_secret, coa_port, session_timeout_sec, nas_ip_allowlist }`
  - Atualizar interface `Tenant` com `auth_mode` e `radius_config`
- Em `apps/admin/components/tenant-modal.tsx`:
  - Adicionar step inicial "Tipo de autenticação" (cards: SonicWall / RADIUS com descrição curta)
  - Esconder seção SonicWall quando modo = RADIUS
  - Estado do formulário precisa guardar `auth_mode`
- Não implementar ainda os campos RADIUS — só o seletor funcionando

Critério de aceite: trocar o modo no modal mostra/esconde o bloco SonicWall sem erro; state persiste ao editar.

---

### F10 — Formulário RADIUS completo [D:F9, D:B9]
**Branch:** `feat/task-f10-radius-form`
**Dia:** 2
**Entrega:** todos os campos RADIUS editáveis com validação

Tarefas:
- Criar `apps/admin/components/tenant-modal-radius.tsx` com campos:
  - `shared_secret` (input password + botão "gerar" que usa `crypto.getRandomValues` com 32 bytes base64)
  - `coa_port` (default 3799, range 1-65535)
  - `session_timeout_sec` (default 14400 = 4h, range 300-86400, input em HH:MM)
  - `nas_ip_allowlist` (array de IPs/CIDRs, UI com chips)
- Validação client-side (mensagens em pt-BR) antes de submeter
- Integrar com `POST /tenants` do admin-backend — enviar `auth_mode='radius'` + `radius_config`
- Exibir a porta UDP alocada (read-only) depois do tenant criado — útil pra configurar o firewall

Critério de aceite: criar um tenant RADIUS pelo painel e ver ele listado corretamente.

---

### F11 — UX de feedback + documentação inline [D:F10]
**Branch:** `feat/task-f11-radius-help`
**Dia:** 3
**Entrega:** painéis de ajuda com instruções por fabricante + status RADIUS em tempo real

Tarefas:
- Aba "Configurar firewall" no detalhe do tenant — mostra snippets prontos pra copiar:
  - Mikrotik (`/radius add`, walled garden via `/ip hotspot walled-garden`)
  - Unifi (passo a passo no controller)
  - SonicWall (auth policy + radius auth)
  - pfSense (FreeRADIUS client)
- Badge "RADIUS online / offline" no card do tenant (poll em `GET /tenants/:id/radius-status` — endpoint novo no admin-backend; Dev 1 expõe, Dev 2 consome)
- Tooltip no seletor explicando diferença entre modos (quando usar cada um)

Critério de aceite: operador consegue criar e configurar firewall RADIUS sem consultar o Dev 1.

---

### F12 — Teste e2e + docs operacionais [D:F11, D:B13]
**Branch:** `feat/task-f12-radius-e2e`
**Dia:** 4
**Entrega:** teste de fluxo completo + seção no `docs/F5-admin-tenants.md`

Tarefas:
- Adicionar bloco sobre RADIUS em `docs/F5-admin-tenants.md` (como criar, como configurar, como diagnosticar)
- Teste e2e (Playwright ou equivalente) cobrindo: login admin → criar tenant RADIUS → verificar badge online → editar secret → remover tenant
- Atualizar `apps/admin/README.md` com nova seção "Modos de autenticação"
- Validar juntos com Dev 1 no Mikrotik de teste

Critério de aceite: um dev que nunca viu o sistema consegue criar e operar um tenant RADIUS só com a documentação.

---

## 9. Pontos de integração Dev 1 ↔ Dev 2

| Quando | Quem entrega | Pra quem | O quê |
|--------|--------------|----------|-------|
| Final dia 1 | Dev 1 (B9) | Dev 2 (F10) | DTOs atualizados em `packages/shared` |
| Final dia 2 | Dev 1 (B10) | Dev 2 (F10) | `POST /tenants` aceita `auth_mode=radius` |
| Final dia 3 | Dev 1 (B12) | Dev 2 (F11) | Endpoint `GET /tenants/:id/radius-status` |
| Dia 4 | Os dois juntos | — | Smoke test em lab + revisão dos docs |

Reuniões sugeridas:
- **Diária às 9h30** (15 min) — bloqueios e handoffs
- **Sync de integração dia 2 às 16h** (30 min) — confirmar contrato DTO
- **Revisão dia 4 às 15h** (1h) — smoke test em equipamento real

---

## 10. Fora de escopo (v2)

- Autenticação por certificado (EAP-TLS)
- Integração com LDAP/AD (não faz sentido pra guest Wi-Fi)
- VLAN dinâmica (pode ser atributo na resposta, mas não está no MVP)
- CoA em lote pelo painel admin ("deslogar todos de um tenant")
- Painel de debug de pacotes RADIUS em tempo real

---

## 11. Riscos e mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Firewall do cliente bloqueia UDP/1812 saindo da VPS | Autenticação quebra silenciosamente | Health check no provisioner testa socket antes de dar "tenant ok" |
| Shared secret vaza em log | Alto (auth comprometida) | Never-log no logger; secret só descriptografado em memória no boot |
| Biblioteca `radius` npm tem bug | Médio | Avaliar no dia 2; fallback é `node-radius-server`. Prazo permite troca. |
| Mikrotik de teste indisponível | Bloqueia B13/F12 | Dev 1 valida com docker-based pfSense se hardware falhar |

---

## 12. Próximos passos imediatos (após aprovação)

1. Time revisa este doc e valida as 4 decisões da seção 4
2. Abrir PR deste branch pra `develop` com tag `[DOCS]` — merge só depois de aprovado verbalmente
3. Dev 1 inicia B9 + Dev 2 inicia F9 em paralelo
4. Daily às 9h30 durante os 4 dias

**Total:** 8 tasks, 4 dias, 2 devs trabalhando em paralelo com 3 pontos de handoff claros.
