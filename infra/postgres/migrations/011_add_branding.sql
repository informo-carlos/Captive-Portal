-- Branding do portal captivo por tenant (logo + cor primaria)
-- Nao criptografado — dados publicos exibidos na tela de login Wi-Fi

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenants.branding
    IS 'Branding do portal captivo — logo_url (string) e primary_color (hex string). Nao criptografado.';
