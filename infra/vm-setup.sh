#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Captive Portal — Script de setup da VM de produção/staging
# Rodar como root ou com sudo em Ubuntu 22.04/24.04 LTS
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

echo "════════════════════════════════════════════════════════"
echo " Captive Portal — Setup da VM"
echo "════════════════════════════════════════════════════════"

# ─── 1. Atualização do sistema ───────────────────────────
echo "[1/8] Atualizando sistema..."
apt-get update -y && apt-get upgrade -y

# ─── 2. Pacotes essenciais ──────────────────────────────
echo "[2/8] Instalando pacotes base..."
apt-get install -y \
  curl \
  wget \
  git \
  unzip \
  htop \
  net-tools \
  ca-certificates \
  gnupg \
  lsb-release \
  ufw \
  fail2ban

# ─── 3. Docker + Docker Compose ─────────────────────────
echo "[3/8] Instalando Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "Docker instalado: $(docker --version)"
else
  echo "Docker já instalado: $(docker --version)"
fi

# Adiciona o usuário ao grupo docker (se não for root)
if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "Usuário $SUDO_USER adicionado ao grupo docker"
fi

# ─── 4. Node.js 20 LTS (para rodar migrations localmente) ─
echo "[4/8] Instalando Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "Node.js instalado: $(node --version)"
else
  echo "Node.js já instalado: $(node --version)"
fi

# ─── 5. GitHub CLI (para deploy via CI ou manual) ────────
echo "[5/8] Instalando GitHub CLI..."
if ! command -v gh &> /dev/null; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -y && apt-get install -y gh
  echo "gh instalado: $(gh --version | head -1)"
else
  echo "gh já instalado: $(gh --version | head -1)"
fi

# ─── 6. Firewall ────────────────────────────────────────
# Firewall gerenciado na camada da cloud (VPC/security groups).
# UFW desabilitado para evitar conflitos — especialmente com portas
# customizadas de SSH que podem causar lockout.
echo "[6/8] Firewall: gerenciado na camada da cloud."
ufw disable 2>/dev/null || true

# ─── 7. Diretórios do projeto ───────────────────────────
echo "[7/8] Criando estrutura de diretórios..."
APP_DIR="/opt/captive-portal"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/backups"

cat << 'BANNER'

════════════════════════════════════════════════════════
 Setup da VM concluído!
════════════════════════════════════════════════════════

BANNER

# ─── 8. Gerar .env de produção ──────────────────────────
echo "[8/8] Gerando .env de produção..."
ENV_FILE="$APP_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  echo "AVISO: $ENV_FILE já existe. Pulando geração."
  echo "       Edite manualmente se necessário."
else
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
  ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
  PG_PASS=$(openssl rand -base64 24 | tr -d '\n')
  REDIS_PASS=$(openssl rand -base64 24 | tr -d '\n')

  cat > "$ENV_FILE" << EOF
# ═══════════════════════════════════════════════════════
# Captive Portal — Variáveis de Produção
# Gerado em: $(date -Iseconds)
# ═══════════════════════════════════════════════════════

# ─── Banco de dados ────────────────────────────────────
POSTGRES_USER=captive
POSTGRES_PASSWORD=${PG_PASS}

# ─── Redis ─────────────────────────────────────────────
REDIS_PASSWORD=${REDIS_PASS}

# ─── Admin ─────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
# IMPORTANTE: trocar pelo IP real ou domínio da VM
ADMIN_API_URL=http://SEU-IP-AQUI:8000

# ─── Tenant: cliente exemplo (porta 29000) ─────────────
# Preencher após criar o tenant no painel admin
TENANT_EXEMPLO_ID=
TENANT_EXEMPLO_SERIALS=
TENANT_EXEMPLO_ZENVIA_TOKEN=
TENANT_EXEMPLO_SW_HOST=
TENANT_EXEMPLO_SW_USER=
TENANT_EXEMPLO_SW_PASS=
TENANT_EXEMPLO_SW_FIRMWARE=7
TENANT_EXEMPLO_SW_MODE=rest
TENANT_EXEMPLO_SW_LHM_PORT=4043
TENANT_EXEMPLO_SW_GUEST_SERVICE_USER=
TENANT_EXEMPLO_SW_GUEST_SERVICE_PASS=
EOF

  chmod 600 "$ENV_FILE"
  echo ".env gerado em $ENV_FILE (permissão 600)"
fi

# ─── Resumo ─────────────────────────────────────────────
cat << SUMMARY

┌─────────────────────────────────────────────────────────┐
│                    PRÓXIMOS PASSOS                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Clonar o repositório:                               │
│     cd /opt/captive-portal                              │
│     git clone <repo-url> .                              │
│                                                         │
│  2. Editar o .env com dados reais:                      │
│     nano /opt/captive-portal/.env                       │
│     - ADMIN_API_URL (IP real da VM)                     │
│     - Dados do SonicWall quando disponível              │
│     - Token Zenvia quando disponível                    │
│                                                         │
│  3. Rodar migrations:                                   │
│     cd /opt/captive-portal                              │
│     cp .env infra/.env                                  │
│     cd infra && docker compose up -d postgres redis     │
│     cd ../apps/admin-backend && npm install             │
│     DATABASE_URL="postgresql://captive:SENHA@localhost:  │
│     5432/captive_portal" npm run migrate                │
│     npm run seed                                        │
│                                                         │
│  4. Subir tudo:                                         │
│     cd /opt/captive-portal/infra                        │
│     docker compose up -d --build                        │
│                                                         │
│  5. Verificar:                                          │
│     curl http://localhost:8000/health                   │
│     curl http://localhost:8080                          │
│     curl http://localhost:29000/health                  │
│                                                         │
└─────────────────────────────────────────────────────────┘

SUMMARY

echo "Script finalizado com sucesso!"
