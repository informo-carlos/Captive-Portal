# swan-api — Sidecar de gerenciamento de IPsec/strongSwan

Pequeno serviço HTTP em Go que gerencia conexões IPsec via `swanctl` CLI.
Roda no **mesmo network namespace** que o serviço `strongswan` (via
`network_mode: "service:strongswan"` no `docker-compose.yml`).

Implementação: ~340 linhas Go.

Cada peer (tenant) corresponde a um arquivo `<peer_id>.conf` em
`/etc/swanctl/conf.d/`, gerado dinamicamente pela API.

## Endpoints

Auth: header `Authorization: Bearer <SWAN_API_KEY>`. Sem auth → 401.

```
GET    /health                 (sem auth)
POST   /peers                  body: {peer_id, peer_ip, psk, remote_id?}
GET    /peers
GET    /peers/:peer_id         status (state, handshake, bytes)
DELETE /peers/:peer_id
```

`peer_id` é o identificador único do peer (geralmente `tenant_<UUID>`).
Pattern: `[A-Za-z0-9_-]{1,64}`.

## Modelo IPsec

- IKEv2, PSK auth (não cert)
- Proposals padrão: `aes256-sha256-modp2048,aes128-sha256-modp2048,default`
- VPS é responder (passive) — cliente inicia handshake
- VPS local IP = `198.18.0.1`, peer IP = `198.18.0.X` (alocado pelo backend)
- `remote_id` opcional; default `%any` (aceita qualquer ID autenticado pela PSK)
- DPD a cada 30s, MOBIKE habilitado, NAT-T (encap=yes)
- Rekey 1h, lifetime 8h

## Env vars

| Variável | Default | Descrição |
|---|---|---|
| `SWAN_API_KEY` | (obrigatório) | Bearer token aceito no header Authorization |
| `LISTEN_ADDR` | `:9999` | Endereço:porta de listen |

## Build local

```bash
cd apps/swan-api
go mod tidy
go build -o swan-api .
```

## Build Docker

```bash
docker build -t swan-api .
```

Imagem final usa `strongx509/strongswan:6.0.0` como base (~80MB) — reusa
o `swanctl` da imagem oficial.

## Por que swanctl CLI e não vici-go?

- vici-go (`go-strongswan-vici`) é a API binária via UNIX socket, mais rápida
- swanctl CLI é mais simples de testar/debugar e não exige libs Go extras
- Pra escala atual (poucas dezenas de peers), CLI é OK; se virar bottleneck,
  migra pra vici sem mudar contrato externo
