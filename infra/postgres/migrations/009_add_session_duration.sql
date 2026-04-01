-- =============================================
-- 009_add_session_duration.sql
-- Tempo de sessão Wi-Fi configurável por tenant.
--
-- Motivação: cada cliente quer definir quanto tempo seus usuários
-- ficam conectados após autenticação. Ex:
--   - Tenant A (café): 2 horas (120 min)
--   - Tenant B (hotel): 8 horas (480 min)
--   - Tenant C (evento): 12 horas (720 min)
--
-- O valor é usado pelo portal backend em verify-otp:
--   1. Calcula expires_at = now() + session_duration_minutes
--   2. Passa sessionMinutes para releaseAccess() do SonicWall
--   3. Retorna expires_in (em segundos) na response para o frontend
--
-- Default: 480 (8 horas) — mantém compatibilidade com o que já existia.
-- =============================================

ALTER TABLE tenants
    ADD COLUMN session_duration_minutes INTEGER NOT NULL DEFAULT 480;

-- Constraint para evitar valores absurdos (mínimo 15 min, máximo 24h)
ALTER TABLE tenants
    ADD CONSTRAINT chk_tenants_session_duration
    CHECK (session_duration_minutes BETWEEN 15 AND 1440);

COMMENT ON COLUMN tenants.session_duration_minutes
    IS 'Duração da sessão Wi-Fi em minutos após autenticação. Configurável por tenant. Default: 480 (8h). Min: 15, Max: 1440 (24h).';
