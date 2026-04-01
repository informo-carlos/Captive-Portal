# Planejamento Futuro — Captive Portal

> Ideias, decisões técnicas e roadmap de evolução do projeto.
> Atualizar este documento conforme novas decisões forem tomadas.

---

## 1. Múltiplos métodos de autenticação

**Status:** Preparado no banco (migration 008), schema de validação criado.

O portal hoje usa SMS (Zenvia) como único método de autenticação.
A arquitetura já está pronta para suportar outros métodos sem migration adicional:

| Método | auth_method | guest_contact esperado | Status |
|--------|-------------|----------------------|--------|
| SMS | `sms` | `{ "phone": "+55..." }` | Implementado |
| Email | `email` | `{ "email": "user@..." }` | Planejado |
| WhatsApp | `whatsapp` | `{ "phone": "+55...", "whatsapp_verified": true }` | Planejado |
| Login social | `social` | `{ "provider": "google", "provider_id": "...", "email": "..." }` | Planejado |

**Como adicionar um novo método:**
1. Adicionar o validator em `apps/backend/src/services/guest-contact-schema.ts`
2. Criar o serviço de envio (ex: `services/email-otp.ts`)
3. Atualizar o `request-otp` para aceitar o novo `auth_method`
4. Zero migrations — tudo usa as mesmas colunas (`auth_method`, `guest_contact` JSONB)

**Validação do JSONB:** feita na camada de aplicação (Fastify), não no banco.
Cada `auth_method` tem um schema esperado — o backend rejeita payloads inválidos antes de inserir.

---

## 2. Duração de sessão Wi-Fi configurável por tenant

**Status:** Implementado no banco (migration 009).

Cada tenant define quanto tempo seus usuários ficam conectados após autenticação OTP.

| Coluna | Tipo | Default | Constraint |
|--------|------|---------|------------|
| `tenants.session_duration_minutes` | INTEGER NOT NULL | 480 (8h) | CHECK 15–1440 (15 min a 24h) |

**Exemplos de uso por cliente:**
- Café / restaurante: 120 min (2h)
- Escritório / coworking: 480 min (8h)
- Hotel: 720 min (12h)
- Evento: 1440 min (24h)

**Onde é usado no código:**

| Componente | O que fazer |
|---|---|
| **B4 — CRUD tenants** | Incluir `session_duration_minutes` no POST/PUT. Validar range 15–1440. |
| **B6 — verify-otp** | Buscar o valor do tenant no banco. Calcular `expires_at = now() + duration`. Retornar `expires_in` real na response. |
| **B7 — SonicWall** | Passar `sessionMinutes` real para `releaseAccess()` (não usar default 480). |
| **F5 — Admin frontend** | Campo no modal de criar/editar tenant (input numérico com label "Duração da sessão"). |
| **F2/F3 — Portal frontend** | Tela de sucesso exibe o tempo real vindo da response, não hardcoded "8 horas". |

**Importante:** O portal backend lê o `session_duration_minutes` do banco usando o `TENANT_ID` do env. Não precisa de variável de ambiente extra.

---

## 3. Campos extras do guest no formulário do portal (migration 008)

**Status:** Coluna `guest_name` criada (migration 008).

O formulário do portal vai coletar além do telefone:
- **Nome** — já suportado (`guest_name`)
- **Campos extras futuros** — vão no `guest_contact` JSONB (ex: CPF para compliance, empresa para coworking, etc.)

Não precisa de nova migration para adicionar campos no formulário — basta atualizar o frontend e o schema de validação.

---

## 4. Criptografia: CBC → GCM (futura melhoria)

**Status:** Usando AES-256-CBC (seguro, funcional).

Para projetos futuros ou quando houver revisão de segurança, considerar migrar para AES-256-GCM:
- GCM adiciona tag de autenticação (integridade)
- Previne ataques de Padding Oracle
- Não é necessário agora — CBC atende perfeitamente ao cenário atual (dados lidos direto do banco)

**Se migrar:** criar nova migration para re-criptografar os dados existentes.

---

## 5. Infraestrutura — VMs e deploy

**Status:** Planejado para após B6 (fluxo OTP completo).

### Arquitetura recomendada (MVP)

| VM | Serviços | Specs sugeridas |
|---|---|---|
| **VM1 — Infra + Admin** | Postgres 16, Redis 7, Nginx, admin-backend, admin-frontend | 4 vCPU, 8GB RAM, 100GB SSD |
| **VM2 — Portais** | Containers dos portais (backend + frontend por tenant) | 2 vCPU, 4GB RAM, 50GB SSD |

### Por que separar?
- **Isolamento:** tenant com alto tráfego não derruba banco nem admin
- **Escala:** adicionar VM3, VM4 para mais tenants
- **Backup:** VM1 é a crítica — backup diário do volume Postgres

### Escala futura (10+ tenants)
- VM1 dedicada ao banco (Postgres + Redis)
- VM2 para admin + Nginx (reverse proxy central)
- VM3+ como workers de portais (load balance por tenant)
- 50+ tenants → considerar Kubernetes

### Quando subir as VMs?
- **Após B6** — fluxo OTP completo funcionando
- Testar end-to-end em staging antes de integrar com SonicWall na B7
- SSL (certbot) configurar na VM1 junto com o Nginx

---

## 6. Melhorias no pipeline de deploy (futuro)

- CI/CD com GitHub Actions (build + test + push image)
- Auto-provisioning de tenants via API (criar container + nginx config automaticamente)
- Monitoramento: Grafana + Prometheus nos containers
- pg_partman para criação automática de partitions do wifi_sessions
