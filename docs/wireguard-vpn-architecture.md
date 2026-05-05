# Arquitetura — WireGuard VPN VPS↔SonicWall

> Design técnico da VPN que permite o backend (na VPS) fazer POST direto
> pro `lhmapi/externalAAAGuest` no SonicWall do cliente.
>
> Resolve a parede arquitetural documentada em
> [`sonicwall-integration-findings.md`](sonicwall-integration-findings.md):
> o LHM REST do SonicOS 7.3.2 só aceita request server-to-server, e a VPS
> não alcança a LAN do cliente sem túnel.

**Status:** especificação. Implementação em andamento na branch
`feat/wireguard-vpn-tenants`.

**Autor inicial:** sessão de design 2026-05-05.

---

## 1. Por que WireGuard

| Critério | WireGuard | OpenVPN | IPsec |
|---|---|---|---|
| Suporte nativo SonicOS 7+ | ✅ | ❌ | ✅ |
| Setup por cliente | ~5min | ~30min | ~30min |
| Performance / overhead | excelente | médio | bom |
| MTU / fragmentação | simples | complicado | complicado |
| Cliente sem IP fixo | ✅ (passive) | ⚠️ depende | ⚠️ depende |
| Auditoria de código | trivial (~4k LoC) | grande | enorme |

WireGuard ganha em todos os critérios relevantes pro nosso caso.

---

## 2. Arquitetura de rede

### 2.1 Range escolhido — `198.18.0.0/15`

**RFC 2544 — Network Interconnect Device Benchmarking.** Reservado pra teste
de equipamentos. Quase nenhuma rede de cliente ou ISP usa.

Por que não usar outros ranges privados:

| Range | Onde colide |
|---|---|
| `192.168.0.0/16` | LAN doméstica/corp (universal) |
| `10.0.0.0/8` | LAN corp grande, cliente atual usa `10.212.200.0/24` |
| `172.16.0.0/12` | Docker (`172.17-19.x`), VPS provedor (`172.16.10.0/24`), WSL (`172.30.x`) |
| `100.64.0.0/10` | CGNAT — devs do projeto têm WireGuard corp em `100.64.0.32` |
| `198.18.0.0/15` | RFC 2544 benchmark — **livre** ✅ |

Capacidade: `198.18.0.0/15` = 131.072 endereços. Em `/32` por tenant
(point-to-point), suporta **até ~131k tenants**. Mais que suficiente.

### 2.2 Esquema de IPs

```
198.18.0.0/15
├── 198.18.0.1/32     → VPS (concentrador)
├── 198.18.0.2/32     → Tenant 1 (peer)
├── 198.18.0.3/32     → Tenant 2 (peer)
├── 198.18.0.4/32     → Tenant 3 (peer)
└── ...
```

**Alocação:**
- VPS sempre fixo em `198.18.0.1`
- Cada tenant pega o próximo `/32` livre
- Algoritmo: `SELECT max(vpn_peer_ip) FROM tenants WHERE vpn_enabled` → próximo
- Lock pessimista pra evitar race em provisionamento concorrente

### 2.3 Topologia

```
┌─────────────────────────────────┐
│  VPS  45.7.53.80                │
│                                 │
│  ┌───────────────────────────┐  │
│  │ container portal-backend  │  │
│  │  - faz POST LHM via wg0   │  │
│  └────────────┬──────────────┘  │
│               │ rota             │
│  ┌────────────▼──────────────┐  │
│  │ container wireguard       │  │
│  │  wg0  198.18.0.1/15       │  │
│  │  listen UDP :51820         │  │
│  │  modo passive             │  │
│  └────────────┬──────────────┘  │
└───────────────┼─────────────────┘
                │
                │ UDP 51820 (cliente initia)
                │
        ┌───────┼─────────────┐
        │       │             │
        ▼       ▼             ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │SonicWall│ │SonicWall│ │SonicWall│
   │Tenant 1 │ │Tenant 2 │ │Tenant 3 │
   │.0.2/32  │ │.0.3/32  │ │.0.4/32  │
   └────────┘ └────────┘ └────────┘
   (WAN/NAT  (WAN/NAT   (WAN/NAT
    qualquer  qualquer    qualquer
     IP)      IP)         IP)
```

### 2.4 Fluxo de autenticação OTP com VPN

