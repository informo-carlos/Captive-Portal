# Spec — Auth API (Portal de Autenticação)

> Este documento é a fonte de verdade para os endpoints do portal captivo.
> Qualquer implementação deve seguir exatamente os contratos aqui definidos.
> Ao usar o Claude Code: `claude "implemente seguindo exatamente /docs/spec-auth-api.md"`

---

## Visão geral

O portal backend roda em containers isolados por tenant.
Cada container atende uma porta específica (ex: 29000, 29001…).
Variáveis de ambiente do container definem qual tenant é aquele e quais seriais são aceitos.

### Variáveis de ambiente obrigatórias por container

```env
TENANT_ID=uuid-do-tenant              # UUID do tenant no banco
ALLOWED_SERIALS=SN-ABC123,SN-ABC124   # seriais aceitos (vírgula = HA pair)
PORT=3000                             # porta interna do container (sempre 3000)
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379
ZENVIA_TOKEN=...
SONICWALL_HOST=192.168.1.1
SONICWALL_USER=admin
SONICWALL_PASS=...
SONICWALL_FIRMWARE=7                  # versão do firmware (influencia endpoints)
SONICWALL_MODE=rest                   # "rest" (SonicOS API) ou "lhm" (Lightweight Hotspot Messaging)
SONICWALL_LHM_PORT=4043               # apenas necessário se SONICWALL_MODE=lhm
SONICWALL_GUEST_SERVICE_USER=         # conta de serviço — apenas necessário se SONICWALL_MODE=lhm
SONICWALL_GUEST_SERVICE_PASS=         # senha da conta de serviço — apenas se SONICWALL_MODE=lhm
JWT_SECRET=...                        # compartilhado com admin backend
```

---

## Middleware global — serial-guard

Executa em TODAS as rotas antes de qualquer handler.

### Como funciona

O SonicWall injeta o serial no redirect via query param ou header.
O middleware lê `X-Sonicwall-Serial` (header) OU `?serial=` (query param).

```
Precedência: header > query param
```

### Lógica

```
serial_recebido = req.headers['x-sonicwall-serial'] ?? req.query.serial

se serial_recebido está em ALLOWED_SERIALS (split por vírgula):
  req.tenantId = TENANT_ID do env
  próximo middleware

senão:
  retorna 403 com payload de erro (ver abaixo)
```

### Resposta de erro — serial não autorizado

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "unauthorized_firewall",
  "message": "Este dispositivo não está autorizado a usar este portal.",
  "code": 403
}
```

O frontend exibe uma tela de erro amigável ao receber esse payload.

---

## Endpoints

### POST /auth/request-otp

Solicita envio de OTP por SMS.

#### Request

```http
POST /auth/request-otp
Content-Type: application/json
X-Sonicwall-Serial: SN-ABC123

{
  "phone": "11987654321",
  "mac": "AA:BB:CC:DD:EE:FF",
  "ip": "192.168.1.100"
}
```

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| phone | string | sim | Telefone BR (apenas dígitos, 10 ou 11 chars) |
| mac | string | sim | MAC do cliente (formato AA:BB:CC:DD:EE:FF) |
| ip | string | sim | IP do cliente na rede |

#### Lógica de execução

```
1. serial-guard valida o serial (middleware global)
2. Normaliza phone para E.164: +55 + DDD + número
3. Verifica rate limit no Redis:
   chave: ratelimit:{tenantId}:{phone_e164}
   máximo: 3 tentativas em 600 segundos
   se excedido: retorna 429
4. Gera OTP: 6 dígitos aleatórios (crypto.randomInt)
5. Salva no Redis:
   chave: otp:{tenantId}:{phone_e164}
   valor: { otp, mac, ip, createdAt }
   TTL: 300 segundos (5 minutos)
6. Incrementa contador de rate limit no Redis
7. Envia SMS via Zenvia (ver spec-zenvia.md)
8. Registra em auth_attempts:
   { tenant_id, phone_e164, mac, ip, status: 'otp_sent', created_at }
