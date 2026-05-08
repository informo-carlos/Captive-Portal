export type VpnStatus =
  | 'disabled'
  | 'pending'
  | 'awaiting_handshake'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface WgPeerInfo {
  publicKey: string
  allowedIps: string
  endpoint?: string
  /** Epoch seconds. 0 = nunca fez handshake. */
  lastHandshakeUnix: number
  rxBytes: number
  txBytes: number
}

export interface TenantVpnRow {
  id: string
  name: string
  vpn_enabled: boolean
  vpn_peer_ip: string | null
  vpn_public_key: string | null
  vpn_preshared_key_enc: string | null
  vpn_status: VpnStatus | null
  vpn_endpoint_observed: string | null
  vpn_last_handshake: Date | null
  vpn_transfer_rx_bytes: string | null
  vpn_transfer_tx_bytes: string | null
  lhm_mgmt_lan_url: string | null
}
