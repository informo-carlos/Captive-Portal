#!/usr/bin/env bash
# PreToolUse(Bash) — guardrail determinístico das "Regras que NUNCA devem ser quebradas".
# Bloqueia (exit 2) comandos perigosos antes de executarem. Lê o JSON do hook no stdin.
set -euo pipefail

RAW="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

# Remove o conteúdo entre aspas (mensagens de commit etc.) para não dar falso-positivo
# ao casar padrões que aparecem só dentro de uma string, ex.: git commit -m "... git add -A ...".
CMD="$(printf '%s' "$RAW" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"

block() { echo "🚫 BLOQUEADO pelo guard-bash: $1" >&2; exit 2; }

# 1) git add abrangente — risco de subir .env / arquivos sensíveis (regra do CLAUDE.md)
if echo "$CMD" | grep -Eq 'git[[:space:]]+add[[:space:]]+(-A|--all|\.[[:space:]]*$|\.[[:space:]])'; then
  block "use 'git add <arquivos específicos>', nunca 'git add .' / '-A' (CLAUDE.md)."
fi

# 2) bypass de hooks de commit
if echo "$CMD" | grep -Eq '(--no-verify|-n[[:space:]])' && echo "$CMD" | grep -Eq 'git[[:space:]]+(commit|push)'; then
  block "'--no-verify' é proibido (CLAUDE.md)."
fi

# 3) push forçado
if echo "$CMD" | grep -Eq 'git[[:space:]]+push' && echo "$CMD" | grep -Eq '(--force([^-]|$)|[[:space:]]-f([[:space:]]|$))'; then
  block "push forçado é proibido. Use rebase/merge normais (CLAUDE.md)."
fi

# 4) adicionar/commitar arquivos .env
if echo "$CMD" | grep -Eq 'git[[:space:]]+(add|commit)' && echo "$CMD" | grep -Eq '(^|[[:space:]/])\.env([.[:space:]]|$)'; then
  block "nunca versione arquivos .env (segredos)."
fi

# 5) senha em texto / sshpass (acesso ao VPS é via alias 'captive-vps' + chave)
if echo "$CMD" | grep -Eq 'sshpass'; then
  block "não use sshpass com senha. Use 'ssh captive-vps' (chave em ~/.ssh/config)."
fi

exit 0
