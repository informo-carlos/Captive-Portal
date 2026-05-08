# Spec — Frontend admin pra WireGuard VPN do tenant

> Pro time de frontend implementar a aba "VPN" no modal de criar/editar
> tenant. Todos os endpoints da API admin estão na seção 4.
>
> **Branch base:** `feat/wireguard-vpn-tenants`
> **Arquitetura completa:** [`wireguard-vpn-architecture.md`](wireguard-vpn-architecture.md)

---

## 1. Onde encaixa na UI

### 1.1 Modal "Editar cliente" (já existente)

Adicionar **uma nova aba** ao topo do modal — junto das que já existem:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Editar cliente                                                  ✕    │
├──────────────────────────────────────────────────────────────────────┤
│ [Geral] [SonicWall/RADIUS] [Branding]   ⭐ [VPN]                      │
└──────────────────────────────────────────────────────────────────────┘
```

A aba VPN só fica habilitada se o tenant tiver `auth_mode='sonicwall'` e
`sonicwall_config.mode='lhm'`. Em modo RADIUS ou REST stub, exibir mensagem:
> _"VPN só é necessária no modo LHM (External Guest Authentication)."_

### 1.2 Detalhe do tenant (`/tenants/:id`)

Adicionar **card** na coluna direita, abaixo de "Seriais":

```
┌─ VPN WireGuard ──────────────────┐
│ ●  Conectado                      │
│ Peer IP:    198.18.0.5            │
│ Last hand.: há 12s                │
│ [Ver detalhes →]                  │
└──────────────────────────────────┘
```

---

## 2. Estados visuais

| `vpn_status` | Badge | Cor | Texto principal |
|---|---|---|---|
| `disabled` | ⚫ | cinza | "VPN desabilitada" |
| `pending` | ⏳ | azul | "Aguardando configuração no SonicWall" |
| `awaiting_handshake` | 🔄 | amarelo | "Aguardando primeira conexão" |
| `connected` | 🟢 | verde | "Conectado · handshake há `<X>`s" |
| `disconnected` | 🟡 | amarelo | "Sem handshake há `<X>`min" |
| `error` | 🔴 | vermelho | "Erro · ver detalhes" |

---

## 3. Conteúdo da aba VPN

### 3.1 Quando `vpn_enabled = false`

```
┌──────────────────────────────────────────────────────────────────────┐
│  VPN WireGuard                                                       │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  A VPN cria um túnel seguro entre nossa VPS e o SonicWall do        │
│  cliente, permitindo o backend liberar acesso via LHM API.          │
│                                                                      │
│  Pré-requisitos:                                                     │
│   • SonicOS 7.0 ou superior                                         │
│   • Acesso admin ao SonicWall                                        │
│   • ~10 minutos de configuração no firewall                         │
│                                                                      │
│  Documentação: [Setup no SonicWall →]                               │
│                                                                      │
│              ┌──────────────────────┐                                │
│              │  Habilitar VPN  →    │                                │
│              └──────────────────────┘                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Botão "Habilitar VPN" → chama `POST /admin/tenants/:id/vpn/enable`.

### 3.2 Quando `vpn_status = 'pending'` (acabou de habilitar)

