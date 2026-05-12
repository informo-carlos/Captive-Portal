/**
 * Tipos compartilhados do módulo IPsec.
 */

export interface IpsecPeerInfo {
  peer_id: string
  peer_ip: string
  remote_id?: string
  state: 'established' | 'connecting' | 'down'
  last_handshake_unix: number
  rx_bytes: number
  tx_bytes: number
  remote_host?: string
}
