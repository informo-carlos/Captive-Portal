# TASKS — Captive Portal

> Fonte de verdade do **escopo MVP** (ver também `CLAUDE.md` › "Escopo").
> Workflow de cada task: siga `docs/workflow-claude.md`.

---

## ✅ MVP SonicWall — concluído

Backend, admin e frontends do caminho crítico estão implementados e rodando em `develop`:

- **B1–B2** — Infra (Docker Compose) + migrations do banco.
- **B3–B4** — Admin API: auth JWT, roles, CRUD de tenants (campos sensíveis em AES-256).
- **B5–B7** — Portal: `serial-guard`, fluxo OTP, Zenvia (SMS) e SonicWall
  (Strategy `rest` stub / `lhm` produção).
- **B8** — Sessões, relatórios e audit log.
- **F1–F7** — Portal UI (celular → OTP → sucesso/erro) e Admin UI (login, tenants,
  usuários, dashboard, sessões).

> Detalhes de implementação preservados em `docs/F1-setup-frontends.md` e
> `docs/F5-admin-tenants.md`.

---

## 🔧 Pendências do MVP (foco atual)

Lacunas reais de qualidade/operação — priorizadas:

- [ ] **T1 — Rede de segurança de testes.** Hoje há ~3 suites. Cobrir o caminho crítico:
  - `apps/backend` — fluxo OTP (`services/otp.ts`) e `plugins/serial-guard.ts`.
  - `apps/admin-backend` — CRUD de tenants (hoje **zero** testes).
- [ ] **T2 — CI (GitHub Actions).** `lint + tsc --noEmit + vitest + docker build` em PRs.
- [ ] **T3 — Deploy padronizado.** `infra/deploy.sh` + `/deploy` (substituir SSH manual).
- [ ] **T4 — Setup Claude Code de equipe.** `.claude/` versionado: slash commands,
  subagent `spec-guard`, hooks de guardrail. (Ver `docs/workflow-claude.md`.)

---

## 🚀 Futuro — fora do MVP

Código existe no repo, mas **não é caminho crítico**. Não começar por aqui sem decisão explícita.

- **RADIUS / MAB / CoA** — `docs/spec-radius-auth.md`, `docs/runbook-radius.md`.
- **VPN IPsec / strongSwan** — `apps/swan-api/`.
- **Multi-vendor** (FortiGate/UniFi/Mikrotik) — `docs/planejamento-multi-vendor.md`.
- Roadmap geral — `docs/planejamento-futuro.md`.
