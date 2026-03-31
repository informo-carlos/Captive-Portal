-- =============================================
-- 001_create_tenants.sql
-- Tabela principal de clientes (tenants)
-- =============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)    NOT NULL,
    port            INTEGER         NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'active',
    sonicwall_config JSONB          NOT NULL DEFAULT '{}',
    zenvia_token    TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT uq_tenants_name      UNIQUE (name),
    CONSTRAINT uq_tenants_port      UNIQUE (port),
    CONSTRAINT chk_tenants_port     CHECK (port BETWEEN 29000 AND 29999),
    CONSTRAINT chk_tenants_status   CHECK (status IN ('active', 'inactive', 'deleted'))
);

CREATE INDEX idx_tenants_status     ON tenants (status);
CREATE INDEX idx_tenants_created_at ON tenants (created_at);

COMMENT ON TABLE  tenants                    IS 'Clientes do captive portal — cada tenant roda em container isolado';
COMMENT ON COLUMN tenants.sonicwall_config   IS 'JSONB criptografado com AES-256 no app — contém host, user, password, firmware, mode';
COMMENT ON COLUMN tenants.zenvia_token       IS 'Token Zenvia criptografado com AES-256 no app';
COMMENT ON COLUMN tenants.port               IS 'Porta do container do tenant (29000-29999) — imutável após criação';
COMMENT ON COLUMN tenants.deleted_at         IS 'Soft delete — preenchido quando superadmin deleta o tenant';
