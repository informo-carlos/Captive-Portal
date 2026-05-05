# wg-api — Sidecar de gerenciamento de peers WireGuard

> **Status:** stub. Implementação na Fase 2 (próxima sessão).

Pequeno serviço HTTP em Go que gerencia peers do `wg0` no container
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

## Por que Go

- Single binary, ~5MB
- Sem deps de runtime (vs Node/Python)
- Excelente API stdlib pra `net/http`
- `golang.zx2c4.com/wireguard/wgctrl` é a lib oficial pra falar com WG

## Roadmap

- [ ] `main.go` — server HTTP minimal
- [ ] `Dockerfile` — multi-stage build
- [ ] Auth middleware (Bearer token)
- [ ] Integration com `wgctrl-go`
- [ ] Healthcheck `/health`
- [ ] Logs estruturados (JSON, igual o resto do projeto)
- [ ] Tests com `httptest`

Implementação: ~150 linhas Go, ~30min de trabalho.
