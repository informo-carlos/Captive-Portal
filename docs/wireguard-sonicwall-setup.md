# Setup WireGuard no SonicWall (cliente)

> Passo-a-passo pro **admin do SonicWall** configurar a interface VPN
> que conecta no nosso captive portal SaaS.
>
> **Tempo estimado:** 5–10 minutos.
> **Pré-requisito:** SonicOS 7.0 ou superior. WireGuard é nativo a partir
> dessa versão; em firmwares anteriores não funciona.

---

## 1. O que vai ser feito

A VPN cria um túnel seguro entre seu SonicWall e nossa VPS. **Você não
precisa abrir nenhuma porta inbound** — o túnel é iniciado pelo seu firewall
em modo cliente. Quando o usuário Wi-Fi guest faz OTP no portal, nossa VPS
manda o comando de liberação pelo túnel.

### 1.1 Garantias de segurança

- **Privada do firewall nunca sai do SonicWall** — você gera a chave no
  próprio SonicOS, e só a chave PÚBLICA é colada no nosso painel.
- **Pre-shared key adicional** — geramos no nosso lado e te entregamos via
  painel admin (HTTPS). Defesa em profundidade contra ataques quânticos
  futuros.
- **Comunicação isolada** — sua interface só fala com nosso IP de VPS
  (`198.18.0.1`), nada mais. Outros clientes da nossa plataforma não
  conseguem alcançar seu firewall via essa VPN.

---

## 2. Antes de começar

Você vai precisar de:

- ✅ Acesso admin ao SonicOS
- ✅ Estes 3 valores que copiamos do nosso painel admin (entregamos pra você):
  - **Address** (IP que sua interface VPN vai assumir): `198.18.0.X/32`
  - **Pre-shared Key** (PSK)
  - **Public Key da VPS**

> Se ainda não recebeu esses valores, peça pro admin do nosso painel ativar
> a VPN do seu tenant e te enviar.

---

## 3. Passo-a-passo no SonicOS 7.x

### 3.1 Criar a Tunnel-Interface WireGuard

**⚠️ Importante:** o SonicWall apresenta WireGuard em duas modalidades —
**Site-to-Site** e **Tunnel-Interface**. Use **Tunnel-Interface**, não
Site-to-Site. Site-to-Site rotearia a LAN inteira; queremos só uma
interface virtual ponto-a-ponto.

1. Abra o SonicOS (ex: `https://192.168.1.1:4443`)
2. Vá em **NETWORK → IPSec VPN → Tunnel Interfaces** (ou
   **VPN → Settings → Tunnel Interface** — varia por build)
3. Clique **+ Add Tunnel Interface**
4. **Tipo:** WireGuard

### 3.2 Aba **General**

| Campo | Valor |
|---|---|
| Name | `Captive-Portal-VPN` (qualquer nome — só identificação) |
| Zone | **VPN** (zona padrão de tunnels — geralmente já existe) |
| Mode | **Initiator** (vamos iniciar o handshake; nossa VPS é Responder/passive) |
| MTU | `1280` (padrão WG é 1420; baixar pra evitar fragmentação em ISPs com PPPoE) |

> Se aparecer toggle "Initiator/Responder" ou "Active/Passive", escolha
> **Initiator/Active**. Nosso lado é Responder/Passive — vocês iniciam.

### 3.3 Aba **WireGuard Settings**

| Campo | Valor |
|---|---|
| **Local IP / Address** | `198.18.0.X/32` ⚠️ (o que entregamos) |
| **Listen Port** | deixe em branco (modo client não escuta) |
| **Private Key** | Clique **Generate** ou **Generate New Key** ⚠️ <br>**NÃO cole nada externo** — a chave privada é gerada no firewall e nunca sai dele |
| **Public Key** | Aparece automaticamente após gerar a privada. **Copie** — vai colar no nosso painel |

### 3.4 Aba **Peer / Endpoint**

| Campo | Valor |
|---|---|
| **Endpoint Address** | `45.7.53.80` (IP da nossa VPS) |
| **Endpoint Port** | `51820` |
| **Peer Public Key** | <cole a Public Key da VPS que entregamos> |
| **Pre-shared Key** | <cole a PSK que entregamos> |
| **Allowed IPs** | `198.18.0.1/32` ⚠️ (só esse — não use `0.0.0.0/0`!) |
| **Persistent Keepalive** | `25` segundos |

> ⚠️ **Importante sobre Allowed IPs:** use apenas `198.18.0.1/32`. Se você
> botar `0.0.0.0/0`, todo o tráfego da Internet vai tentar sair pelo
> túnel — você perde Internet.

### 3.5 Aba **Advanced** (opcional)

- **Enable** ✅ marcado
- Demais campos: padrões

### 3.6 Salvar

Clica **Accept / Save**. A interface deve aparecer na lista com status
"Pending" inicialmente.

---

## 4. Liberar o tráfego de saída

A VPN é "client" então o SonicWall inicia conexão UDP saindo pra `45.7.53.80:51820`.
Em geral isso já passa pela regra default WAN→WAN, mas pra garantir:

1. Vá em **POLICY → Rules and Policies → Access Rules**
2. Verifique que existe regra **"Allow"** entre zona LAN/Wireless → WAN
   permitindo UDP. Se não, adicione:
   - **From:** zona da WireGuard (geralmente WAN ou Tunnel)
   - **To:** WAN
   - **Service:** UDP/51820
   - **Action:** Allow

---

## 5. Apontar o External Guest Auth pra usar a VPN

A última peça: configurar o External Guest Authentication pra usar o IP
de túnel quando montar o `mgmtBaseUrl` que envia pra nosso portal.

