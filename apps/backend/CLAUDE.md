# CLAUDE.md — apps/backend (Portal Backend)

> Contexto específico do portal captivo. Leia também o CLAUDE.md da raiz.

## O que este app faz

Recebe o redirect do SonicWall, valida o serial do firewall, conduz o fluxo de OTP
e libera o acesso do usuário no SonicWall após autenticação bem-sucedida.

## Spec de referência

**`docs/spec-auth-api.md`** — fonte de verdade para todos os endpoints deste app.

## Entry points

- `src/app.ts` — inicializa o Fastify, registra plugins e rotas
- `src/config.ts` — lê e valida todas as env vars (falha rápido se algo falta)

## Plugins registrados globalmente (ordem importa)

1. `plugins/postgres.ts` — decorator `fastify.db`
2. `plugins/redis.ts` — decorator `fastify.redis`
3. `plugins/serial-guard.ts` — hook `onRequest` que valida o serial em TODAS as rotas

## Serviços

- `services/otp.ts` — geração (`crypto.randomInt`), armazenamento Redis, validação
- `services/zenvia.ts` — envio de SMS via API Zenvia
- `services/sonicwall/index.ts` — **sempre importar daqui**, nunca dos arquivos internos

## Variáveis de ambiente deste app

Ver `.env.example` na raiz — prefixo `TENANT_*`.
O `src/config.ts` deve validar todas na inicialização e lançar erro descritivo se faltar alguma.

## Padrão de teste

```bash
npm run test        # Jest com supertest
npm run test:watch  # modo watch
```

Cada endpoint deve ter ao menos:
- Teste com serial válido → fluxo happy path
- Teste com serial inválido → 403
- Testes dos casos de erro da spec (rate limit, OTP expirado, etc.)
