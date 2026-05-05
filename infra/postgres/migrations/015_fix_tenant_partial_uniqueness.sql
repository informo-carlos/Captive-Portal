-- =============================================
-- 015_fix_tenant_partial_uniqueness.sql
-- Troca constraints UNIQUE plenas por partial unique indexes
-- excluindo soft-deletes — alinha o DB com a lógica do app.
--
-- Bug que motivou: ao deletar um tenant (soft-delete via deleted_at),
-- a row continua no banco. Como as constraints UNIQUE eram plenas,
-- a porta/serial/nome ficavam "presos" mesmo o tenant não estando
-- ativo. O backend faz check com `WHERE deleted_at IS NULL` antes de
-- inserir, então a checagem do app passava, mas o INSERT falhava
-- com "duplicate key value violates unique constraint" — 500 inesperado.
--
-- Após esta migration:
--   - múltiplas rows soft-deleted podem dividir o mesmo valor
--   - apenas UMA row ativa pode ter aquele valor (mantém invariante)
--   - DB e app ficam coerentes
--
-- Spec: docs/spec-admin-api.md (soft-delete) + relato em produção
-- (erro 23505 ao recriar tenant em porta de tenant deletado).
-- =============================================

-- ─── tenants.port ───────────────────────────────────
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_port;
DROP INDEX IF EXISTS uq_tenants_port_active;
CREATE UNIQUE INDEX uq_tenants_port_active
    ON tenants (port)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX uq_tenants_port_active IS
    'Garante porta única apenas entre tenants ativos (não soft-deletados).';

-- ─── tenants.name ───────────────────────────────────
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_name;
DROP INDEX IF EXISTS uq_tenants_name_active;
CREATE UNIQUE INDEX uq_tenants_name_active
    ON tenants (name)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX uq_tenants_name_active IS
    'Garante nome único apenas entre tenants ativos (não soft-deletados).';

-- ─── tenants.radius_auth_port (migration 014) ──────
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_radius_auth_port;
DROP INDEX IF EXISTS uq_tenants_radius_auth_port_active;
CREATE UNIQUE INDEX uq_tenants_radius_auth_port_active
    ON tenants (radius_auth_port)
    WHERE deleted_at IS NULL AND radius_auth_port IS NOT NULL;

COMMENT ON INDEX uq_tenants_radius_auth_port_active IS
    'Garante par UDP de Auth único apenas entre tenants ativos não-soft-deletados.';

-- ─── tenants.radius_acct_port (migration 014) ──────
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_radius_acct_port;
DROP INDEX IF EXISTS uq_tenants_radius_acct_port_active;
CREATE UNIQUE INDEX uq_tenants_radius_acct_port_active
    ON tenants (radius_acct_port)
    WHERE deleted_at IS NULL AND radius_acct_port IS NOT NULL;

COMMENT ON INDEX uq_tenants_radius_acct_port_active IS
    'Garante par UDP de Accounting único apenas entre tenants ativos não-soft-deletados.';
