# apps/admin — Painel Admin UI

Next.js 14 (App Router) + Tailwind. Desktop-first, consumido por operadores
internos que cadastram tenants, acompanham sessões Wi-Fi e revisam logs.

> Contexto arquitetural completo: raiz do repo em [`CLAUDE.md`](../../CLAUDE.md).
> Spec dos endpoints consumidos: [`docs/spec-admin-api.md`](../../docs/spec-admin-api.md).

---

## Dev rápido

```bash
# Pré-requisito — infra base rodando:
cd ../../infra && docker compose up -d postgres redis

# Instalar deps e subir o dev server:
npm install
npm run dev
# → http://localhost:3000 (padrão Next)
```

Variável obrigatória — apontar pro admin-backend local:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Build de produção:

```bash
npm run build
npm start
```

---

## Estrutura

```
app/
├── login/page.tsx                  # Pública
└── (dashboard)/                    # Route group — protegido, exige JWT
    ├── layout.tsx                  # Sidebar + header + guarda de rota
    ├── dashboard/page.tsx          # Métricas + gráfico
    ├── builder/page.tsx            # Dashboard customizável + export PDF
    ├── tenants/page.tsx            # Listagem com filtros + modal criar/editar
    ├── tenants/[id]/page.tsx       # Detalhe + stats + badge RADIUS
    ├── sessions/page.tsx           # Tabela de sessões
    ├── users/page.tsx              # Superadmin only
    └── audit/page.tsx              # Superadmin only

components/
├── tenant-modal.tsx                # Criar/editar tenant — SonicWall OU RADIUS
├── tenant-firewall-help.tsx       # Snippets prontos pra Mikrotik/Unifi/SonicWall/pfSense
├── skeleton.tsx                    # Loading states
└── export-modal.tsx                # Export PDF/CSV do builder

lib/
├── api.ts                          # Wrapper sobre fetch, tipado, lida com erros da spec
├── auth-context.tsx                # useAuth() — { user, role, token, logout }
├── notification-context.tsx
└── theme-context.tsx               # Dark cyan
```

---

## Modos de autenticação

Todo tenant tem um `auth_mode` que define qual *Strategy* o container do
portal executa quando o guest digita o OTP. O campo é escolhido na
criação do tenant e **não pode ser editado depois** (mudar modo exige
recriar container + dealocar recursos — fluxo dedicado fica pra v2).

### Quando escolher cada um

| Modo | Quando usar |
|------|-------------|
| **SonicWall (padrão)** | Firewall do cliente é SonicWall e já usa o serviço de guest nativo (REST API ou LHM External Guest Auth) |
| **RADIUS** | Firewall do cliente **não é SonicWall** (Mikrotik, Unifi, pfSense, etc.) ou cliente exige RADIUS por política |

Regra prática: se o cliente tem SonicWall, usa SonicWall. Se tem qualquer
outra coisa com suporte RADIUS + CoA (RFC 5176), usa RADIUS.

### Modo SonicWall

Dois sub-modos dentro da aba **Configuração SonicWall** do modal:

- **REST** — a VPS chama diretamente a API REST do SonicWall para liberar
  o guest. Exige `host`, `user`, `password`, `firmware` (Gen 6 ou 7)
  configurados e rota de rede entre VPS e SonicWall. Todos os campos
  obrigatórios validados no backend (`validateModeRequirements`).
- **LHM (External Guest Authentication)** — o navegador do usuário fala
  com o SonicWall local usando o `mgmtBaseUrl` que o próprio SW injeta
  no redirect. A VPS nunca toca no SonicWall. Campos REST são opcionais.

Detalhes do protocolo LHM: [`docs/lhm-protocol-tz570.md`](../../docs/lhm-protocol-tz570.md).

### Modo RADIUS

Fluxo MAB (MAC Authentication Bypass) + CoA (RFC 5176 Disconnect):

1. Guest associa ao SSID → firewall envia Access-Request (UDP/1812) pro
   container do tenant.
2. Container responde Access-Reject (1ª vez) → guest cai no portal.
3. Guest preenche celular → OTP por SMS → digita no portal.
4. Container grava autorização efêmera no Redis + dispara CoA-Disconnect
   (UDP/3799) pro NAS.
5. Firewall reconecta o MAC → novo Access-Request → Access-Accept com
   Session-Timeout.
6. Firewall envia Accounting (UDP/1813) — start / interim / stop.

Detalhes operacionais (criar/configurar/diagnosticar): seção §9 de
[`docs/F5-admin-tenants.md`](../../docs/F5-admin-tenants.md#9-tenants-radius--guia-operacional).

Runbook (ops/range UDP, walled-garden, diagnóstico):
[`docs/runbook-radius.md`](../../docs/runbook-radius.md).

Spec técnica: [`docs/spec-radius-auth.md`](../../docs/spec-radius-auth.md).

### Como o frontend diferencia os modos

- `tenant.auth_mode` vem do GET e dita:
  - Qual card de configuração o detalhe renderiza (SonicWall vs RADIUS)
  - Se o card `TenantFirewallHelp` aparece (só em RADIUS)
  - Se o polling de `GET /admin/tenants/:id/radius-status` roda (só em
    RADIUS + `active`)
- O modal de criar/editar (`tenant-modal.tsx`) mostra seletor com tooltip
  explicativo. Ao escolher RADIUS, a seção SonicWall some e aparece a
  seção com `shared_secret`, `coa_port`, `session_timeout_sec`,
  `nas_ip_allowlist`.

---

## Roles

| Role | Pode |
|------|------|
| `superadmin` | Tudo + criar outros admins + ver audit log + deletar tenant |
| `admin` | Criar/editar/ativar/desativar tenants, ver sessões e relatórios |
| `viewer` | Só leitura |

Guarda de rota no [`(dashboard)/layout.tsx`](app/(dashboard)/layout.tsx):
redireciona pra `/login` se não autenticado. Páginas restritas (`/users`,
`/audit`) checam `role === 'superadmin'` no próprio componente.

Em qualquer resposta `401`, `lib/api.ts` limpa o token e redireciona
pro login.

---

## Testes

```bash
npm test            # unit tests (Vitest)
npm run test:watch  # modo watch
```

Testes cobrem os pontos críticos sem UI: validação de telefone,
derivação de estados da UI (badge RADIUS), formatação de mensagens de
erro. Não temos e2e — validação de fluxo completo é manual com hardware
real (Mikrotik hAP pro RADIUS, SonicWall TZ pro LHM).

---

## Contribuindo

Workflow de Git está descrito na raiz do repo — resumo:

1. Branch de `develop`: `feat/task-f{N}` pra feature, `fix/{desc}` pra bug.
2. Commits pequenos, prefixo `feat(task-fN):` / `fix(scope):`.
3. PR pra `develop`, nunca `main` direto.
4. `git add` por arquivo — nunca `git add .` ou `-A` (risco de .env).
