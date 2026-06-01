#!/usr/bin/env bash
#
# deploy.sh — Deploy padronizado do Captive Portal no VPS.
#
# Substitui a sequência manual de SSH + docker compose. Idempotente.
# Acesso ao VPS via alias SSH 'captive-vps' (configurado em ~/.ssh/config, com chave —
# SEM senha em texto). Ver docs/workflow-claude.md.
#
# Uso:
#   bash infra/deploy.sh                      # rebuild + recreate dos serviços de app
#   bash infra/deploy.sh admin-backend        # apenas serviços específicos
#
set -euo pipefail

SSH_HOST="${CAPTIVE_VPS:-captive-vps}"
REMOTE_DIR="${CAPTIVE_REMOTE_DIR:-/opt/captive-portal}"
BRANCH="${CAPTIVE_BRANCH:-develop}"

# Serviços de app por padrão (não mexe em postgres/redis/nginx sem necessidade).
DEFAULT_SERVICES="admin-backend admin-frontend portal-frontend portal-cliente-exemplo provisioner"
SERVICES="${*:-$DEFAULT_SERVICES}"

echo "▶ Deploy em ${SSH_HOST}:${REMOTE_DIR} (branch ${BRANCH})"
echo "▶ Serviços: ${SERVICES}"

ssh "$SSH_HOST" bash -seu <<REMOTE
  set -euo pipefail
  cd "${REMOTE_DIR}"

  echo "── 1/4 git pull origin ${BRANCH}"
  git pull origin "${BRANCH}"

  cd infra
  echo "── 2/4 docker compose build"
  docker compose build ${SERVICES}

  echo "── 3/4 docker compose up -d --force-recreate"
  docker compose up -d --force-recreate ${SERVICES}

  echo "── 4/4 health-check"
  sleep 3
  docker compose ps ${SERVICES}
REMOTE

echo "✅ Deploy concluído. Valide com: /tenant-status  e  /logs <serviço>"
