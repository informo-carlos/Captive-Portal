-- =============================================
-- 007_seed_initial_data.sql
-- Dados iniciais: 1 superadmin + 1 tenant exemplo + 2 seriais
-- =============================================
-- IMPORTANTE: Este seed é para desenvolvimento/staging.
-- Em produção, altere a senha do superadmin imediatamente após o primeiro login.
--
-- Credenciais do superadmin:
--   Email: admin@captiveportal.local
--   Senha: Admin@123  (TROCAR IMEDIATAMENTE)
--
-- O tenant exemplo usa dados fictícios de SonicWall.
-- Os campos sonicwall_config e zenvia_token são armazenados aqui como
-- plaintext de desenvolvimento. Em produção, o app (crypto.ts) criptografa
-- com AES-256 antes de gravar e descriptografa ao ler.
-- =============================================

-- 1. Superadmin padrão
INSERT INTO admin_users (id, name, email, password_hash, role)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Administrador',
    'admin@captiveportal.local',
    '$2b$12$xWTNuvIU5oSTaR0sS9M6pOizQLXhZ22iu0z/3b6rAvNiguasiWp66',
    'superadmin'
);

-- 2. Tenant de exemplo (porta 29000)
INSERT INTO tenants (id, name, port, status, sonicwall_config, zenvia_token)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Tenant Exemplo',
    29000,
    'active',
    '{
        "host": "192.168.1.1",
        "user": "admin",
        "password": "PLACEHOLDER_DEV_ONLY",
        "firmware": 7,
        "mode": "rest",
        "lhm_port": 4043,
        "guest_service_user": "",
        "guest_service_pass": ""
    }'::jsonb,
    'PLACEHOLDER_ZENVIA_TOKEN_DEV_ONLY'
);

-- 3. Seriais do tenant exemplo (HA pair)
INSERT INTO tenant_serials (tenant_id, serial, role)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'SN-EXEMPLO-001', 'primary'),
    ('b0000000-0000-0000-0000-000000000001', 'SN-EXEMPLO-002', 'secondary');
