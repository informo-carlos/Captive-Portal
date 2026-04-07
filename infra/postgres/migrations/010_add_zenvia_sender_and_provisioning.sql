-- =============================================
-- 010_add_zenvia_sender_and_provisioning.sql
-- Adiciona o sender da Zenvia (criptografado) e os campos de
-- provisionamento automático de container por tenant.
-- =============================================

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS zenvia_sender       TEXT,
    ADD COLUMN IF NOT EXISTS container_id        TEXT,
    ADD COLUMN IF NOT EXISTS provisioning_error  TEXT,
    ADD COLUMN IF NOT EXISTS provisioned_at      TIMESTAMPTZ;

-- O check de status já existia em 001 com os valores ('active','inactive','deleted').
-- Precisamos incluir 'provisioning' e 'failed' pra que o worker possa marcar
-- estados intermediários sem violar a constraint.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_status;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_status
    CHECK (status IN ('provisioning', 'active', 'inactive', 'deleted', 'failed'));

COMMENT ON COLUMN tenants.zenvia_sender      IS 'Sender ID Zenvia (criptografado AES-256). Identifica quem aparece como remetente do SMS.';
COMMENT ON COLUMN tenants.container_id       IS 'ID do container Docker que está rodando o portal deste tenant. Atualizado pelo worker.';
COMMENT ON COLUMN tenants.provisioning_error IS 'Última mensagem de erro do worker ao tentar provisionar o container.';
COMMENT ON COLUMN tenants.provisioned_at     IS 'Quando o worker terminou de provisionar este tenant pela primeira vez.';
