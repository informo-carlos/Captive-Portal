/**
 * Cliente HTTP do swan-api (sidecar IPsec/strongSwan).
 *
 * Endpoints expostos pelo swan-api:
 *   POST   /peers           {peer_id, peer_ip, psk, remote_id?}
 *   GET    /peers
 *   GET    /peers/:peer_id
 *   DELETE /peers/:peer_id
 *
 * Auth: Bearer SWAN_API_KEY.
 */

import type { IpsecPeerInfo } from './types'

const SWAN_API_URL = process.env['SWAN_API_URL'] ?? 'http://strongswan:9999'
const SWAN_API_KEY = process.env['SWAN_API_KEY'] ?? ''

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SWAN_API_KEY}`,
  }
}

/**
 * Adiciona (ou atualiza) um peer IPsec no strongSwan via swan-api.
 * Idempotente: re-POST com mesmo peer_id sobrescreve a config.
 */
export async function addPeer(opts: {
  peerId: string
  peerIp: string
  psk: string
  remoteId?: string
}): Promise<void> {
  const res = await fetch(`${SWAN_API_URL}/peers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      peer_id: opts.peerId,
      peer_ip: opts.peerIp,
      psk: opts.psk,
      remote_id: opts.remoteId,
    }),
  })
  if (!res.ok && res.status !== 201) {
    const body = await res.text().catch(() => '')
    throw new Error(`swan-api addPeer falhou: ${res.status} ${body}`)
  }
}

/**
 * Remove um peer do strongSwan. 404 é silencioso (idempotente).
 */
export async function removePeer(peerId: string): Promise<void> {
  const encoded = encodeURIComponent(peerId)
  const res = await fetch(`${SWAN_API_URL}/peers/${encoded}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    throw new Error(`swan-api removePeer falhou: ${res.status} ${body}`)
  }
}

/**
 * Lê status do peer (state, handshake, bytes). Retorna null se 404.
 */
export async function getPeer(peerId: string): Promise<IpsecPeerInfo | null> {
  const encoded = encodeURIComponent(peerId)
  const res = await fetch(`${SWAN_API_URL}/peers/${encoded}`, {
    headers: headers(),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`swan-api getPeer falhou: ${res.status} ${body}`)
  }
  return (await res.json()) as IpsecPeerInfo
}

/**
 * IP público da VPS — usado como Endpoint pelo SonicWall na config IPsec.
 */
export function getVpsPublicIp(): string {
  return process.env['SWAN_VPS_PUBLIC_IP'] ?? '45.7.53.80'
}

/**
 * Proposals padrão. Override via env SWAN_IKE_PROPOSALS.
 */
export function getIkeProposals(): string {
  return (
    process.env['SWAN_IKE_PROPOSALS'] ??
    'aes256-sha256-modp2048,aes128-sha256-modp2048,default'
  )
}
