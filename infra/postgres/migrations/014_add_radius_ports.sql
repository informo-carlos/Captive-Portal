-- =============================================
-- 014_add_radius_ports.sql
-- Alocação de par de portas UDP por tenant RADIUS.
-- Spec: docs/spec-radius-auth.md §3.4, §7-B13
--
-- Range 18120-18219 (100 slots, espelha o HTTP 29000-29099).
-- Auth usa UDP `radius_auth_port` mapeada → 1812 interno do container.
-- Acct usa UDP `radius_acct_port` mapeada → 1813 interno do container.
-- CoA é outbound (backend envia pra NAS:3799), não precisa porta exposta.
-- =============================================

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS radius_auth_port INTEGER,
    ADD COLUMN IF NOT EXISTS radius_acct_port INTEGER;

-- Unique entre tenants — duas tenants não podem dividir a mesma porta UDP
-- na VPS (iriam disputar o bind).
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_radius_auth_port;
ALTER TABLE tenants ADD CONSTRAINT uq_tenants_radius_auth_port
    UNIQUE (radius_auth_port);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_radius_acct_port;
ALTER TABLE tenants ADD CONSTRAINT uq_tenants_radius_acct_port
    UNIQUE (radius_acct_port);

-- Range válido, NULL quando auth_mode != 'radius'.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_radius_auth_port_range;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_radius_auth_port_range
    CHECK (radius_auth_port IS NULL OR radius_auth_port BETWEEN 18120 AND 18219);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_radius_acct_port_range;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_radius_acct_port_range
    CHECK (radius_acct_port IS NULL OR radius_acct_port BETWEEN 18120 AND 18219);

-- Radius tenant SEMPRE tem par de portas. Tenant não-radius sempre tem null.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_radius_ports_consistent;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_radius_ports_consistent
    CHECK (
        (auth_mode != 'radius' AND radius_auth_port IS NULL AND radius_acct_port IS NULL)
        OR
        (auth_mode = 'radius' AND radius_auth_port IS NOT NULL AND radius_acct_port IS NOT NULL)
    );

COMMENT ON COLUMN tenants.radius_auth_port IS
    'Porta UDP externa alocada pro Access-Request (range 18120-18219). NULL pra tenants não-RADIUS. Mapeia pra 1812 interno do container.';
COMMENT ON COLUMN tenants.radius_acct_port IS
    'Porta UDP externa alocada pro Accounting (range 18120-18219). NULL pra tenants não-RADIUS. Mapeia pra 1813 interno do container.';
