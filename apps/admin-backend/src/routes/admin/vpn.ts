/**
 * Endpoints admin pra gerenciar VPN IPsec por tenant.
 *
 * Backend stack: Fastify + Postgres + swan-api (sidecar Go que controla
 * strongSwan via swanctl). Este módulo é a camada de orquestração:
 *   - aloca IPs no range 198.18.0.0/15
 *   - gera PSK aleatória
 *   - persiste estado no Postgres
 *   - chama swan-api pra adicionar/remover peers
 *   - faz POST de teste pelo túnel pra validar conectividade
 *
 * Spec: docs/wireguard-frontend-spec.md (mesmo contrato — substituiu WG por
 * IPsec internamente, UI renomeia labels mas API consome igual).
 */

import type { FastifyPluginAsync } from 'fastify'
import https from 'node:https'
import { encrypt, decrypt } from '../../services/crypto'
import { allocateNextPeerIp } from '../../services/ipsec/allocator'
import { generatePsk } from '../../services/ipsec/psk'
import {
  addPeer,
  removePeer,
  getPeer,
  getVpsPublicIp,
  getIkeProposals,
} from '../../services/ipsec/index'

interface TenantVpnRow {
  id: string
  name: string
  vpn_enabled: boolean
  vpn_peer_ip: string | null
  vpn_remote_id: string | null
  vpn_preshared_key_enc: string | null
  vpn_status: string | null
  vpn_endpoint_observed: string | null
  vpn_last_handshake: Date | null
  vpn_transfer_rx_bytes: number | null
  vpn_transfer_tx_bytes: number | null
  lhm_mgmt_lan_url: string | null
}

