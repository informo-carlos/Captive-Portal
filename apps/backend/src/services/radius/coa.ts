// CoA-Disconnect — cliente UDP pro NAS (RFC 5176).
//
// Após verify-otp, a gente grava a autorização no Redis e dispara
// Disconnect-Request pro NAS:3799. O NAS derruba a sessão MAC atual (que
// estava em reject/walled-garden) e re-tenta MAB imediatamente — agora a
// chave existe no Redis, então o Access-Request seguinte vem Accept.
//
// Sem CoA o guest teria que esperar o re-auth timer do próprio AP (pode
// ser minutos) — CoA reduz pra <5s o "tempo pra internet" pós-OTP.
//
// Spec: docs/spec-radius-auth.md §7-B11

import * as dgram from 'node:dgram'
import type { FastifyBaseLogger } from 'fastify'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const radius = require('radius')
import { normalizeMac } from './mab'
import type { CoARequest, CoAResult, RadiusServiceConfig } from './index'

/** Timeout do ack do NAS. RFC 5176 recomenda retry; aqui mantemos single-shot. */
const COA_TIMEOUT_MS = 2000

/**
 * Encode + envia Disconnect-Request pro NAS e aguarda ACK ou NAK.
 * Timeout retorna `success: false, latencyMs: null` pra o caller decidir
 * se degrada ou retenta (B12 marca sessão como `status=degraded` após 3
 * falhas consecutivas).
 */
export async function sendDisconnect(
  req: CoARequest,
  config: RadiusServiceConfig,
  logger: FastifyBaseLogger,
): Promise<CoAResult> {
  if (!config.sharedSecret) {
    throw new Error('sendDisconnect chamado sem sharedSecret configurado')
  }

  const normalizedMac = normalizeMac(req.mac)
  const socket = dgram.createSocket('udp4')
  const startedAt = Date.now()

  // Attributes — User-Name ou Acct-Session-Id são a forma canônica de
  // identificar a sessão alvo. User-Name = MAC atende MAB; se o NAS já
  // enviou um Acct-Session-Id via accounting-start, a gente também
  // inclui pra aumentar a chance de match (RFC 5176 §3.2).
  const attributes: Array<[string, string | number]> = [
    ['User-Name', normalizedMac],
    ['NAS-IP-Address', req.nasIp],
  ]
  if (req.sessionId) {
    attributes.push(['Acct-Session-Id', req.sessionId])
  }

  const packet = radius.encode({
    code: 'Disconnect-Request',
    secret: config.sharedSecret,
    attributes,
  }) as Buffer

  return new Promise<CoAResult>((resolve) => {
    const timer = setTimeout(() => {
      try { socket.close() } catch { /* ignore */ }
      logger.warn(
        { nasIp: req.nasIp, mac: normalizedMac, timeoutMs: COA_TIMEOUT_MS },
        'radius_coa_timeout',
      )
      resolve({ success: false, latencyMs: null })
    }, COA_TIMEOUT_MS)

    socket.on('message', (msg) => {
      clearTimeout(timer)
      try { socket.close() } catch { /* ignore */ }

      const latencyMs = Date.now() - startedAt
      try {
        const decoded = radius.decode({ packet: msg, secret: config.sharedSecret })
        // 41 = Disconnect-ACK, 42 = Disconnect-NAK (RFC 5176 §3.3)
        const success = decoded.code === 'Disconnect-ACK'

        logger.info(
          {
            nasIp: req.nasIp,
            mac: normalizedMac,
            sessionId: req.sessionId,
            responseCode: decoded.code,
            latencyMs,
          },
          success ? 'radius_coa_ack' : 'radius_coa_nak',
        )

        resolve({ success, latencyMs, responseCode: success ? 41 : 42 })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn(
          { nasIp: req.nasIp, mac: normalizedMac, reason: msg, latencyMs },
          'radius_coa_bad_response',
        )
        resolve({ success: false, latencyMs })
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      try { socket.close() } catch { /* ignore */ }
      logger.error(
        { nasIp: req.nasIp, mac: normalizedMac, err: err.message },
        'radius_coa_socket_error',
      )
      resolve({ success: false, latencyMs: null })
    })

    const coaPort = req.nasPort ?? config.coaPort
    socket.send(packet, 0, packet.length, coaPort, req.nasIp, (err) => {
      if (err) {
        clearTimeout(timer)
        try { socket.close() } catch { /* ignore */ }
        logger.error(
          { nasIp: req.nasIp, mac: normalizedMac, err: err.message },
          'radius_coa_send_error',
        )
        resolve({ success: false, latencyMs: null })
      }
    })
  })
}