```
┌──────────────────────────────────────────────────────────────────────┐
│  VPN WireGuard                              Status: ⏳ Pendente      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ⚠  VPN provisionada na VPS. Configure agora o SonicWall:           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ 1. Cole esta config na interface WireGuard do SonicOS:   │       │
│  │                                                          │       │
│  │  Address:        198.18.0.5/32                          │       │
│  │  Listen Port:    (deixe em branco — modo client)        │       │
│  │  Endpoint:       45.7.53.80:51820                       │       │
│  │  Allowed IPs:    198.18.0.1/32                          │       │
│  │  Persistent KA:  25 segundos                            │       │
│  │                                                          │       │
│  │  Pre-shared Key: ••••••••••••••••••••  [👁 Mostrar][📋] │       │
│  │  VPS Public Key: ••••••••••••••••••••  [👁 Mostrar][📋] │       │
│  │                                                          │       │
│  │  [📥 Baixar .conf]    [🔗 Setup no SonicWall →]         │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ 2. Após o SonicWall gerar a CHAVE PÚBLICA dele,         │       │
│  │    cole abaixo:                                         │       │
│  │                                                          │       │
│  │  Public Key do SonicWall:                                │       │
│  │  ┌────────────────────────────────────────────────────┐ │       │
│  │  │                                                    │ │       │
│  │  └────────────────────────────────────────────────────┘ │       │
│  │                                                          │       │
│  │            [Cancelar VPN]  [Salvar e Conectar →]        │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Quando `vpn_status = 'awaiting_handshake'`

```
┌──────────────────────────────────────────────────────────────────────┐
│  VPN WireGuard                       Status: 🔄 Aguardando conexão   │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Public Key do SonicWall registrada. Aguardando primeira conexão.   │
│                                                                      │
│  Verifique no SonicOS que:                                          │
│   ✓ A interface WireGuard está habilitada (Enable = ON)             │
│   ✓ A regra de Access Rule WAN→Tunnel permite UDP 51820             │
│   ✓ O cliente tem rota pra Internet (saída UDP)                     │
│                                                                      │
│  [Última verificação: há 8s]   [🔄 Verificar agora]                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Polling automático a cada 5s (ou WebSocket se preferir) chamando
`GET /admin/tenants/:id/vpn/status`.

### 3.4 Quando `vpn_status = 'connected'`

```
┌──────────────────────────────────────────────────────────────────────┐
│  VPN WireGuard                          Status: 🟢 Conectado         │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌──────────────────────────┬──────────────────────────────────┐    │
│  │ Peer IP                  │ 198.18.0.5/32                    │    │
│  ├──────────────────────────┼──────────────────────────────────┤    │
│  │ Endpoint do cliente      │ 187.45.X.X:42118 (atualizado     │    │
│  │                          │  automaticamente)                 │    │
│  ├──────────────────────────┼──────────────────────────────────┤    │
│  │ Último handshake         │ há 18 segundos                    │    │
│  ├──────────────────────────┼──────────────────────────────────┤    │
│  │ Bytes RX (cliente→nós)   │ 1.2 MB                            │    │
│  ├──────────────────────────┼──────────────────────────────────┤    │
│  │ Bytes TX (nós→cliente)   │ 540 KB                            │    │
│  ├──────────────────────────┼──────────────────────────────────┤    │
│  │ LHM Mgmt URL             │ https://198.18.0.5:4443/         │    │
│  └──────────────────────────┴──────────────────────────────────┘    │
│                                                                      │
│  [🔧 Testar POST LHM]   [↻ Regenerar PSK]   [⚠ Desabilitar VPN]    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Testar POST LHM**: chama `POST /admin/tenants/:id/vpn/test-lhm` que faz
  um POST de teste com sessId fake — deve voltar erro de sessId, mas isso
  PROVA que a VPN funciona.
- **Regenerar PSK**: gera nova PSK, força reconectar (peer perde key, precisa nova).
- **Desabilitar VPN**: confirma com modal, remove peer, limpa fields.

### 3.5 Quando `vpn_status = 'disconnected'`

Mostra alerta e botão pra investigar:

```
🟡 Sem handshake há 4 minutos. O SonicWall pode estar offline ou com
   problema de rede.

   [🔍 Diagnosticar]  [📋 Ver logs]
```

### 3.6 Quando `vpn_status = 'error'`

```
🔴 Erro: <mensagem do backend>

   [🔍 Detalhes]  [↻ Tentar novamente]  [⚠ Desabilitar e refazer]