```
1. Cliente Wi-Fi conecta no SSID
2. SonicWall redireciona pro nosso portal (45.7.53.80:29002)
3. Usuário digita telefone, recebe OTP, valida
4. Backend verifica OTP ✓
5. Backend lê tenant.vpn_enabled e tenant.lhm_mgmt_lan_url
   (= "https://198.18.0.2:4443/lhmapi/externalAAAGuest")
6. Backend monta JSON do POST LHM (igual hoje)
7. Backend faz fetch direto pra esse IP do túnel:
     fetch("https://198.18.0.2:4443/...", {
       method: "POST",
       headers: {"Content-Type": "application/json"},
       body: JSON.stringify({info: {...}}),
       agent: httpsAgentTunnel  // ignora cert self-signed do firewall
     })
8. Pacote sai pelo wg0 → atravessa tunnel → chega no SonicWall LAN
9. SonicWall responde {"code": "50"} = sucesso
10. Backend devolve sucesso pro frontend → "internet liberada"
```

**Importante:** o navegador do usuário NÃO é mais envolvido na chamada LHM.
Volta a ser fluxo limpo igual o `guestLHMLogin.php` de referência.

---

## 3. Modelo passive (VPS escuta, cliente inicia)

### 3.1 Por que passive

- ✅ Cliente **NÃO precisa** IP fixo nem DDNS
- ✅ Cliente **NÃO precisa** abrir porta inbound (NAT da operadora não atrapalha)
- ✅ Reconexão automática se IP do cliente trocar (handshake refaz)
- ✅ VPS tem IP fixo público (`45.7.53.80`) — fácil de usar como `Endpoint`

### 3.2 Config do lado da VPS (concentrador)

`/etc/wireguard/wg0.conf` (gerada e atualizada dinamicamente pelo backend):

```ini
[Interface]
PrivateKey = <gerada uma vez, segura no banco da VPS>
Address = 198.18.0.1/15
ListenPort = 51820
# sem Endpoint = passive

[Peer]   # tenant 1
PublicKey = <pública do SonicWall do tenant 1>
PresharedKey = <PSK gerada pelo backend>
AllowedIPs = 198.18.0.2/32
# sem Endpoint = aceita de qualquer IP (cliente atrás de NAT)
PersistentKeepalive = 25

[Peer]   # tenant 2
PublicKey = <...>
PresharedKey = <...>
AllowedIPs = 198.18.0.3/32
PersistentKeepalive = 25

# ... etc
```

### 3.3 Config do lado do cliente (SonicWall)

Que o admin do cliente cola na interface WireGuard do SonicOS:

```ini
[Interface]
PrivateKey = <gerada no SonicWall, NUNCA sai do firewall>
Address = 198.18.0.2/32
# sem ListenPort = cliente

[Peer]
PublicKey = <pública da nossa VPS>
PresharedKey = <PSK que entregamos via UI/copy-paste>
AllowedIPs = 198.18.0.1/32   # só fala com a VPS
Endpoint = 45.7.53.80:51820
PersistentKeepalive = 25
```

`PersistentKeepalive=25` é importante: cliente manda pacote vazio a cada 25s
pra manter o NAT entry vivo. Sem isso, o NAT do ISP pode fechar a porta.

---

## 4. Container WireGuard na VPS

### 4.1 Porquê dentro de container

- Isola dependências (`wireguard-tools`, kernel module) — não polui host
- Reproduzível (igual em dev / staging / prod)
- Atualização limpa (`docker compose pull && up -d`)

### 4.2 Imagem escolhida — `linuxserver/wireguard`

Mantida ativamente, ~1M+ pulls, suporta tanto WG kernel-mode quanto
userspace fallback (`wireguard-go`).

### 4.3 Adição ao `docker-compose.yml`

```yaml
  wireguard:
    image: lscr.io/linuxserver/wireguard:1.0.20210914
    container_name: infra-wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      net.ipv4.conf.all.src_valid_mark: 1
      net.ipv4.ip_forward: 1
    ports:
      - "51820:51820/udp"
    volumes:
      - wireguard_config:/config
      - /lib/modules:/lib/modules:ro
    networks:
      external:
        ipv4_address: 172.19.0.20  # IP fixo na rede docker
    restart: unless-stopped
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/Sao_Paulo
```

### 4.4 Como o backend interage com o container

