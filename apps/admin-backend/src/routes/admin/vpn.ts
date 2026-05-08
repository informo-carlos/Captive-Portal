import type { FastifyPluginAsync } from 'fastify'
import https from 'node:https'
import { encrypt, decrypt } from '../../services/crypto'
import { allocateNextPeerIp } from '../../services/wireguard/allocator'
import { generatePsk } from '../../services/wireguard/psk'
import {
  addPeer,
  removePeer,
  getPeer,
  getVpsPublicKey,
  getVpsEndpoint,
} from '../../services/wireguard/index'
import type { TenantVpnRow } from '../../services/wireguard/types'

// Regex para validar chave pública WireGuard: 43 chars base64 + '='
const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{43}=$/

const vpnRoutes: FastifyPluginAsync = async (fastify) => {
  const encryptionKey = fastify.config.encryptionKey

  /** Busca tenant pelo id e retorna campos VPN. */
  async function fetchTenant(id: string): Promise<TenantVpnRow | null> {
    const r = await fastify.db.query<TenantVpnRow>(
      `SELECT id, name,
              vpn_enabled, vpn_peer_ip, vpn_public_key,
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
      return reply.code(409).send({ error: 'vpn_already_enabled', message: 'VPN já está habilitada para este tenant.', code: 409 })
    }

    const client = await fastify.db.connect()
    try {
      const peerIp = await allocateNextPeerIp(client)
      const psk = generatePsk()
      const encPsk = encrypt(psk, encryptionKey)
      const lhmUrl = `https://${peerIp}:4443/`
      const vpsEndpoint = getVpsEndpoint()

      await client.query(
        `UPDATE tenants SET
           vpn_enabled = true,
           vpn_peer_ip = $1,
           vpn_preshared_key_enc = $2,
           vpn_status = 'pending',
           lhm_mgmt_lan_url = $3,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [peerIp, encPsk, lhmUrl, id],
      )

      await fastify.logAudit({
        adminUserId: request.admin.id,
        action: 'vpn_enabled',
        payload: { tenant_id: id, vpn_peer_ip: peerIp },
        ipAddress: request.ip,
      })

      return reply.code(200).send({
        vpn_peer_ip: `${peerIp}/32`,
        endpoint: vpsEndpoint,
        allowed_ips: '198.18.0.1/32',
        persistent_keepalive: 25,
        preshared_key: psk,
        vps_public_key: getVpsPublicKey(),
        lhm_mgmt_lan_url: lhmUrl,
        vpn_status: 'pending',
      })
    } catch (err: unknown) {
      const anyErr = err as { code?: string; message?: string }
      if (anyErr.code === 'vpn_range_exhausted') {
        return reply.code(503).send({ error: 'vpn_range_exhausted', message: 'Range de IPs VPN esgotado.', code: 503 })
      }
      throw err
    } finally {
      client.release()
    }
  })

  // ─── POST /admin/tenants/:id/vpn/peer-public-key ─────────────────────
  fastify.post('/admin/tenants/:id/vpn/peer-public-key', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['public_key'],
        properties: {
          public_key: { type: 'string', minLength: 44, maxLength: 44 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { public_key } = request.body as { public_key: string }

    if (!PUBLIC_KEY_RE.test(public_key)) {
      return reply.code(422).send({
        error: 'invalid_public_key',
        message: 'Formato de chave inválido. Esperado: 44 caracteres base64 (Curve25519).',
        code: 422,
      })
    }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }
    if (!tenant.vpn_enabled || !tenant.vpn_peer_ip || !tenant.vpn_preshared_key_enc) {
      return reply.code(409).send({
        error: 'vpn_not_enabled',
        message: 'VPN não está habilitada ou não foi provisionada para este tenant.',
        code: 409,
      })
    }
    if (
      tenant.vpn_status !== 'pending' &&
      tenant.vpn_status !== 'awaiting_handshake'
    ) {
      return reply.code(409).send({
        error: 'invalid_vpn_state',
        message: `Operação não permitida no estado atual: ${tenant.vpn_status}.`,
        code: 409,
      })
    }

    const psk = decrypt(tenant.vpn_preshared_key_enc, encryptionKey)

    try {
      await addPeer({
        publicKey: public_key,
        presharedKey: psk,
        allowedIps: `${tenant.vpn_peer_ip}/32`,
      })
    } catch (err: unknown) {
      request.log.error({ err }, 'wg-api addPeer falhou')
      await fastify.db.query(
        `UPDATE tenants SET vpn_status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id],
      )
      return reply.code(502).send({
        error: 'wg_api_error',
        message: 'Falha ao registrar peer no servidor WireGuard.',
        code: 502,
      })
    }

    await fastify.db.query(
      `UPDATE tenants SET
         vpn_public_key = $1,
         vpn_status = 'awaiting_handshake',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [public_key, id],
    )

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'vpn_peer_registered',
      payload: { tenant_id: id, public_key_prefix: public_key.slice(0, 8) },
      ipAddress: request.ip,
    })

    return reply.code(200).send({ vpn_status: 'awaiting_handshake' })
  })

  // ─── GET /admin/tenants/:id/vpn/status ───────────────────────────────
  fastify.get('/admin/tenants/:id/vpn/status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }

    if (!tenant.vpn_enabled) {
      return reply.code(200).send({ vpn_status: 'disabled' })
    }

    if (!tenant.vpn_public_key) {
      return reply.code(200).send({
        vpn_status: tenant.vpn_status ?? 'pending',
        vpn_peer_ip: tenant.vpn_peer_ip,
        endpoint_observed: tenant.vpn_endpoint_observed,
        last_handshake_seconds_ago: null,
        transfer_rx_bytes: null,
        transfer_tx_bytes: null,
        lhm_mgmt_lan_url: tenant.lhm_mgmt_lan_url,
      })
    }

    // Consulta wg-api para dados em tempo real
    let computedStatus = tenant.vpn_status ?? 'awaiting_handshake'
    let endpointObserved = tenant.vpn_endpoint_observed
    let lastHandshakeSecondsAgo: number | null = null
    let rxBytes: number | null = null
    let txBytes: number | null = null

    try {
      const peer = await getPeer(tenant.vpn_public_key)
      if (peer) {
        const nowSec = Math.floor(Date.now() / 1000)
        rxBytes = peer.rxBytes
        txBytes = peer.txBytes
        endpointObserved = peer.endpoint ?? tenant.vpn_endpoint_observed

        if (peer.lastHandshakeUnix === 0) {
          computedStatus = 'awaiting_handshake'
        } else {
          lastHandshakeSecondsAgo = nowSec - peer.lastHandshakeUnix
          computedStatus = lastHandshakeSecondsAgo < 180 ? 'connected' : 'disconnected'
        }

        // Atualiza banco (best effort — falha não impede a resposta)
        const lastHandshakeDate = peer.lastHandshakeUnix > 0
          ? new Date(peer.lastHandshakeUnix * 1000).toISOString()
          : null

        fastify.db
          .query(
            `UPDATE tenants SET
               vpn_status = $1,
               vpn_endpoint_observed = $2,
               vpn_last_handshake = $3,
               vpn_transfer_rx_bytes = $4,
               vpn_transfer_tx_bytes = $5,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [computedStatus, endpointObserved, lastHandshakeDate, rxBytes, txBytes, id],
          )
          .catch((err: unknown) => {
            request.log.warn({ err }, 'vpn status: falha ao atualizar banco (best effort)')
          })
      }
    } catch (err: unknown) {
      request.log.warn({ err }, 'vpn status: falha ao consultar wg-api — usando dados do banco')
      // Usa dados cached do banco
      if (tenant.vpn_last_handshake) {
        lastHandshakeSecondsAgo = Math.floor(
          (Date.now() - new Date(tenant.vpn_last_handshake).getTime()) / 1000,
        )
      }
      rxBytes = tenant.vpn_transfer_rx_bytes !== null ? parseInt(tenant.vpn_transfer_rx_bytes, 10) : null
      txBytes = tenant.vpn_transfer_tx_bytes !== null ? parseInt(tenant.vpn_transfer_tx_bytes, 10) : null
    }

    return reply.code(200).send({
      vpn_status: computedStatus,
      vpn_peer_ip: tenant.vpn_peer_ip,
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
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }
    if (!tenant.lhm_mgmt_lan_url) {
      return reply.code(422).send({
        error: 'lhm_url_missing',
        message: 'lhm_mgmt_lan_url não configurada para este tenant.',
        code: 422,
      })
    }

    const agent = new https.Agent({ rejectUnauthorized: false })

    let testUrl: string
    try {
      testUrl = new URL('lhmapi/externalAAAGuest', tenant.lhm_mgmt_lan_url).toString()
    } catch {
      return reply.code(422).send({
        error: 'invalid_lhm_url',
        message: `lhm_mgmt_lan_url inválida: ${tenant.lhm_mgmt_lan_url}`,
        code: 422,
      })
    }

    const start = Date.now()
    try {
      // Node 22 fetch aceita `agent` como extensão, mas os tipos DOM não incluem.
      // Usamos Record<string, unknown> pra passar a opção sem violar o strict.
      const fetchOpts: Record<string, unknown> = {
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
        agent,
        signal: AbortSignal.timeout(10_000),
      }
      const r = await fetch(testUrl, fetchOpts as RequestInit)

      const body = await r.text()
      const dur = Date.now() - start

      return reply.code(200).send({
        reachable: true,
        http_status: r.status,
        response_body: body.slice(0, 500),
        duration_ms: dur,
      })
    } catch (err: unknown) {
      const dur = Date.now() - start
      const e = err as { code?: string; message?: string; name?: string }
      const errorCode =
        e.code ?? (e.name === 'AbortError' ? 'TIMEOUT' : 'UNKNOWN')
      const details = e.message ?? String(err)

      request.log.warn({ err, tenant_id: id }, 'test-lhm: não alcançou SonicWall')

      return reply.code(502).send({
        reachable: false,
        error: errorCode,
        details,
        duration_ms: dur,
      })
    }
  })

  // ─── POST /admin/tenants/:id/vpn/regenerate-psk ──────────────────────
  fastify.post('/admin/tenants/:id/vpn/regenerate-psk', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }
    if (!tenant.vpn_enabled || !tenant.vpn_peer_ip) {
      return reply.code(409).send({
        error: 'vpn_not_enabled',
        message: 'VPN não está habilitada para este tenant.',
        code: 409,
      })
    }

    const newPsk = generatePsk()
    const encNewPsk = encrypt(newPsk, encryptionKey)

    // Remove peer antigo (se existia) e re-adiciona com nova PSK
    if (tenant.vpn_public_key) {
      try {
        await removePeer(tenant.vpn_public_key)
      } catch (err: unknown) {
        request.log.warn({ err }, 'regenerate-psk: falha ao remover peer antigo (continuando)')
      }

      try {
        await addPeer({
          publicKey: tenant.vpn_public_key,
          presharedKey: newPsk,
          allowedIps: `${tenant.vpn_peer_ip}/32`,
        })
      } catch (err: unknown) {
        request.log.error({ err }, 'regenerate-psk: falha ao re-adicionar peer com nova PSK')
        await fastify.db.query(
          `UPDATE tenants SET vpn_status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [id],
        )
        return reply.code(502).send({
          error: 'wg_api_error',
          message: 'Falha ao atualizar peer no servidor WireGuard.',
          code: 502,
        })
      }
    }

    await fastify.db.query(
      `UPDATE tenants SET
         vpn_preshared_key_enc = $1,
         vpn_status = 'awaiting_handshake',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [encNewPsk, id],
    )

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'vpn_psk_regenerated',
      payload: { tenant_id: id },
      ipAddress: request.ip,
    })

    return reply.code(200).send({
      preshared_key: newPsk,
      vpn_status: 'awaiting_handshake',
    })
  })

  // ─── DELETE /admin/tenants/:id/vpn ───────────────────────────────────
  fastify.delete('/admin/tenants/:id/vpn', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }

    // Remove peer do WG (best effort — 404 é ok)
    if (tenant.vpn_public_key) {
      try {
        await removePeer(tenant.vpn_public_key)
      } catch (err: unknown) {
        request.log.warn({ err }, 'vpn disable: falha ao remover peer (continuando)')
      }
    }

    await fastify.db.query(
      `UPDATE tenants SET
         vpn_enabled = false,
         vpn_peer_ip = NULL,
         vpn_public_key = NULL,
         vpn_preshared_key_enc = NULL,
         vpn_status = 'disabled',
         vpn_endpoint_observed = NULL,
         vpn_last_handshake = NULL,
         vpn_transfer_rx_bytes = NULL,
         vpn_transfer_tx_bytes = NULL,
         lhm_mgmt_lan_url = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id],
    )

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'vpn_disabled',
      payload: { tenant_id: id },
      ipAddress: request.ip,
    })

    return reply.code(204).send()
  })

  // ─── GET /admin/tenants/:id/vpn/config-download ──────────────────────
  fastify.get('/admin/tenants/:id/vpn/config-download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenant = await fetchTenant(id)
    if (!tenant) {
      return reply.code(404).send({ error: 'not_found', message: 'Tenant não encontrado.', code: 404 })
    }
    if (!tenant.vpn_enabled || !tenant.vpn_peer_ip || !tenant.vpn_preshared_key_enc) {
      return reply.code(409).send({
        error: 'vpn_not_provisioned',
        message: 'VPN não está provisionada para este tenant.',
        code: 409,
      })
    }

    let psk: string
    try {
      psk = decrypt(tenant.vpn_preshared_key_enc, encryptionKey)
    } catch {
      return reply.code(500).send({
        error: 'decrypt_error',
        message: 'Falha ao descriptografar PSK.',
        code: 500,
      })
    }

    const vpsPublicKey = getVpsPublicKey()
    const vpsEndpoint = getVpsEndpoint()
    const safeName = (tenant.name as string).replace(/[^a-zA-Z0-9_-]/g, '_')

    const conf = [
      `# WireGuard config para tenant ${tenant.name}`,
      `# Gere a chave PRIVADA no próprio SonicWall (Generate New Key)`,
      `# Cole esta config completando o campo PrivateKey`,
      ``,
      `[Interface]`,
      `# PrivateKey = <gerada no SonicWall>`,
      `Address = ${tenant.vpn_peer_ip}/32`,
      ``,
      `[Peer]`,
      `PublicKey = ${vpsPublicKey}`,
      `PresharedKey = ${psk}`,
      `AllowedIPs = 198.18.0.1/32`,
      `Endpoint = ${vpsEndpoint}`,
      `PersistentKeepalive = 25`,
    ].join('\n')

    void reply.header('Content-Type', 'text/plain; charset=utf-8')
    void reply.header(
      'Content-Disposition',
      `attachment; filename="vpn-${safeName}.conf"`,
    )
    return reply.code(200).send(conf)
  })
}

export default vpnRoutes