```

---

## 4. API endpoints

Todos os endpoints requerem `fastify.authenticate + fastify.requireRole('admin')`.

### 4.1 `POST /admin/tenants/:id/vpn/enable`

Habilita VPN no tenant. Backend:
1. Aloca próximo `/32` livre em `198.18.0.0/15`
2. Gera PSK random (32 bytes)
3. Salva: `vpn_enabled=true`, `vpn_peer_ip=198.18.0.X`, `vpn_status='pending'`,
   `vpn_preshared_key_enc=<aes>`
4. Adiciona peer no container WG sem PublicKey ainda (espera o frontend mandar)

**Response 200:**
```json
{
  "vpn_peer_ip": "198.18.0.5/32",
  "endpoint": "45.7.53.80:51820",
  "allowed_ips": "198.18.0.1/32",
  "persistent_keepalive": 25,
  "preshared_key": "Th3PSKgenerat3dByB4ckend...",  // mostrado UMA vez
  "vps_public_key": "abc123def456...",              // mostrado UMA vez
  "lhm_mgmt_lan_url": "https://198.18.0.5:4443/",
  "vpn_status": "pending"
}
```

### 4.2 `POST /admin/tenants/:id/vpn/peer-public-key`

Admin cola a public key gerada no SonicWall.

**Body:**
```json
{ "public_key": "XYZ789..." }
```

Backend:
1. Valida formato (44 chars base64)
2. Salva `vpn_public_key`
3. Chama API do container WG pra adicionar peer com essa pub key
4. Atualiza `vpn_status='awaiting_handshake'`

**Response 200:**
```json
{ "vpn_status": "awaiting_handshake" }
```

### 4.3 `GET /admin/tenants/:id/vpn/status`

Retorna estado atual + métricas de handshake.

**Response 200:**
```json
{
  "vpn_status": "connected",
  "vpn_peer_ip": "198.18.0.5",
  "endpoint_observed": "187.45.10.20:42118",
  "last_handshake_seconds_ago": 18,
  "transfer_rx_bytes": 1234567,
  "transfer_tx_bytes": 567890,
  "lhm_mgmt_lan_url": "https://198.18.0.5:4443/"
}
```

### 4.4 `POST /admin/tenants/:id/vpn/test-lhm`

Faz POST de teste pro LHM via VPN com sessId fake.

**Response 200:**
```json
{
  "reachable": true,
  "http_status": 200,
  "response_body": "{\"code\":\"<algum erro de sessId>\",\"message\":\"...\"}",
  "duration_ms": 142
}
```

Se `reachable=true` mas `code != "50"`, isso é esperado (sessId fake).
O importante é que o firewall **respondeu**.

Se `reachable=false`, retorna 502 com diagnóstico:
```json
{
  "reachable": false,
  "error": "ECONNREFUSED" | "TIMEOUT" | "TLS_ERROR" | ...,
  "details": "..."
}
```

### 4.5 `POST /admin/tenants/:id/vpn/regenerate-psk`

Gera nova PSK, atualiza no peer.

**Response 200:**
```json
{
  "preshared_key": "<nova PSK>",
  "vpn_status": "awaiting_handshake"
}
```

UI deve mostrar a PSK pro admin e instruir cole no SonicWall (que precisa
reaplicar pra reconectar).

### 4.6 `DELETE /admin/tenants/:id/vpn`

Desabilita VPN. Remove peer da VPS, limpa fields no banco.

**Response 204** (no content).

### 4.7 `GET /admin/tenants/:id/vpn/config-download`

Retorna arquivo `.conf` pronto pra colar no SonicWall.

**Response 200** (Content-Type: text/plain; Content-Disposition: attachment):
```ini
# WireGuard config para tenant <name>
# Cole no SonicOS ou em qualquer cliente WireGuard.

[Interface]
# Gere a chave privada NO PRÓPRIO SONICWALL
# (não use chave gerada externamente — privada nunca deve sair do firewall)
# PrivateKey = <gerada no SonicWall>
Address = 198.18.0.5/32