- Backend roda em container separado (`portal-cliente-exemplo`)
- Backend tem rota pro range `198.18.0.0/15` via gateway `172.19.0.20`
  (configurada como `extra_hosts` ou rota IP no container portal)
- Backend chama API REST do `wireguard-tools` no container WG
  via Docker socket OU via shell `docker exec` (escolheremos uma)
- **Decisão:** preferir REST. Adicionar um sidecar pequeno
  no container WG que expõe `/peers` (POST/DELETE/GET) e que executa
  `wg setconf` internamente. Isso desacopla backend de Docker socket.

---

## 5. Fluxo de provisionamento

### 5.1 Quando admin cria/edita tenant e marca "Habilitar VPN"

```
1. Admin clica "Habilitar VPN" no painel
2. Backend gera:
   - Aloca próximo /32 livre   → ex: 198.18.0.5
   - Gera PSK (32 bytes random base64)
   - Salva no banco com vpn_status='pending', vpn_public_key=NULL
3. Backend retorna config parcial pro admin:
   - "Configure o WireGuard no SonicWall com:
        Address: 198.18.0.5/32
        Endpoint: 45.7.53.80:51820
        PSK: <copiar>
        VPS PublicKey: <copiar>
      Após gerar a chave do firewall, cole a PUBLIC KEY abaixo"
4. Admin abre painel SonicOS → cria interface WireGuard com chave gerada
5. Admin copia a chave pública do firewall e cola no painel admin
6. Backend recebe pública, atualiza vpn_public_key, chama wg-api do container
   pra adicionar peer
7. Container WG aplica via `wg setconf`
8. Backend monitora handshake (consulta `wg show wg0 latest-handshakes`)
9. Quando handshake bem-sucedido → vpn_status='connected'
10. Backend valida POST de teste: `curl https://198.18.0.5:4443/sonicui/`
    Se 302/200 → tenant pronto pra LHM via VPN
```

### 5.2 Estados possíveis

| Estado | Significado | Ação |
|---|---|---|
| `disabled` | VPN não foi habilitada nesse tenant | Fluxo normal sem VPN (não funciona pra LHM) |
| `pending` | Configurada na VPS, esperando cliente colar pública | UI mostra "aguardando cliente colar chave" |
| `awaiting_handshake` | Pública colada, mas WG ainda não viu handshake | UI mostra "aguardando primeira conexão" |
| `connected` | Handshake recente (<3min) | UI mostra ✅ verde |
| `disconnected` | Sem handshake há >3min | UI mostra ⚠️ amarelo |
| `error` | Erro ao adicionar peer ou validar conexão | UI mostra ❌ + mensagem |

---

## 6. Segurança

### 6.1 Chaves
- Privada do cliente: gerada no SonicWall, **nunca** sai do firewall
- Privada da VPS: gerada uma vez, salva em volume Docker do WG, criptografada via secret manager (Docker secrets ou similar)
- Pública do cliente: armazenada em texto puro no banco (não é segredo)
- PSK: gerada por nós, criptografada AES-256 (`services/crypto.ts`) no banco

### 6.2 Isolamento entre tenants
- Cada tenant só pode falar com o IP da VPS (`198.18.0.1/32` em `AllowedIPs` do peer da VPS)
- VPS NÃO roteia tráfego entre tenants (sem forwarding tenant↔tenant)
- Se tenant A tentar mandar pacote pra `198.18.0.X` (IP de tenant B) → drop

### 6.3 Validação adicional
- Cert HTTPS do firewall ainda é self-signed → aceitar com `rejectUnauthorized: false` no agent
- MAS validar via PSK + chave pública = autenticação dupla suficiente
- Endpoint LHM espera sessId válido (32 hex bytes) — proteção adicional contra abuso intra-tenant

---

## 7. Mudanças no schema de banco

Migration `017_tenants_vpn.sql`:

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS vpn_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpn_peer_ip INET,
  ADD COLUMN IF NOT EXISTS vpn_public_key TEXT,
  ADD COLUMN IF NOT EXISTS vpn_preshared_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS vpn_status TEXT DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS vpn_endpoint_observed TEXT,
  ADD COLUMN IF NOT EXISTS vpn_last_handshake TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vpn_last_status_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vpn_transfer_rx_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS vpn_transfer_tx_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS lhm_mgmt_lan_url TEXT;

-- Único: só um tenant por IP de VPN
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_vpn_peer_ip
  ON tenants (vpn_peer_ip)
  WHERE vpn_peer_ip IS NOT NULL;

-- Constraint nos valores aceitos de vpn_status
ALTER TABLE tenants
  ADD CONSTRAINT tenants_vpn_status_check
  CHECK (vpn_status IN (
    'disabled','pending','awaiting_handshake',
    'connected','disconnected','error'
  ));
```