// peer_id usado no swan-api: "tenant_<UUID sem hífen>" (regex [A-Za-z0-9_-]{1,64})
function peerIdForTenant(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '')}`
}

const vpnRoutes: FastifyPluginAsync = async (fastify) => {
  const encryptionKey = fastify.config.encryptionKey

  async function fetchTenant(id: string): Promise<TenantVpnRow | null> {
    const r = await fastify.db.query<TenantVpnRow>(
      `SELECT id, name,
              vpn_enabled, vpn_peer_ip, vpn_remote_id,
              vpn_preshared_key_enc, vpn_status,
              vpn_endpoint_observed, vpn_last_handshake,
              vpn_transfer_rx_bytes, vpn_transfer_tx_bytes,
              lhm_mgmt_lan_url
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
    return r.rows[0] ?? null
  }

  // ─── POST /admin/tenants/:id/vpn/enable ──────────────────────────────
  fastify.post('/admin/tenants/:id/vpn/enable', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }
    if (tenant.vpn_enabled) {
      return reply.code(409).send({
        error: 'vpn_already_enabled',
        message: 'VPN já está habilitada para este tenant.',
        code: 409,
      })
    }

    const client = await fastify.db.connect()
    let peerIp: string
    let psk: string
    try {
      await client.query('BEGIN')
      peerIp = await allocateNextPeerIp(client)
      psk = generatePsk()
      const pskEnc = encrypt(psk, encryptionKey)
      const lhmMgmtLanUrl = `https://${peerIp}:4443/`

      await client.query(
        `UPDATE tenants SET
           vpn_enabled = true,
           vpn_peer_ip = $1,
           vpn_preshared_key_enc = $2,
           vpn_status = 'pending',
           lhm_mgmt_lan_url = $3,
           updated_at = NOW()
         WHERE id = $4`,
        [peerIp, pskEnc, lhmMgmtLanUrl, id],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    // Adiciona peer no strongSwan já — aceita qualquer remote_id (%any) por
    // padrão. Quando admin enviar `remote_id` específico via /peer-config,
    // a config é regravada com restrição.
    const peerId = peerIdForTenant(id)
    try {
      await addPeer({ peerId, peerIp, psk, remoteId: undefined })
      await fastify.db.query(
        `UPDATE tenants SET vpn_status = 'awaiting_handshake' WHERE id = $1`,
        [id],
      )
    } catch (err) {
      request.log.error({ err: (err as Error).message }, 'swan_api_addpeer_failed')
      await fastify.db.query(
        `UPDATE tenants SET vpn_status = 'error' WHERE id = $1`,
        [id],
      )
      return reply.code(502).send({
        error: 'swan_api_failed',
        message: 'Falha ao registrar peer no strongSwan.',
        details: (err as Error).message,
        code: 502,
      })
    }

    request.log.info({ tenantId: id, peerIp }, 'vpn_enabled')

    return reply.code(200).send({
      vpn_peer_ip: peerIp,
      ike_proposals: getIkeProposals(),
      preshared_key: psk, // mostrado UMA vez
      vps_public_ip: getVpsPublicIp(),
      vps_tunnel_ip: '198.18.0.1',
      lhm_mgmt_lan_url: `https://${peerIp}:4443/`,
      vpn_status: 'awaiting_handshake',
    })
  })

  // ─── POST /admin/tenants/:id/vpn/peer-config ─────────────────────────
  // Admin envia (opcional) `remote_id` específico do firewall pra restringir.
  fastify.post('/admin/tenants/:id/vpn/peer-config', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { remote_id?: string }
    const remoteId = body.remote_id?.trim() || undefined

    const tenant = await fetchTenant(id)
    if (!tenant || !tenant.vpn_enabled) {
      return reply.code(404).send({ error: 'vpn_not_enabled', message: 'VPN não habilitada.', code: 404 })
    }
    if (!tenant.vpn_peer_ip || !tenant.vpn_preshared_key_enc) {
      return reply.code(409).send({ error: 'vpn_incomplete', message: 'Config VPN incompleta.', code: 409 })
    }
    const psk = decrypt(tenant.vpn_preshared_key_enc, encryptionKey)
    const peerId = peerIdForTenant(id)
    try {
      await addPeer({ peerId, peerIp: tenant.vpn_peer_ip, psk, remoteId })
      await fastify.db.query(
        `UPDATE tenants SET vpn_remote_id = $1, vpn_status = 'awaiting_handshake', updated_at = NOW() WHERE id = $2`,
        [remoteId ?? null, id],
      )
    } catch (err) {
      return reply.code(502).send({
        error: 'swan_api_failed',
        message: (err as Error).message,
        code: 502,
      })
    }
    return reply.send({ vpn_status: 'awaiting_handshake', vpn_remote_id: remoteId ?? null })
  })

  // ─── GET /admin/tenants/:id/vpn/status ───────────────────────────────
  fastify.get('/admin/tenants/:id/vpn/status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', code: 404 })
    }
    if (!tenant.vpn_enabled) {
      return reply.send({ vpn_status: 'disabled' })
    }

    const peerId = peerIdForTenant(id)
    let info = null
    try {
      info = await getPeer(peerId)
    } catch (err) {
      request.log.warn({ err: (err as Error).message }, 'swan_status_fetch_failed')
    }

    const nowSec = Math.floor(Date.now() / 1000)
    let status: string = tenant.vpn_status ?? 'pending'
    let lastHandshakeSecondsAgo: number | undefined
    let rxBytes: number | undefined
    let txBytes: number | undefined
    let endpointObserved: string | undefined

    if (info) {
      if (info.state === 'established') {
        const secsAgo = info.last_handshake_unix ? nowSec - info.last_handshake_unix : 0
        status = secsAgo < 180 ? 'connected' : 'disconnected'
        lastHandshakeSecondsAgo = secsAgo
      } else if (info.state === 'connecting') {
        status = 'awaiting_handshake'
      } else {
        status = 'awaiting_handshake'
      }
      rxBytes = info.rx_bytes
      txBytes = info.tx_bytes
      endpointObserved = info.remote_host
    }

    fastify.db
      .query(
        `UPDATE tenants SET
           vpn_status = $1,
           vpn_endpoint_observed = COALESCE($2, vpn_endpoint_observed),
           vpn_transfer_rx_bytes = COALESCE($3, vpn_transfer_rx_bytes),
           vpn_transfer_tx_bytes = COALESCE($4, vpn_transfer_tx_bytes),
           vpn_last_status_check = NOW()
         WHERE id = $5`,
        [status, endpointObserved ?? null, rxBytes ?? null, txBytes ?? null, id],
      )
      .catch((err) =>
        request.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'vpn_status_persist_failed'),
      )

    return reply.send({
      vpn_status: status,
      vpn_peer_ip: tenant.vpn_peer_ip,
      vpn_remote_id: tenant.vpn_remote_id,
      endpoint_observed: endpointObserved,
      last_handshake_seconds_ago: lastHandshakeSecondsAgo,
      transfer_rx_bytes: rxBytes,
      transfer_tx_bytes: txBytes,
      lhm_mgmt_lan_url: tenant.lhm_mgmt_lan_url,
    })
  })

  // ─── POST /admin/tenants/:id/vpn/test-lhm ────────────────────────────
  fastify.post('/admin/tenants/:id/vpn/test-lhm', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fetchTenant(id)
    if (!tenant?.lhm_mgmt_lan_url) {
      return reply.code(404).send({ error: 'no_lhm_url', code: 404 })
    }
    const url = new URL('lhmapi/externalAAAGuest', tenant.lhm_mgmt_lan_url)
    const start = Date.now()
    const agent = new https.Agent({ rejectUnauthorized: false })
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          info: {
            action: 1,
            sessId: 'TEST_FAKE',
            userName: 'TESTUSER',
            sessionLifetime: '60',
            idleTimeout: '60',
            maxRx: '0',
            maxTx: '0',
            quotaCycleType: '0',
            cycleSessionLifeTime: '60',
            cycleMaxRx: '0',
            cycleMaxTx: '0',
          },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agent,
      } as any)
      const body = await r.text()
      return reply.send({
        reachable: true,
        http_status: r.status,
        response_body: body.slice(0, 500),
        duration_ms: Date.now() - start,
      })
    } catch (err) {
      return reply.code(502).send({
        reachable: false,
        error: (err as Error).name,
        details: (err as Error).message,
        duration_ms: Date.now() - start,
      })
    }
  })

  // ─── POST /admin/tenants/:id/vpn/regenerate-psk ──────────────────────
  fastify.post('/admin/tenants/:id/vpn/regenerate-psk', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fetchTenant(id)
    if (!tenant?.vpn_enabled || !tenant.vpn_peer_ip) {
      return reply.code(404).send({ error: 'vpn_not_enabled', code: 404 })
    }
    const psk = generatePsk()
    const pskEnc = encrypt(psk, encryptionKey)
    await fastify.db.query(
      `UPDATE tenants SET vpn_preshared_key_enc = $1, vpn_status = 'awaiting_handshake', updated_at = NOW() WHERE id = $2`,
      [pskEnc, id],
    )
    const peerId = peerIdForTenant(id)
    try {
      await addPeer({
        peerId,
        peerIp: tenant.vpn_peer_ip,
        psk,
        remoteId: tenant.vpn_remote_id ?? undefined,
      })
    } catch (err) {
      return reply.code(502).send({ error: 'swan_api_failed', details: (err as Error).message, code: 502 })
    }
    return reply.send({ preshared_key: psk, vpn_status: 'awaiting_handshake' })
  })

  // ─── DELETE /admin/tenants/:id/vpn ───────────────────────────────────
  fastify.delete('/admin/tenants/:id/vpn', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', code: 404 })
    }
    if (tenant.vpn_enabled) {
      const peerId = peerIdForTenant(id)
      try {
        await removePeer(peerId)
      } catch (err) {
        request.log.warn({ err: (err as Error).message }, 'swan_remove_failed_continuing')
      }
    }
    await fastify.db.query(
      `UPDATE tenants SET
         vpn_enabled = false,
         vpn_peer_ip = NULL,
         vpn_remote_id = NULL,
         vpn_preshared_key_enc = NULL,
         vpn_status = 'disabled',
         vpn_endpoint_observed = NULL,
         vpn_last_handshake = NULL,
         vpn_transfer_rx_bytes = NULL,
         vpn_transfer_tx_bytes = NULL,
         lhm_mgmt_lan_url = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [id],
    )
    return reply.code(204).send()
  })

  // ─── GET /admin/tenants/:id/vpn/config-download ──────────────────────
  fastify.get('/admin/tenants/:id/vpn/config-download', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fetchTenant(id)
    if (!tenant?.vpn_enabled || !tenant.vpn_peer_ip || !tenant.vpn_preshared_key_enc) {
      return reply.code(404).send({ error: 'vpn_not_enabled', code: 404 })
    }
    const psk = decrypt(tenant.vpn_preshared_key_enc, encryptionKey)
    const conf = `# IPsec config para tenant ${tenant.name}
# Cole no SonicWall como Tunnel-Interface IPsec / Site-to-Site.
# Preencha os campos correspondentes na UI do SonicOS.

# ─── Phase 1 (IKEv2) ───
Remote Gateway:           ${getVpsPublicIp()}
IKE Version:              IKEv2
Authentication Method:    IKE using Preshared Secret
Local IKE ID:             (deixar default — IP do firewall)
Peer IKE ID:              198.18.0.1
Pre-shared Secret:        ${psk}
Encryption (Phase 1):     AES-256
Hash (Phase 1):           SHA-256
DH Group:                 DH 14 (modp2048)
Lifetime:                 28800

# ─── Phase 2 ───
Local Network:            ${tenant.vpn_peer_ip}/32
Remote Network:           198.18.0.1/32
Encryption (Phase 2):     AES-256
Hash (Phase 2):           SHA-256
PFS:                      DH 14 (modp2048)
Lifetime:                 3600
`
    reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="ipsec-${tenant.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt"`,
      )
      .send(conf)
  })
}

export default vpnRoutes
