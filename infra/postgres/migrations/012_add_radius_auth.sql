-- =============================================
-- 012_add_radius_auth.sql
-- Terceiro modo de autenticação: RADIUS + MAB + CoA (multi-vendor).
-- Spec: docs/spec-radius-auth.md
-- =============================================

-- auth_mode escolhe entre integração SonicWall (REST/LHM) ou RADIUS universal.
-- Default 'sonicwall' pra não quebrar tenants existentes — eles continuam com
-- o fluxo atual sem nenhuma mudança de comportamento.
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'sonicwall';

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_auth_mode;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_auth_mode
    CHECK (auth_mode IN ('sonicwall', 'radius'));

-- radius_config segue o padrão de sonicwall_config: JSONB opaco com o
-- shared_secret criptografado AES-256 no app (services/crypto.ts).
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS radius_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenants.auth_mode     IS 'Modo de autenticação: sonicwall (REST/LHM) ou radius (MAB + CoA).';
COMMENT ON COLUMN tenants.radius_config IS 'Config RADIUS por tenant — shared_secret (criptografado AES-256), coa_port, session_timeout_sec, nas_ip_allowlist. Opaco pra DB: interpretação fica no app.';

-- =============================================
-- radius_sessions — auditoria do Accounting (RFC 2866).
-- Uma linha por sessão RADIUS do firewall. Ligada a wifi_sessions por
-- (tenant_id, mac) pra correlacionar OTP humano → bytes trafegados.
-- =============================================
CREATE TABLE IF NOT EXISTS radius_sessions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mac             TEXT            NOT NULL,
    ip              TEXT,
    nas_ip          TEXT            NOT NULL,
    session_id      TEXT            NOT NULL,
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped_at      TIMESTAMPTZ,
    bytes_in        BIGINT,
    bytes_out       BIGINT,
    terminate_cause TEXT,

    CONSTRAINT uq_radius_sessions_nas_session UNIQUE (tenant_id, nas_ip, session_id)
);

CREATE INDEX IF NOT EXISTS idx_radius_sessions_tenant_mac_started
    ON radius_sessions (tenant_id, mac, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_radius_sessions_active
    ON radius_sessions (tenant_id, stopped_at)
    WHERE stopped_at IS NULL;

COMMENT ON TABLE  radius_sessions                  IS 'Accounting RADIUS por sessão (RFC 2866) — start/interim/stop vindos do NAS.';
COMMENT ON COLUMN radius_sessions.session_id       IS 'Acct-Session-Id enviado pelo NAS. Único por (tenant, nas_ip).';
COMMENT ON COLUMN radius_sessions.nas_ip           IS 'IP do firewall/AP que enviou o accounting (atributo NAS-IP-Address).';
COMMENT ON COLUMN radius_sessions.bytes_in         IS 'Acct-Input-Octets (tráfego do cliente pra rede).';
COMMENT ON COLUMN radius_sessions.bytes_out        IS 'Acct-Output-Octets (tráfego da rede pro cliente).';
COMMENT ON COLUMN radius_sessions.terminate_cause  IS 'Acct-Terminate-Cause — ex: User-Request, Session-Timeout, Admin-Reset, NAS-Reboot.';
