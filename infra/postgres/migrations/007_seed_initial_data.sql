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
-- Os campos sonicwall_config e zenvia_token estão criptografados com AES-256-CBC.
-- Chave usada: SHA-256 de "gere-com-openssl-rand-base64-32" (valor padrão do .env.example).
-- Formato: iv_hex:ciphertext_hex — o app (crypto.ts) descriptografa com a ENCRYPTION_KEY do env.
-- Em produção, use uma ENCRYPTION_KEY forte e recrie o tenant pelo painel admin.
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
-- sonicwall_config e zenvia_token criptografados com AES-256-CBC (ver comentário acima)
INSERT INTO tenants (id, name, port, status, sonicwall_config, zenvia_token)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Tenant Exemplo',
    29000,
    'active',
    '{"encrypted": "c030aaf595970ba2aafd3d6997c035d9:626477252b95ca41a4763f6fee9915e2bffd9c88d5841f2eda2a0bdb41b5db05e4803aaa5cdd1c3f11f06d87edf36fb93c9cf07eab7406dde522c1e597b3c2093d8c71aec02c25f542ac47fb6e7baf431547e29a19976adf23c2285afdd2ce25d217f471ed9522266bee0dc091ebeae94d55956e09924041e810dbf44f4fbd1e2bfc7d1e1bba622120e1671fadd64d9b08f41ac6669cb5f316bfce9f58c0185cd6aad3f8c35cbe105eb22dc6fd37441c"}'::jsonb,
    '9bbb1829a99cd7d5dd0c8d65feb44a93:3d254e3dec21d741df75733d947fb39e3260f0c72c8f45f96693fc3303995d8a'
);

-- 3. Seriais do tenant exemplo (HA pair)
INSERT INTO tenant_serials (tenant_id, serial, role)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'SN-EXEMPLO-001', 'primary'),
    ('b0000000-0000-0000-0000-000000000001', 'SN-EXEMPLO-002', 'secondary');
