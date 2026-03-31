-- =============================================
-- 006_create_audit_logs.sql
-- Log de auditoria de todas as ações admin
-- Tabela imutável — apenas INSERT, nunca UPDATE ou DELETE
-- =============================================

CREATE TABLE audit_logs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   UUID            NOT NULL,
    action          VARCHAR(100)    NOT NULL,
    payload         JSONB           NOT NULL DEFAULT '{}',
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_admin_user
        FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_audit_logs_admin_user_id ON audit_logs (admin_user_id);
CREATE INDEX idx_audit_logs_action        ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at    ON audit_logs (created_at);

COMMENT ON TABLE  audit_logs            IS 'Registro imutável de toda ação no painel admin — somente superadmin visualiza';
COMMENT ON COLUMN audit_logs.action     IS 'login | tenant_created | tenant_updated | tenant_deactivated | tenant_deleted | user_created | user_updated | user_deleted';
COMMENT ON COLUMN audit_logs.payload    IS 'Dados contextuais da ação (ex: { tenant_id, name, port })';
