-- 018_tenants_vpn_ipsec.sql
-- Pivot da VPN de WireGuard pra IPsec/strongSwan.
--
-- Decisão arquitetural: IPsec é mais maduro e configurável no SonicWall, e o
-- projeto vai operar muitos clientes — manutenção via strongSwan + swanctl é
-- mais conhecida pelo time de ops. Mantém o mesmo range 198.18.0.0/15 e
-- esquema /32 por tenant (apenas a tecnologia de túnel muda).
--
-- O que muda:
--  - vpn_public_key (Curve25519 do WG) → não usada em IPsec, mantida nullable
--    pra retrocompat (rollback) mas marcada como legacy
--  - vpn_remote_id: string identifier opcional do peer (ex: IP público do
--    firewall ou FQDN). Usada como "right_id" no strongSwan.
--  - vpn_status mantém os mesmos valores pra UI consistente
--
-- Spec: docs/ipsec-vpn-architecture.md (substitui wireguard-vpn-architecture.md)

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS vpn_remote_id TEXT;

COMMENT ON COLUMN tenants.vpn_remote_id IS
  'IPsec remote identifier (right_id no strongSwan). Default: %any (aceita '
  'qualquer remote ID se vier autenticado pela PSK). Pode setar IP público '
  'do firewall ou FQDN pra restringir.';

COMMENT ON COLUMN tenants.vpn_public_key IS
  'LEGACY (WireGuard). Não usado em modo IPsec. Manter pra retrocompat / rollback.';

COMMIT;
