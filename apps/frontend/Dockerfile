FROM node:20-alpine AS base

# ─── Dependencies ──────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copia o shared package primeiro (para resolver a dependencia local)
COPY packages/shared ./packages/shared

# Copia os arquivos de dependencia do app
COPY apps/frontend/package.json apps/frontend/package-lock.json ./

# Ajusta o path do shared no package.json para o contexto do container
RUN sed -i 's|file:../../packages/shared|file:./packages/shared|' package.json
RUN npm ci

# ─── Build ─────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/frontend/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─── Runner ────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
