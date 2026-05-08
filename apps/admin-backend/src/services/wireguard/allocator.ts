import type { PoolClient } from 'pg'

// Range: 198.18.0.0/15 cobre 198.18.0.0 – 198.19.255.255
// .1 é a VPS; tenants alocam a partir de .2
const RANGE_START = ipToInt('198.18.0.2')
const RANGE_END = ipToInt('198.19.255.254') // último válido do /15

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) throw new Error(`IP inválido: ${ip}`)
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.')
}

/**
 * Aloca próximo /32 livre dentro de 198.18.0.0/15.
 * Executa dentro de uma transação com SELECT FOR UPDATE para
 * evitar race condition entre provisionamentos simultâneos.
 */
export async function allocateNextPeerIp(db: PoolClient): Promise<string> {
  await db.query('BEGIN')
  try {
    const result = await db.query<{ vpn_peer_ip: string }>(
      `SELECT vpn_peer_ip FROM tenants
       WHERE vpn_peer_ip IS NOT NULL
       FOR UPDATE`,
    )

    const usedInts = new Set<number>()
    for (const row of result.rows) {
      usedInts.add(ipToInt(row.vpn_peer_ip))
    }

    let candidate = RANGE_START
    while (candidate <= RANGE_END) {
      if (!usedInts.has(candidate)) {
        await db.query('COMMIT')
        return intToIp(candidate)
      }
      candidate++
    }

    await db.query('ROLLBACK')
    throw Object.assign(
      new Error('Range de IPs VPN esgotado (198.18.0.0/15 cheio)'),
      { code: 'vpn_range_exhausted' },
    )
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  }
}