[Peer]
PublicKey = <vps_public_key>
PresharedKey = <preshared_key>
AllowedIPs = 198.18.0.1/32
Endpoint = 45.7.53.80:51820
PersistentKeepalive = 25
```

---

## 5. Fluxo do usuário (UX) — wizard primeira vez

Sugestão de UX guiado, mais amigável que a tela "everything at once":

```
Passo 1/4 — Confirmar pré-requisitos
─────────────────────────────────────
□ SonicOS 7.0 ou superior
□ Acesso admin ao SonicWall
□ ~10 min disponíveis pra configuração

[Cancelar]  [Próximo →]
```

```
Passo 2/4 — Provisionar VPN na VPS
─────────────────────────────────────
✅ IP alocado: 198.18.0.5/32
✅ Pre-shared key gerada
✅ Peer registrado no servidor

[← Voltar]  [Próximo →]
```

```
Passo 3/4 — Configurar SonicWall
─────────────────────────────────────
1. Abra o painel do SonicOS
2. Vá em Network → Interfaces → Add Interface → WireGuard
3. Cole estes valores:

   Address:        198.18.0.5/32
   Endpoint:       45.7.53.80:51820
   Pre-shared:     [👁 Ver][📋]
   VPS Pub Key:    [👁 Ver][📋]

4. Salve e copie a PUBLIC KEY que o SonicWall gerou:
   ┌────────────────────────────────────────────┐
   │                                            │
   └────────────────────────────────────────────┘

[← Voltar]  [Verificar →]
```

```
Passo 4/4 — Validar conexão
─────────────────────────────────────
🔄 Aguardando primeira conexão... (15s)

✓ Peer registrado
✓ Public key validada
🔄 Aguardando handshake...

[Cancelar]
```

Quando handshake chega → modal fecha sozinho, redireciona pro detalhe do
tenant com toast verde "VPN conectada com sucesso!".

---

## 6. Edge cases pra cobrir

1. **Range esgotado**: se algum dia atingirmos 131k tenants, o backend vai
   retornar erro 503 `vpn_range_exhausted`. UI mostra mensagem clara.
2. **PSK comprometida**: botão "Regenerar PSK" + modal de confirmação
   ("vai derrubar a VPN, cliente precisa colar nova PSK no SonicWall").
3. **Conflito de IP do túnel com LAN do cliente**: se algum cliente
   exótico tem `198.18.X.X` na LAN, vai dar conflito de roteamento.
   Backend deve retornar erro descritivo. Por agora, low-priority — nunca
   vimos cliente com 198.18.X.
4. **Handshake parou**: UI deve permitir "diagnosticar" — mostrando
   logs do peer (`wg show wg0 dump`).
5. **Cliente perdeu config**: regenerar download. Backend deve permitir
   re-download com a mesma PSK (não recriar).

---

## 7. Tarefas pro frontend (checklist)

- [ ] Aba "VPN" no `tenant-modal.tsx` com 6 estados visuais
- [ ] Componente `<VpnStatusBadge>` reutilizável (cor + ícone + texto)
- [ ] Componente `<MaskedKey>` (esconde/mostra/copia chave)
- [ ] Polling de status a cada 5s quando aba aberta
- [ ] Wizard guiado (4 passos) na primeira ativação
- [ ] Card resumido na página `/tenants/:id`
- [ ] Botão de download `.conf`
- [ ] Modal de "Testar POST LHM" com diagnóstico
- [ ] Modal de confirmação pra "Desabilitar VPN" (texto: "vai cortar acesso
      à internet dos guests do cliente até reconfigurar")
- [ ] Tratamento de erros 4xx/5xx com mensagens amigáveis
- [ ] Loading states em todas as ações async
- [ ] i18n: textos em português (já é o padrão do app)

---

## 8. Observações finais

- A página de detalhe do tenant pode mostrar **gráfico simples** de bytes
  RX/TX nas últimas 24h (data ponto coletado a cada 1min pelo worker do backend).
  Isso é "nice to have" — fica pra fase 4.
- Considerar **dark mode**: o app já tem? Se sim, garantir contraste das
  badges/keys mascaradas.
- Acessibilidade: chaves mascaradas têm aria-label "PSK escondida — clique pra mostrar".