1. Vá em **OBJECT → Match Objects → Zones → WGUEST → Guest Services**
2. **Enable External Guest Authentication** = ✅
3. Clique **Configure** ao lado
4. **Web Server Address** = `http://45.7.53.80:29002` (do seu tenant) — não muda
5. Em algumas builds tem campo **"Auth URL Type"** ou **"Internal/External
   URL"**. Se aparecer, escolha **"Use Interface IP"** e selecione a
   **interface WireGuard** que criamos. Isso faz o `mgmtBaseUrl` no
   redirect ser `https://198.18.0.X:4443/` (o IP do túnel).

> Se NÃO há campo dessa seleção no seu firmware, **não tem problema** — nosso
> backend tem **override** que ignora o `mgmtBaseUrl` do redirect e força
> `https://198.18.0.X:4443/` (configurado no nosso painel admin no campo
> "LHM Mgmt LAN URL").

---

## 6. Liberar HTTPS management na interface VPN

Pra nossa VPS conseguir bater no `https://198.18.0.X:4443/lhmapi/...`,
o SonicWall precisa aceitar conexão HTTPS na interface WireGuard:

1. Vá em **DEVICE → Settings → Administration → Web Management**
2. Em **HTTPS Management Port**: `4443` (já é o padrão)
3. Em **Bind to interface(s) for HTTPS**: marque a interface WireGuard
   recém-criada
4. Salve

---

## 7. Confirmar no nosso painel

1. Volte pro nosso painel admin (no tenant onde habilitou VPN)
2. Cole a **Public Key** que o SonicWall gerou no campo correspondente
3. Clique **Salvar e Conectar**
4. O status muda pra "Aguardando primeira conexão"
5. Em ~30s deve mudar pra **"Conectado"** ✅

Se não conectar em 1–2min, ver seção **Troubleshooting** abaixo.

---

## 8. Troubleshooting

### 8.1 "Aguardando primeira conexão" não muda

- Verifique no SonicOS que a interface WireGuard está **Enabled = ON**
- Verifique a regra de Access Rule permitindo UDP/51820 outbound
- Veja em **MONITOR → Logs → System Logs** filtro "WireGuard" — procure mensagens
  de erro
- Verifique se você colocou o Public Key da VPS correto (não trocou com a sua)
- Verifique a PSK (PSK errada faz handshake falhar silenciosamente)
- Tente fazer ping do SonicWall pra `198.18.0.1` (em **MONITOR → Tools →
  Ping** com source = interface WireGuard)

### 8.2 "Conectado" mas LHM ainda não funciona

- No nosso painel, clique **"Testar POST LHM"** — vai te dizer se nossa
  VPS alcançou seu firewall
- Verifique que HTTPS Management está habilitado na interface WireGuard
  (passo 6 acima)
- Verifique que você não tem regra de firewall bloqueando `198.18.0.1` →
  `198.18.0.X:4443`

### 8.3 Internet do guest cai depois de habilitar a VPN

Provavelmente você botou `0.0.0.0/0` em **Allowed IPs**. Mude pra
`198.18.0.1/32`. A VPN é só pra controle, não pra rotear o tráfego dos guests.

### 8.4 Erro "WireGuard not supported in this firmware"

Atualize o firmware pra SonicOS 7.0+. Em SonicOS 6.x, WireGuard não existe
e essa integração não funciona.

### 8.5 "Não acho menu Tunnel-Interface"

Em alguns builds 7.x o menu fica em locais diferentes:

- **NETWORK → IPSec VPN → Tunnel Interfaces** (mais comum)
- **VPN → Settings → Tunnel Interface**
- **POLICY → Network → Tunnel-Interface**

Se ainda não achar, busque "Tunnel" no campo de busca global do SonicOS
(canto superior direito). NÃO use o menu **WireGuard → Site-to-Site** —
esse é pra outro caso (interconectar LANs).

---

## 9. Manutenção

### 9.1 Reiniciar o túnel

`Disable` → `Enable` na interface. WG levanta em 1–5s.

### 9.2 Trocar PSK (se for comprometida)

1. No nosso painel: clica **"Regenerar PSK"** no card VPN do tenant
2. Copie a nova PSK
3. No SonicOS, edite a interface WG → cole a nova PSK no campo Pre-shared Key
4. Salve. A VPN vai reconectar em <1min.

### 9.3 Trocar a chave privada do firewall (rotação anual recomendada)

1. No SonicOS, edite a interface WG → **Generate New Key**
2. Copia a Public Key nova
3. No nosso painel: aba VPN do tenant → seção "Atualizar chave pública" →
   cole a nova
4. VPN reconecta automaticamente

---

## 10. FAQ

**P: Por que não posso usar o `Endpoint = 45.7.53.80:51820` em produção?
   Não é menos seguro?**

R: A VPS é endpoint, não initator. O tráfego sai do **seu** firewall pra
   ela (outbound), criptografado com sua chave privada + PSK. Nada do
   tráfego dos guests passa pela VPN — só comandos de liberação. Não há
   exposição.

**P: Preciso liberar `198.18.0.0/15` em alguma policy interna do meu
    SonicWall?**

R: Não. O range só existe dentro do túnel. Pra interfaces LAN/WGUEST do
   seu firewall, esse range é "outro mundo".

**P: Quantos guests por mês são suportados?**

R: VPN não tem limite — só carrega comandos pequenos de auth. Limite é da
   sua licença SonicWall e da Zenvia (SMS).

**P: O cliente Wi-Fi precisa da VPN?**

R: Não. A VPN só liga firewall ↔ VPS. Cliente Wi-Fi nem sabe que existe.
