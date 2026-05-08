# wg-api — Sidecar de gerenciamento de peers WireGuard

Pequeno serviço HTTP em Go que gerencia peers do `wg0` no container WireGuard.
Roda no **mesmo network namespace** que o serviço `wireguard` (via
`network_mode: "service:wireguard"` no `docker-compose.yml`), então
`wgctrl` enxerga a interface `wg0`.

Implementação: ~370 linhas Go usando [`wgctrl-go`](https://golang.zx2c4.com/wireguard/wgctrl).

## Endpoints

Auth: header `Authorization: Bearer <WG_API_KEY>`. Sem auth → 401.

```
GET    /health                   (sem auth — Docker healthcheck)
POST   /peers                    body: {public_key, preshared_key, allowed_ips}
GET    /peers
GET    /peers/:public_key        (URL-encoded; aceita base64 ou base64url)
DELETE /peers/:public_key
```

Timestamps em Unix epoch seconds (number).

### Exemplos

```bash
# Health
curl http://wireguard:9999/health
# → {"status":"ok","interface":"wg0","peers_count":0}

# Adicionar peer
curl -X POST http://wireguard:9999/peers \
  -H "Authorization: Bearer $WG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "abc...=",
    "preshared_key": "def...=",
    "allowed_ips": "198.18.0.5/32"
  }'
# → 201 {"public_key":"abc...","allowed_ips":"198.18.0.5/32"}

# Listar peers
curl -H "Authorization: Bearer $WG_API_KEY" http://wireguard:9999/peers
# → 200 [{"public_key":"...","allowed_ips":"...","endpoint":"187.X:42118",
#         "last_handshake_unix":1714900000,"rx_bytes":1234,"tx_bytes":567}]

# Remover peer
curl -X DELETE -H "Authorization: Bearer $WG_API_KEY" \
  "http://wireguard:9999/peers/$(printf %s 'abc...=' | jq -sRr @uri)"
# → 204
```

## Env vars

| Variável | Default | Descrição |
|---|---|---|
| `WG_API_KEY` | (obrigatório) | Bearer token aceito no header Authorization |
| `WG_INTERFACE` | `wg0` | Interface WireGuard a gerenciar |
| `LISTEN_ADDR` | `:9999` | Endereço:porta de listen |

## Build local

```bash
cd apps/wg-api
go mod download
go build -o wg-api .
WG_API_KEY=test ./wg-api
```

## Build Docker

```bash
docker build -t wg-api .
```

Imagem multi-stage final usa Alpine 3.19, ~15MB, single binary.

## Decisões

- **Por que Go?** Single binary, sem deps de runtime, suporte first-class
  via `wgctrl-go` (oficial Jason Donenfeld), build trivial.
- **Por que não usar `wg setconf`?** O comando CLI requer escrever arquivo
  temporário e chamar processo externo. `wgctrl` fala direto via netlink
  no mesmo processo — atomic, fast, sem race conditions.
- **Auth simples (Bearer)?** Sim — o sidecar só é alcançável de dentro da
  rede docker `external` (`172.19.0.0/16`). Acesso externo seria
  preocupação de network, não de aplicação.
- **Logging?** stdout JSON estruturado por request. Sem buffer, container
  log driver coleta.

## Roadmap

- [x] Endpoints core (POST/GET/DELETE)
- [x] Auth Bearer
- [x] Logging estruturado
- [x] Healthcheck
- [ ] Tests com httptest (TODO — fase 2)
- [ ] Métricas Prometheus (`/metrics`) — fora de escopo agora
