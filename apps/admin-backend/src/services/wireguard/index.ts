import type { WgPeerInfo } from './types'

const WG_API_URL = process.env['WG_API_URL'] ?? 'http://wireguard:9999'
const WG_API_KEY = process.env['WG_API_KEY'] ?? ''

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WG_API_KEY}`,
  }
}

/**
 * Adiciona (ou atualiza) um peer no container WireGuard via wg-api.
 */
export async function addPeer(opts: {
  publicKey: string
  presharedKey: string
  allowedIps: string
}): Promise<void> {
  const res = await fetch(`${WG_API_URL}/peers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      public_key: opts.publicKey,
      preshared_key: opts.presharedKey,
      allowed_ips: opts.allowedIps,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`wg-api addPeer falhou: ${res.status} ${body}`)
  }
}

/**
 * Remove um peer do container WireGuard.
 * Se o peer não existe (404), ignora silenciosamente.
 */
export async function removePeer(publicKey: string): Promise<void> {
  const encoded = encodeURIComponent(publicKey)
  const res = await fetch(`${WG_API_URL}/peers/${encoded}`, {
    method: 'DELETE',
    headers: headers(),
  })

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    throw new Error(`wg-api removePeer falhou: ${res.status} ${body}`)
  }
}

/**
 * Retorna informações de handshake/tráfego de um peer.
 * Retorna null se o peer não existe no wg-api.
 */
export async function getPeer(publicKey: string): Promise<WgPeerInfo | null> {
  const encoded = encodeURIComponent(publicKey)
  const res = await fetch(`${WG_API_URL}/peers/${encoded}`, {
    method: 'GET',
    headers: headers(),
  })

  if (res.status === 404) return null

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`wg-api getPeer falhou: ${res.status} ${body}`)
  }

  // Formato esperado do wg-api (apps/wg-api):
  // { public_key, allowed_ips, endpoint?, last_handshake_unix, rx_bytes, tx_bytes }
  const data = await res.json() as {
    public_key: string
    allowed_ips: string
    endpoint?: string
    last_handshake_unix: number
    rx_bytes: number
    tx_bytes: number
  }

  return {
    publicKey: data.public_key,
    allowedIps: data.allowed_ips,
    endpoint: data.endpoint,
    lastHandshakeUnix: data.last_handshake_unix ?? 0,
    rxBytes: data.rx_bytes ?? 0,
    txBytes: data.tx_bytes ?? 0,
  }
}

/**
 * Lê a chave pública da VPS do env var.
 * É a chave que o admin deve colar no SonicWall como "Peer Public Key".
 */
export function getVpsPublicKey(): string {
  return process.env['WG_VPS_PUBLIC_KEY'] ?? ''
}

/**
 * Retorna o endpoint público da VPS (host:porta UDP WireGuard).
 */
export function getVpsEndpoint(): string {
  return process.env['WG_VPS_ENDPOINT'] ?? '45.7.53.80:51820'
}
