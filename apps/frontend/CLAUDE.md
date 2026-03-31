# CLAUDE.md — apps/frontend (Portal Captivo UI)

> Contexto específico do portal. Leia também o CLAUDE.md da raiz.

## O que este app faz

Interface web que o usuário Wi-Fi vê ao ser redirecionado pelo SonicWall.
Mobile-first — a maioria dos usuários acessa pelo celular.

## Rotas

| Rota | Tela |
|------|------|
| `/` | Input de celular com máscara BR |
| `/otp` | Input de 6 dígitos + timer countdown |
| `/success` | Confirmação de acesso liberado |
| `/error` | Serial não autorizado (403 do backend) |

## Componentes principais

- `PhoneInput` — máscara (11) 9 9999-9999, validação de DDD e comprimento
- `OtpInput` — 6 campos separados com auto-focus entre eles
- `CountdownTimer` — 5:00 regressivo, exibe botão "Reenviar" ao zerar

## Cliente HTTP

lib/api.ts — wrapper sobre fetch. Lida com todos os erros da spec:
invalid_phone, rate_limit, invalid_otp, otp_blocked, otp_not_found, sonicwall_failed.

## Variáveis de ambiente

NEXT_PUBLIC_API_URL=http://localhost:3000

## Design

- Tailwind CSS, mobile-first
- Fluxo linear de 3 passos sem navegação complexa
- Mensagens de erro em linha, nunca em alert()
