-- =============================================
-- 003_create_wifi_sessions.sql
-- Sessões Wi-Fi autenticadas — particionada por year_month
-- Retenção: 5 anos. Partitions pré-criadas: 2025-01 a 2027-12.
-- =============================================

CREATE TABLE wifi_sessions (
    id              UUID            DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL,
    phone_e164      VARCHAR(20)     NOT NULL,
    mac_address     VARCHAR(17)     NOT NULL,
    ip_address      VARCHAR(45)     NOT NULL,
    auth_at         TIMESTAMPTZ     NOT NULL,
    expires_at      TIMESTAMPTZ     NOT NULL,
    sonicwall_raw   JSONB,
    sonicwall_mode  VARCHAR(20)     NOT NULL DEFAULT 'rest',
    year_month      INTEGER         NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- PK composta: PG exige a partition key na PK
    CONSTRAINT pk_wifi_sessions PRIMARY KEY (id, year_month),
    CONSTRAINT chk_wifi_sessions_mode CHECK (sonicwall_mode IN ('rest', 'lhm'))
) PARTITION BY RANGE (year_month);

-- Sem FK para tenants — tabelas particionadas no PG16 têm limitações com FKs.
-- Integridade referencial garantida na camada de aplicação.

-- Indexes (criados na tabela pai, propagam para partitions)
CREATE INDEX idx_wifi_sessions_tenant_auth   ON wifi_sessions (tenant_id, auth_at);
CREATE INDEX idx_wifi_sessions_phone         ON wifi_sessions (phone_e164);
CREATE INDEX idx_wifi_sessions_year_month    ON wifi_sessions (year_month);

COMMENT ON TABLE  wifi_sessions                 IS 'Cada autenticação OTP bem-sucedida gera um registro. Particionada por year_month.';
COMMENT ON COLUMN wifi_sessions.phone_e164      IS 'Telefone E.164 — NUNCA retornar sem máscara na API (LGPD)';
COMMENT ON COLUMN wifi_sessions.sonicwall_raw   IS 'Response bruta do SonicWall — para diagnóstico';
COMMENT ON COLUMN wifi_sessions.sonicwall_mode  IS 'Modo usado: rest (SonicOS API) ou lhm (Lightweight Hotspot Messaging)';
COMMENT ON COLUMN wifi_sessions.year_month      IS 'YYYYMM como inteiro (ex: 202503) — chave de particionamento';

-- =============================================
-- Partitions: 2025-01 a 2027-12 (36 meses)
-- Para adicionar novos anos, criar partitions antes do início do ano.
-- Exemplo: CREATE TABLE wifi_sessions_202801 PARTITION OF wifi_sessions FOR VALUES FROM (202801) TO (202802);
-- =============================================

-- 2025
CREATE TABLE wifi_sessions_202501 PARTITION OF wifi_sessions FOR VALUES FROM (202501) TO (202502);
CREATE TABLE wifi_sessions_202502 PARTITION OF wifi_sessions FOR VALUES FROM (202502) TO (202503);
CREATE TABLE wifi_sessions_202503 PARTITION OF wifi_sessions FOR VALUES FROM (202503) TO (202504);
CREATE TABLE wifi_sessions_202504 PARTITION OF wifi_sessions FOR VALUES FROM (202504) TO (202505);
CREATE TABLE wifi_sessions_202505 PARTITION OF wifi_sessions FOR VALUES FROM (202505) TO (202506);
CREATE TABLE wifi_sessions_202506 PARTITION OF wifi_sessions FOR VALUES FROM (202506) TO (202507);
CREATE TABLE wifi_sessions_202507 PARTITION OF wifi_sessions FOR VALUES FROM (202507) TO (202508);
CREATE TABLE wifi_sessions_202508 PARTITION OF wifi_sessions FOR VALUES FROM (202508) TO (202509);
CREATE TABLE wifi_sessions_202509 PARTITION OF wifi_sessions FOR VALUES FROM (202509) TO (202510);
CREATE TABLE wifi_sessions_202510 PARTITION OF wifi_sessions FOR VALUES FROM (202510) TO (202511);
CREATE TABLE wifi_sessions_202511 PARTITION OF wifi_sessions FOR VALUES FROM (202511) TO (202512);
CREATE TABLE wifi_sessions_202512 PARTITION OF wifi_sessions FOR VALUES FROM (202512) TO (202601);

-- 2026
CREATE TABLE wifi_sessions_202601 PARTITION OF wifi_sessions FOR VALUES FROM (202601) TO (202602);
CREATE TABLE wifi_sessions_202602 PARTITION OF wifi_sessions FOR VALUES FROM (202602) TO (202603);
CREATE TABLE wifi_sessions_202603 PARTITION OF wifi_sessions FOR VALUES FROM (202603) TO (202604);
CREATE TABLE wifi_sessions_202604 PARTITION OF wifi_sessions FOR VALUES FROM (202604) TO (202605);
CREATE TABLE wifi_sessions_202605 PARTITION OF wifi_sessions FOR VALUES FROM (202605) TO (202606);
CREATE TABLE wifi_sessions_202606 PARTITION OF wifi_sessions FOR VALUES FROM (202606) TO (202607);
CREATE TABLE wifi_sessions_202607 PARTITION OF wifi_sessions FOR VALUES FROM (202607) TO (202608);
CREATE TABLE wifi_sessions_202608 PARTITION OF wifi_sessions FOR VALUES FROM (202608) TO (202609);
CREATE TABLE wifi_sessions_202609 PARTITION OF wifi_sessions FOR VALUES FROM (202609) TO (202610);
CREATE TABLE wifi_sessions_202610 PARTITION OF wifi_sessions FOR VALUES FROM (202610) TO (202611);
CREATE TABLE wifi_sessions_202611 PARTITION OF wifi_sessions FOR VALUES FROM (202611) TO (202612);
CREATE TABLE wifi_sessions_202612 PARTITION OF wifi_sessions FOR VALUES FROM (202612) TO (202701);

-- 2027
CREATE TABLE wifi_sessions_202701 PARTITION OF wifi_sessions FOR VALUES FROM (202701) TO (202702);
CREATE TABLE wifi_sessions_202702 PARTITION OF wifi_sessions FOR VALUES FROM (202702) TO (202703);
CREATE TABLE wifi_sessions_202703 PARTITION OF wifi_sessions FOR VALUES FROM (202703) TO (202704);
CREATE TABLE wifi_sessions_202704 PARTITION OF wifi_sessions FOR VALUES FROM (202704) TO (202705);
CREATE TABLE wifi_sessions_202705 PARTITION OF wifi_sessions FOR VALUES FROM (202705) TO (202706);
CREATE TABLE wifi_sessions_202706 PARTITION OF wifi_sessions FOR VALUES FROM (202706) TO (202707);
CREATE TABLE wifi_sessions_202707 PARTITION OF wifi_sessions FOR VALUES FROM (202707) TO (202708);
CREATE TABLE wifi_sessions_202708 PARTITION OF wifi_sessions FOR VALUES FROM (202708) TO (202709);
CREATE TABLE wifi_sessions_202709 PARTITION OF wifi_sessions FOR VALUES FROM (202709) TO (202710);
CREATE TABLE wifi_sessions_202710 PARTITION OF wifi_sessions FOR VALUES FROM (202710) TO (202711);
CREATE TABLE wifi_sessions_202711 PARTITION OF wifi_sessions FOR VALUES FROM (202711) TO (202712);
CREATE TABLE wifi_sessions_202712 PARTITION OF wifi_sessions FOR VALUES FROM (202712) TO (202801);
