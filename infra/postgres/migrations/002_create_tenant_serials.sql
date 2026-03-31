-- =============================================
-- 002_create_tenant_serials.sql
-- Seriais SonicWall por tenant (suporte a HA pair)
-- =============================================

CREATE TABLE tenant_serials (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID            NOT NULL,
    serial      VARCHAR(50)     NOT NULL,
    role        VARCHAR(20)     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tenant_serials_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT uq_tenant_serials_serial
        UNIQUE (serial),
    CONSTRAINT chk_tenant_serials_role
        CHECK (role IN ('primary', 'secondary'))
);

CREATE INDEX idx_tenant_serials_tenant_id ON tenant_serials (tenant_id);

COMMENT ON TABLE  tenant_serials            IS 'Seriais SonicWall vinculados a cada tenant — máximo 2 (HA pair)';
COMMENT ON COLUMN tenant_serials.serial     IS 'Serial do firewall SonicWall (ex: SN-ABC123) — único no sistema inteiro';
COMMENT ON COLUMN tenant_serials.role       IS 'primary = firewall principal, secondary = HA pair';