9. Retorna 200
```

#### Responses

```http
HTTP/1.1 200 OK
{
  "message": "Código enviado por SMS.",
  "expires_in": 300
}
```

```http
HTTP/1.1 422 Unprocessable Entity
{
  "error": "invalid_phone",
  "message": "Número de telefone inválido.",
  "code": 422
}
```

```http
HTTP/1.1 429 Too Many Requests
{
  "error": "rate_limit",
  "message": "Muitas tentativas. Aguarde 10 minutos.",
  "retry_after": 600,
  "code": 429
}
```

```http
HTTP/1.1 500 Internal Server Error
{
  "error": "sms_failed",
  "message": "Não foi possível enviar o SMS. Tente novamente.",
  "code": 500
}
```

---

### POST /auth/verify-otp

Valida o OTP e libera o acesso no SonicWall.

#### Request

```http
POST /auth/verify-otp
Content-Type: application/json
X-Sonicwall-Serial: SN-ABC123

{
  "phone": "11987654321",
  "otp": "847291"
}
```

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| phone | string | sim | Mesmo telefone usado em request-otp |
| otp | string | sim | 6 dígitos recebidos por SMS |

#### Lógica de execução

```
1. serial-guard valida o serial (middleware global)
2. Normaliza phone para E.164
3. Busca no Redis: otp:{tenantId}:{phone_e164}
   se não encontrado: retorna 404 (expirado ou não solicitado)
4. Compara otp recebido com otp do Redis (comparação de string simples)
   se inválido:
     incrementa contador de tentativas erradas:
       chave: otp_attempts:{tenantId}:{phone_e164}  TTL: 300s
     se >= 3 tentativas erradas: deleta o OTP do Redis e retorna 422
     senão: retorna 422 com tentativas_restantes
5. OTP válido:
   a. Deleta chave do Redis (one-time use)
   b. Chama SonicOS API para liberar mac + ip (ver spec-sonicwall.md)
   c. Registra em wifi_sessions:
      { tenant_id, phone_e164, mac_address, ip_address,
        auth_at: now(), expires_at: now()+8h,
        sonicwall_raw: JSON.stringify(sonicwall_response),
        year_month: YYYYMM como int }
   d. Atualiza auth_attempts com status: 'success'
6. Retorna 200
```

#### Responses

```http
HTTP/1.1 200 OK
{
  "message": "Acesso liberado. Você já pode navegar.",
  "expires_in": 28800
}
```

```http
HTTP/1.1 404 Not Found
{
  "error": "otp_not_found",
  "message": "Código expirado ou não solicitado. Solicite um novo código.",
  "code": 404
}
```

```http
HTTP/1.1 422 Unprocessable Entity
{
  "error": "invalid_otp",
  "message": "Código inválido.",
  "attempts_remaining": 2,
  "code": 422
}
```

```http
HTTP/1.1 422 Unprocessable Entity
{
  "error": "otp_blocked",
  "message": "Muitas tentativas incorretas. Solicite um novo código.",
  "code": 422
}
```

```http
HTTP/1.1 502 Bad Gateway
{
  "error": "sonicwall_failed",
  "message": "Autenticação válida, mas falha ao liberar acesso. Contate o suporte.",
  "code": 502
}
```

---

### GET /health

Health check para o Docker e Nginx.

```http
HTTP/1.1 200 OK
{
  "status": "ok",
  "tenant_id": "uuid-do-tenant",
  "port": 29000
}
```

---

## Validações globais

- Todos os endpoints retornam `Content-Type: application/json`
- Campos faltando retornam `400 Bad Request` com `{ "error": "missing_fields", "fields": ["campo1"] }`
- Body não é JSON válido retorna `400 Bad Request` com `{ "error": "invalid_json" }`

---

## Serviço Zenvia — contrato interno

```typescript
// services/zenvia.ts
interface SendSmsParams {
  to: string;       // E.164 sem o +
  otp: string;      // 6 dígitos
  tenantName: string;
}

// Mensagem enviada:
// "Seu código de acesso Wi-Fi {tenantName}: {otp}. Válido por 5 minutos."

