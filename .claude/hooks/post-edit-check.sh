#!/usr/bin/env bash
# PostToolUse(Edit|Write) — feedback loop curto (estilo Boris): roda eslint no arquivo
# editado quando o app tem eslint configurado (frontend/admin). Best-effort: se faltar
# eslint/node_modules, não faz nada. Erros de lint voltam ao Claude via exit 2.
set -uo pipefail

FILE="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"
[ -z "$FILE" ] && exit 0

# Só arquivos TS/TSX
case "$FILE" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Descobrir o app dono do arquivo (apenas os que têm eslint configurado)
APP=""
case "$FILE" in
  *"/apps/frontend/"*) APP="apps/frontend" ;;
  *"/apps/admin/"*)    APP="apps/admin" ;;
  *) exit 0 ;;  # backend/admin-backend não têm eslint — deixa pro CI/typecheck
esac

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT/$APP" 2>/dev/null || exit 0
[ -x "node_modules/.bin/eslint" ] || exit 0   # sem eslint instalado → no-op

OUT="$(node_modules/.bin/eslint "$FILE" 2>&1)" || {
  echo "⚠️ eslint apontou problemas em $FILE:" >&2
  echo "$OUT" >&2
  exit 2   # devolve ao Claude para corrigir
}
exit 0
