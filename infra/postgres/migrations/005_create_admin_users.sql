-- =============================================
-- 005_create_admin_users.sql
-- Usuários do painel admin
-- =============================================

CREATE TABLE admin_users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    role            VARCHAR(50)     NOT NULL,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT uq_admin_users_email     UNIQUE (email),
    CONSTRAINT chk_admin_users_role     CHECK (role IN ('superadmin', 'admin', 'viewer'))
);

CREATE INDEX idx_admin_users_role ON admin_users (role);

COMMENT ON TABLE  admin_users                   IS 'Usuários do painel de gestão — protegidos por JWT';
COMMENT ON COLUMN admin_users.password_hash     IS 'Hash bcrypt (12 rounds) — NUNCA retornar em responses da API';
COMMENT ON COLUMN admin_users.deleted_at        IS 'Soft delete — superadmin não pode deletar a si mesmo';
