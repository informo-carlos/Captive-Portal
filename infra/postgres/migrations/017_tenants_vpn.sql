-- 017_tenants_vpn.sql
-- Adiciona campos de configuração WireGuard VPN por tenant.
--
-- A VPN conecta nossa VPS ao SonicWall do cliente, permitindo o backend
-- fazer POST direto pro lhmapi/externalAAAGuest sem depender do navegador
-- do cliente. Resolve a parede arquitetural documentada em
-- docs/sonicwall-integration-findings.md.
--
-- Range escolhido: 198.18.0.0/15 (RFC 2544 — sem overlap com cliente).
-- Cada tenant ocupa um /32. VPS sempre 198.18.0.1.
--
-- Spec completa: docs/wireguard-vpn-architecture.md

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS vpn_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpn_peer_ip INET,
  ADD COLUMN IF NOT EXISTS vpn_public_key TEXT,
  ADD COLUMN IF NOT EXISTS vpn_preshared_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS vpn_status TEXT DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS vpn_endpoint_observed TEXT,
  ADD COLUMN IF NOT EXISTS vpn_last_handshake TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vpn_last_status_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vpn_transfer_rx_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS vpn_transfer_tx_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS lhm_mgmt_lan_url TEXT;

-- Garante que cada IP de VPN só aparece em um tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_vpn_peer_ip
  ON tenants (vpn_peer_ip)
  WHERE vpn_peer_ip IS NOT NULL;

-- Constraint nos valores de vpn_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_vpn_status_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_vpn_status_check
      CHECK (vpn_status IN (
        'disabled',
        'pending',
        'awaiting_handshake',
        'connected',
        'disconnected',
        'error'
      ));
  END IF;
END$$;

COMMENT ON COLUMN tenants.vpn_enabled IS
  'Se true, backend usa lhm_mgmt_lan_url em vez do mgmtBaseUrl do redirect.';
COMMENT ON COLUMN tenants.vpn_peer_ip IS
  '/32 alocado dentro de 198.18.0.0/15 (RFC 2544). VPS sempre 198.18.0.1.';
COMMENT ON COLUMN tenants.vpn_public_key IS
  'Chave pública WireGuard gerada no SonicWall. Privada nunca sai do firewall.';
COMMENT ON COLUMN tenants.vpn_preshared_key_enc IS
  'PSK gerada pelo backend. Criptografada AES-256 via services/crypto.ts.';
COMMENT ON COLUMN tenants.vpn_status IS
  'Estado: disabled|pending|awaiting_handshake|connected|disconnected|error.';
COMMENT ON COLUMN tenants.lhm_mgmt_lan_url IS
  'URL completa do mgmt UI via VPN (ex: https://198.18.0.5:4443/). '
  'Usada como override de mgmtBaseUrl quando vpn_enabled=true.';

COMMIT;
