# wg-api — Sidecar de gerenciamento de peers WireGuard

> **Status:** stub. Implementação na Fase 2 (próxima sessão).

Pequeno serviço HTTP em Node/Fastify que gerencia peers do `wg0` no container
WireGuard. Roda no mesmo network namespace que o `wireguard` (via
`network_mode: "service:wireguard"`) então `wg show` enxerga a interface.

## Endpoints planejados

```
POST   /peers
       body: { public_key, preshared_key, allowed_ips }
       resp: 201 + { peer_id }

GET    /peers
       resp: 200 + [{ public_key, allowed_ips, last_handshake, rx, tx }]

DELETE /peers/:public_key
       resp: 204

GET    /peers/:public_key
       resp: 200 + { public_key, allowed_ips, last_handshake, rx, tx, endpoint }
```

Auth via header `Authorization: Bearer <WG_API_KEY>` (env var, mesma
secret no admin-backend).

## Por que Node

- Consistência com resto do stack (admin-backend, portal-backend, provisioner são todos Node/Fastify/TypeScript)
- Reaproveitar patterns já existentes: logger Fastify, schemas JSON, error format
- Um dev mantém todo o backend sem trocar de linguagem
- Performance suficiente — tráfego é apenas chamadas administrativas (provisão de peer, ~ms por request)

## Implementação

Base image: `node:20-alpine` + `apk add wireguard-tools` (pra ter o binário `wg`).

Parsing do `wg show wg0 dump` via `child_process.execFile('wg', ['show', 'wg0', 'dump'])`
e gerenciamento de peers via `wg set wg0 peer ...` / `wg-quick`.

## Roadmap

- [ ] `src/server.ts` — Fastify minimal com schemas JSON
- [ ] `Dockerfile` — `node:20-alpine` + `wireguard-tools`
- [ ] Auth plugin (Bearer token via header)
- [ ] `services/wg.ts` — wrapper do `wg` CLI via `execFile`
- [ ] Healthcheck `GET /health`
- [ ] Logs estruturados (Fastify logger, JSON)
- [ ] Tests com `vitest` + `supertest` (igual o portal-backend)

Implementação: ~200 linhas TS, similar à estrutura do `admin-backend`.