### Resumo das colunas

| Coluna | Tipo | Descrição |
|---|---|---|
| `vpn_enabled` | BOOLEAN | Se true, backend usa `lhm_mgmt_lan_url` em vez do `mgmtBaseUrl` do redirect. |
| `vpn_peer_ip` | INET | /32 alocado dentro de `198.18.0.0/15`. VPS sempre `198.18.0.1`. |
| `vpn_public_key` | TEXT | Chave pública WG gerada no SonicWall. Privada nunca sai do firewall. |
| `vpn_preshared_key_enc` | TEXT | PSK gerada pelo backend. Criptografada AES-256 via `services/crypto.ts`. |
| `vpn_status` | TEXT | `disabled`/`pending`/`awaiting_handshake`/`connected`/`disconnected`/`error`. |
| `vpn_endpoint_observed` | TEXT | IP:porta de origem observado no último handshake (telemetria/troubleshooting). |
| `vpn_last_handshake` | TIMESTAMPTZ | Última vez que houve handshake com sucesso. |
| `vpn_last_status_check` | TIMESTAMPTZ | Última vez que o worker checou o status. |
| `vpn_transfer_rx_bytes` | BIGINT | Bytes recebidos do peer (acumulado, do `wg show`). |
| `vpn_transfer_tx_bytes` | BIGINT | Bytes enviados pro peer (acumulado, do `wg show`). |
| `lhm_mgmt_lan_url` | TEXT | URL completa do mgmt via VPN (ex: `https://198.18.0.5:4443/`). |

---

## 8. Roadmap de implementação

### Fase 1 — Docs + design (esta sessão)
- [x] Doc de arquitetura (este arquivo)
- [ ] Doc de spec pro frontend (`wireguard-frontend-spec.md`)
- [ ] Doc de setup SonicWall (`wireguard-sonicwall-setup.md`)
- [ ] Migration `017_tenants_vpn.sql`
- [ ] Adição do serviço `wireguard` no `docker-compose.yml`
- [ ] Issue/PR no GitHub pra time de frontend

### Fase 2 — Backend (próxima sessão)
- [ ] Sidecar HTTP simples no container WG (`/peers` endpoint)
- [ ] Plugin `wireguard.ts` no `apps/backend` ou `apps/admin-backend`
- [ ] Endpoints `/admin/tenants/:id/vpn/*`
- [ ] Refactor `lhm.ts`: usar `lhm_mgmt_lan_url` quando `vpn_enabled`
- [ ] Worker periódico que checa handshake e atualiza `vpn_status`
- [ ] Setup script da VPS (`infra/scripts/wireguard-setup.sh`)

### Fase 3 — Frontend
- [ ] Aba "VPN" no `tenant-modal.tsx`
- [ ] Página/seção de status do tunnel
- [ ] Download da config WireGuard (.conf)
- [ ] Wizard pra primeira configuração

### Fase 4 — Validação end-to-end
- [ ] Testar com tenant INFORMO (que já tem SonicWall TZ 370)
- [ ] Documentar troubleshooting comum
- [ ] Atualizar [`sonicwall-integration-findings.md`](sonicwall-integration-findings.md)
  marcando o caso resolvido

---

## 9. Open questions

1. **Sidecar HTTP no container WG**: implementar em Go (binary pequeno) ou Node?
   Provável: Go, ~50 linhas, sem dependências, fácil rebuild. Ou Python.
2. **Rotação de chaves**: cliente perde chave / chave vaza — UI deve permitir
   regenerar. Implementar agora ou depois?
3. **Multi-region**: se algum dia a VPS migrar / tiver réplicas, cada peer
   precisa de endpoint redundante. Por agora, fora de escopo.
4. **Compatibilidade Linux do firewall**: SonicOS 7+ tem WireGuard nativo,
   mas pode haver clientes em SonicOS 6.x ou outros vendors. Documentar
   na spec do setup que só TZ/NSa com 7.0+ é suportado pra esse modo.