// Endpoint Zenvia: POST https://api.zenvia.com/v2/channels/sms/messages
// Header: X-API-Token: {ZENVIA_TOKEN}
```

---

## Serviço SonicWall — contrato interno (padrão Strategy)

O serviço SonicWall é isolado do resto do sistema. O `verify-otp.ts` sempre chama
`releaseAccess()` — não sabe e não precisa saber qual modo está ativo.

### Interface única (index.ts)

```typescript
// services/sonicwall/index.ts

interface ReleaseAccessParams {
  mac: string;        // formato AA:BB:CC:DD:EE:FF
  ip: string;         // IP do cliente na rede
  phone: string;      // E.164 — para registro/auditoria
  sessionMinutes?: number; // duração da sessão (default: 480 = 8h)
}

interface ReleaseAccessResult {
  success: boolean;
  raw: unknown;       // response bruta do SonicWall — salva em wifi_sessions.sonicwall_raw
  mode: 'rest' | 'lhm';
}

// Seleciona a estratégia com base na variável de ambiente SONICWALL_MODE
// "rest" → rest-api.ts  |  "lhm" → lhm.ts
export async function releaseAccess(params: ReleaseAccessParams): Promise<ReleaseAccessResult>
```

### Estrutura de arquivos

```
services/sonicwall/
├── index.ts        ← exporta releaseAccess(), seleciona estratégia via SONICWALL_MODE
├── rest-api.ts     ← implementação via SonicOS REST API (semana 1)
└── lhm.ts          ← implementação via LHM porta 4043 (fase futura — criar stub agora)
```

### Estratégia REST API (rest-api.ts) — implementar na semana 1

```
1. Autenticar na SonicOS API: POST /api/sonicos/auth com user/pass
2. Obter session token
3. POST no endpoint de liberação de IP/MAC (endpoint varia por firmware):
   - Firmware 7 (Gen7): POST /api/sonicos/user/login
   - Firmware 6 (Gen6): POST /api/sonicos/user/authenticate
4. Timeout: 10 segundos
5. Retornar { success: true, raw: response, mode: 'rest' }
6. Em caso de erro: { success: false, raw: error, mode: 'rest' }
```

### Estratégia LHM (lhm.ts) — stub na semana 1, implementar depois

```
O LHM (Lightweight Hotspot Messaging) é o protocolo usado quando o SonicWall
está configurado com "External Guest Authentication".

Nesse modo:
- O SonicWall injeta parâmetros na URL do redirect (sessionId, mac, ip, etc.)
- O portal backend usa esses parâmetros para se comunicar de volta via porta 4043
- É necessário um usuário com perfil "Guest Services" no SonicWall (o guest_service)
  — essa conta é usada pelo backend para assinar as requisições LHM

Na semana 1: criar lhm.ts como stub que loga um aviso e lança erro descritivo.
Implementação real fica para quando um cliente precisar desse modo.
```

### Como o `verify-otp.ts` chama o serviço

```typescript
import { releaseAccess } from '../services/sonicwall'

const result = await releaseAccess({ mac, ip, phone })

if (!result.success) {
  // Registra o raw para diagnóstico mas não expõe ao usuário
  logger.error({ raw: result.raw, mode: result.mode }, 'sonicwall_release_failed')
  throw { statusCode: 502, error: 'sonicwall_failed' }
}

// Salva result.raw em wifi_sessions.sonicwall_raw
// Salva result.mode em wifi_sessions (saber qual modo foi usado)
```

---

## Notas de implementação

- Usar `fastify-plugin` para o serial-guard ser aplicado globalmente
- Usar `@fastify/rate-limit` apenas como fallback — o rate limit principal é via Redis para funcionar entre restarts
- O campo `year_month` em `wifi_sessions` é calculado no backend como `parseInt(format(new Date(), 'yyyyMM'))`
- Nunca logar o OTP em produção — apenas `otp_sent: true`
- Timeout para chamada SonicOS API: 10 segundos. Se timeout, retornar 502.
- O campo `sonicwall_mode` deve ser adicionado à tabela `wifi_sessions` para rastrear qual estratégia foi usada em cada autenticação
