# Protocolo de trabalho com o Claude Code

> Inspirado no setup do criador do Claude Code (Boris Cherny): **plan mode primeiro,
> slash commands para o loop interno, guardrails determinísticos via hooks.**
> Toda task entra e sai pelo MESMO funil. Sem exceção.

## Os 7 passos (sempre nesta ordem)

1. **ENTENDER** — Comece em **plan mode** (`Shift+Tab` 2x). Leia a spec relevante
   (`docs/spec-auth-api.md` ou `docs/spec-admin-api.md`) **antes** de codar. Se a task
   é nova e não está na spec, escreva o contrato em `docs/` e commite o doc primeiro.
2. **PLANEJAR** — Refine o plano com o Claude até concordar. Se mexe em rota/contrato,
   rode **`/spec-check`**. Só então saia do plan mode (auto-accept edits).
3. **RAMIFICAR** — `git checkout develop && git pull` → `git checkout -b feat/task-XX`.
   Nunca trabalhe direto em `develop`/`main`.
4. **IMPLEMENTAR** — Mudanças pequenas; os hooks rodam `tsc`/eslint a cada edição.
   Commits pequenos e descritivos (`feat(task-XX): …`). **Nunca** `git add .`/`-A`,
   `--no-verify` ou `--force` (os hooks bloqueiam).
5. **VALIDAR** — `tsc --noEmit` + `vitest run` (+ `/spec-check` se tocou SonicWall).
   Suba local com `docker compose up` quando fizer sentido.
6. **PR** — `git push -u origin feat/task-XX` → `gh pr create --base develop` usando o
   template. O CI roda sozinho (lint + typecheck + test + build).
7. **DEPLOY** — Só após merge em `develop`: **`/deploy`** (chama `infra/deploy.sh`),
   depois **`/tenant-status`** + **`/logs`** para confirmar saúde. `develop`→`main` só
   quando tudo estiver verde.

> **Regra de ouro:** sem ENTENDER→PLANEJAR, não comece a codar. Sem VALIDAR, não abra
> PR. Sem PR+CI verde, não faça deploy.

## Slash commands disponíveis (`.claude/commands/`)

| Comando | O que faz |
|---------|-----------|
| `/spec-check` | Roda o subagent `spec-guard` comparando a mudança com as specs |
| `/deploy` | Deploy padronizado no VPS via `infra/deploy.sh` |
| `/tenant-status` | Lista tenants e status (via SSH `captive-vps`) |
| `/logs <serviço>` | Tail dos logs de um container no VPS |

## Guardrails automáticos (`.claude/hooks/`)

- **Antes de cada Bash:** bloqueia `git add .`/`-A`, `--no-verify`, `--force`, e commits
  que incluam `.env`.
- **Após cada edição:** roda `tsc --noEmit` no app afetado e devolve erros ao Claude.

## Acesso ao VPS

Via alias SSH com **chave** (sem senha em lugar nenhum). Configure uma vez em
`~/.ssh/config`:

```
Host captive-vps
    HostName 45.7.53.80
    Port 2121
    User localadmin
    IdentityFile ~/.ssh/captive_vps
```

Depois é só `ssh captive-vps "..."`. **Nunca** use `sshpass` nem cole senha em comandos
ou no `settings.json`.
