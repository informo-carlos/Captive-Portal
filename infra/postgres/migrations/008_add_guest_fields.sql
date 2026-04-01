-- =============================================
-- 008_add_guest_fields.sql
-- Campos adicionais para identificação do guest e suporte a múltiplos métodos de autenticação.
--
-- Motivação: o portal vai coletar nome do usuário além do telefone,
-- e no futuro suportará outros métodos de autenticação (email, WhatsApp, login social, etc.).
--
-- Estratégia de escalabilidade:
--   - auth_method: identifica qual método foi usado (sms, email, whatsapp, social, etc.)
--   - guest_name: campo fixo, sempre coletado independente do método
--   - guest_contact: JSONB flexível para dados extras do guest sem precisar de nova migration
--     Exemplos de uso futuro:
--       SMS:      { "phone": "+5511987654321" }
--       Email:    { "email": "user@example.com" }
--       WhatsApp: { "phone": "+5511987654321", "whatsapp_verified": true }
--       Social:   { "provider": "google", "provider_id": "abc123", "email": "..." }
-- =============================================

-- wifi_sessions: adiciona campos do guest
ALTER TABLE wifi_sessions
    ADD COLUMN guest_name    VARCHAR(100),
    ADD COLUMN auth_method   VARCHAR(20)   NOT NULL DEFAULT 'sms',
    ADD COLUMN guest_contact JSONB         NOT NULL DEFAULT '{}';

-- auth_attempts: adiciona campos do guest
ALTER TABLE auth_attempts
    ADD COLUMN guest_name    VARCHAR(100),
    ADD COLUMN auth_method   VARCHAR(20)   NOT NULL DEFAULT 'sms',
    ADD COLUMN guest_contact JSONB         NOT NULL DEFAULT '{}';

-- Índice para consultas por método de autenticação
CREATE INDEX idx_wifi_sessions_auth_method ON wifi_sessions (auth_method);
CREATE INDEX idx_auth_attempts_auth_method ON auth_attempts (auth_method);

-- Comentários
COMMENT ON COLUMN wifi_sessions.guest_name    IS 'Nome informado pelo usuário no portal (opcional, coletado no formulário)';
COMMENT ON COLUMN wifi_sessions.auth_method   IS 'Método de autenticação: sms | email | whatsapp | social (extensível)';
COMMENT ON COLUMN wifi_sessions.guest_contact IS 'Dados adicionais do guest em JSONB — flexível para qualquer método futuro';
COMMENT ON COLUMN auth_attempts.guest_name    IS 'Nome informado pelo usuário no portal (opcional)';
COMMENT ON COLUMN auth_attempts.auth_method   IS 'Método de autenticação usado na tentativa';
COMMENT ON COLUMN auth_attempts.guest_contact IS 'Dados adicionais do guest em JSONB';
