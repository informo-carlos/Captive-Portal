# CLAUDE.md — apps/admin (Painel Admin UI)

> Contexto específico do admin. Leia também o CLAUDE.md da raiz.

## O que este app faz

Painel web para gerenciar tenants, usuários admin, sessões Wi-Fi e relatórios.
Desktop-first — usado internamente pela equipe.

## Estrutura de rotas (Next.js App Router)

app/
├── login/page.tsx                  # Pública
└── (dashboard)/                    # Route group — protegido, exige auth
    ├── layout.tsx                  # Sidebar + header + proteção de rota
    ├── dashboard/page.tsx          # Métricas + gráfico
    ├── tenants/page.tsx            # Lista + modal criar/editar
    ├── tenants/[id]/page.tsx       # Detalhes do tenant
    ├── sessions/page.tsx           # Tabela de sessões com filtros
    ├── users/page.tsx              # Superadmin only
    └── audit/page.tsx              # Superadmin only

## Auth

lib/auth.ts — hook useAuth() expõe { user, role, token, logout }.
Proteção no (dashboard)/layout.tsx — redireciona para /login se não autenticado.

## Proteção por role

Usar componente RequireRole em páginas restritas.
Em 401 qualquer chamada de API: redirecionar para /login e limpar token.

## Componentes reutilizáveis

- DataTable — tabela com paginação, loading e empty state
- TenantModal — modal criar/editar tenant com todos os campos da spec
- UserModal — modal criar/editar usuário admin

## Variáveis de ambiente

NEXT_PUBLIC_API_URL=http://localhost:8000
