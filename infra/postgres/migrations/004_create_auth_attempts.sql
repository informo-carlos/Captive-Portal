-- =============================================
-- 004_create_auth_attempts.sql
-- Tentativas de autenticação (sucesso e falha)
-- Para auditoria e analytics de rate limiting
-- =============================================

CREATE TABLE auth_attempts (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID            NOT NULL,
    phone_e164  VARCHAR(20)     NOT NULL,
    mac_address VARCHAR(17),
    ip_address  VARCHAR(45),
    status      VARCHAR(50)     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_auth_attempts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT chk_auth_attempts_status
        CHECK (status IN ('otp_sent', 'success', 'invalid_otp', 'otp_blocked', 'rate_limit_exceeded'))
);

CREATE INDEX idx_auth_attempts_tenant_created ON auth_attempts (tenant_id, created_at);
CREATE INDEX idx_auth_attempts_phone          ON auth_attempts (phone_e164);

COMMENT ON TABLE  auth_attempts             IS 'Todas as tentativas de OTP — para auditoria e cálculo de success_rate';
COMMENT ON COLUMN auth_attempts.status      IS 'otp_sent | success | invalid_otp | otp_blocked | rate_limit_exceeded';
COMMENT ON COLUMN auth_attempts.phone_e164  IS 'Telefone normalizado E.164 — protegido por LGPD';
