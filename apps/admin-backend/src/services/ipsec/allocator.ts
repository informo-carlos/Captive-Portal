/**
 * Aloca o próximo /32 livre dentro de 198.18.0.0/15 (RFC 2544).
 * VPS sempre 198.18.0.1; primeiro tenant em 198.18.0.2.
 *
 * Usa SELECT FOR UPDATE pra garantir atomicidade em provisionamento concorrente.
 */

import type { PoolClient } from 'pg'

const RANGE_START = ipv4ToInt('198.18.0.2') // .1 é VPS
const RANGE_END = ipv4ToInt('198.19.255.254') // last usable in /15

export async function allocateNextPeerIp(client: PoolClient): Promise<string> {
  const res = await client.query<{ vpn_peer_ip: string | null }>(
    `SELECT vpn_peer_ip FROM tenants
     WHERE vpn_peer_ip IS NOT NULL
     ORDER BY vpn_peer_ip
     FOR UPDATE`,
  )
  const used = new Set<number>()
  for (const row of res.rows) {
    if (!row.vpn_peer_ip) continue
    // Postgres retorna inet com possível /mask — pega só IP
    const ip = row.vpn_peer_ip.split('/')[0]
    used.add(ipv4ToInt(ip))
  }
  for (let n = RANGE_START; n <= RANGE_END; n++) {
    if (!used.has(n)) {
      return intToIpv4(n)
    }
  }
  throw new Error('vpn_range_exhausted: 198.18.0.0/15 sem IPs livres')
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((n) => parseInt(n, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`invalid IPv4: ${ip}`)
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
