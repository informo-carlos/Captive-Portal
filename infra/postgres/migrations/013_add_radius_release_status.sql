-- =============================================
-- 013_add_radius_release_status.sql
-- Estende wifi_sessions pra acomodar liberações RADIUS.
-- Spec: docs/spec-radius-auth.md §5, §7-B12
-- =============================================

-- 1) sonicwall_mode agora aceita 'radius' além de 'rest' e 'lhm'.
--    Mantemos o nome da coluna (sonicwall_mode) pra evitar quebrar queries/
--    relatórios existentes — a coluna representa o "mode" genérico da
--    Strategy que liberou a sessão. Fica com nome legacy, semântica atual.
ALTER TABLE wifi_sessions DROP CONSTRAINT IF EXISTS chk_wifi_sessions_mode;
ALTER TABLE wifi_sessions ADD CONSTRAINT chk_wifi_sessions_mode
    CHECK (sonicwall_mode IN ('rest', 'lhm', 'radius'));

COMMENT ON COLUMN wifi_sessions.sonicwall_mode IS
    'Modo usado pra liberar: rest (SonicOS API), lhm (Lightweight Hotspot Messaging) ou radius (MAB + CoA).';

-- 2) release_status registra se a liberação foi completa (active) ou se
--    o CoA falhou (degraded). Em degraded o usuário AINDA navega — o
--    firewall re-MAB por conta própria via timer interno em até alguns
--    minutos — mas operador sabe que o disconnect remoto ficou travado.
ALTER TABLE wifi_sessions
    ADD COLUMN IF NOT EXISTS release_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE wifi_sessions DROP CONSTRAINT IF EXISTS chk_wifi_sessions_release_status;
ALTER TABLE wifi_sessions ADD CONSTRAINT chk_wifi_sessions_release_status
    CHECK (release_status IN ('active', 'degraded'));

COMMENT ON COLUMN wifi_sessions.release_status IS
    'active = liberação ok; degraded = CoA falhou 3x (usuário navega mesmo assim, operador precisa investigar).';
