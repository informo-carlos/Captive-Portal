// Accounting RADIUS — UDP/1813 (RFC 2866).
//
// O NAS envia Accounting-Request a cada evento de sessão:
//   Acct-Status-Type=1  Start        → sessão começou (após Access-Accept)
//   Acct-Status-Type=3  Interim-Update → atualização periódica de bytes
//   Acct-Status-Type=2  Stop         → sessão terminou (com Acct-Terminate-Cause)
//
// Cada pacote vira 1 row em `radius_sessions` (INSERT no Start, UPDATE nos
// demais). A unique key (tenant_id, nas_ip, session_id) garante
// idempotência — NAS retenta se não receber Accounting-Response, e o
// INSERT ON CONFLICT DO NOTHING não duplica.
//
// Spec: docs/spec-radius-auth.md §7-B11

import * as dgram from 'node:dgram'
import type { AddressInfo } from 'node:net'
import type { FastifyBaseLogger } from 'fastify'
import type { Pool } from 'pg'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const radius = require('radius')
import { normalizeMac } from './mab'
import { createRateLimiter, type RateLimiter } from './rate-limit'
import type { RadiusServiceConfig } from './index'

interface AccountingPacket {
  code: string
  identifier: number
  authenticator: Buffer
  attributes: Record<string, string | number | Buffer>
}

export interface RadiusAccountingListener {
  stop(): Promise<void>
  authAddress: () => AddressInfo | null
}

export interface CreateAccountingDeps {
  config: RadiusServiceConfig
  tenantId: string
  db: Pool
  logger: FastifyBaseLogger
}

/**
 * Status-Type da RFC 2866 §5.1. A lib `radius` já traduz pelos dictionaries
 * (Start, Stop, Interim-Update, Accounting-On, Accounting-Off) — trabalhamos
 * com strings pra evitar surpresa caso a lib mude de mapping numérico.
 */
const ACCT_STATUS = {
  START: 'Start',
  STOP: 'Stop',
  INTERIM_UPDATE: 'Interim-Update',
  ACCOUNTING_ON: 'Accounting-On',
  ACCOUNTING_OFF: 'Accounting-Off',
} as const

/**
 * RFC 2866 §5.10 — Acct-Terminate-Cause. A lib `radius` já devolve como
 * string; mantemos esse nome como terminate_cause no DB pra legibilidade.
 */

export async function createAccountingListener(
  deps: CreateAccountingDeps,
): Promise<RadiusAccountingListener> {
  const { config, tenantId, db, logger } = deps

  if (!config.enabled) {
    throw new Error('createAccountingListener chamado com config.enabled=false')
  }
  if (!config.sharedSecret) {
    throw new Error('RADIUS_SHARED_SECRET ausente — accounting listener não pode iniciar')
  }

  const limiter = createRateLimiter({ ratePerSec: 50, burst: 100 })
  const gcInterval = setInterval(() => limiter.gc(), 60 * 1000)
  gcInterval.unref()

  const socket = dgram.createSocket('udp4')

  socket.on('message', (msg, rinfo) => {
    if (!limiter.take(rinfo.address)) {
      logger.warn(
        { nasIp: rinfo.address, active: limiter.size() },
        'radius_accounting_rate_limited',
      )
      return
    }

    handleAccounting({
      packet: msg,
      rinfo,
      socket,
      config,
      tenantId,
      db,
      logger,
    }).catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'radius_accounting_handler_error',
      )
    })
  })

  socket.on('error', (err) => {
    logger.error({ err: err.message }, 'radius_accounting_socket_error')
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('listening', resolve)
    socket.once('error', reject)
    socket.bind(config.acctPort, '0.0.0.0')
  })

  const addr = socket.address() as AddressInfo
  logger.info({ host: addr.address, port: addr.port }, 'radius_accounting_started')

  let stopped = false
  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearInterval(gcInterval)
      await new Promise<void>((resolve) => socket.close(() => resolve()))
      logger.info({ port: addr.port }, 'radius_accounting_stopped')
    },
    authAddress: () => (stopped ? null : (socket.address() as AddressInfo)),
  }
}

interface HandlerContext {
  packet: Buffer
  rinfo: dgram.RemoteInfo
  socket: dgram.Socket
  config: RadiusServiceConfig
  tenantId: string
  db: Pool
  logger: FastifyBaseLogger
}

async function handleAccounting(ctx: HandlerContext): Promise<void> {
  const { packet: raw, rinfo, socket, config, tenantId, db, logger } = ctx

  let packet: AccountingPacket
  try {
    packet = radius.decode({ packet: raw, secret: config.sharedSecret }) as AccountingPacket
  } catch (err) {
    logger.warn(
      {
        nasIp: rinfo.address,
        reason: err instanceof Error ? err.message : String(err),
      },
      'radius_accounting_bad_secret',
    )
    return
  }

  if (packet.code !== 'Accounting-Request') {
    logger.debug({ code: packet.code, nasIp: rinfo.address }, 'radius_accounting_unexpected_code')
    return
  }

  const statusType = packet.attributes['Acct-Status-Type']
  const sessionId = packet.attributes['Acct-Session-Id']
  const userName = packet.attributes['User-Name']
  const nasIp = (packet.attributes['NAS-IP-Address'] as string) || rinfo.address
  const framedIp = packet.attributes['Framed-IP-Address'] as string | undefined
  const bytesIn = toBigInt(packet.attributes['Acct-Input-Octets'])
  const bytesOut = toBigInt(packet.attributes['Acct-Output-Octets'])
  const terminateCause = packet.attributes['Acct-Terminate-Cause'] as string | undefined

  if (typeof sessionId !== 'string' || !sessionId) {
    logger.warn({ nasIp, statusType }, 'radius_accounting_missing_session_id')
    sendResponse(socket, rinfo, packet, config.sharedSecret, logger)
    return
  }

  const mac = typeof userName === 'string' ? normalizeMac(userName) : null

  try {
    switch (statusType) {
      case ACCT_STATUS.START:
        if (!mac) {
          logger.warn({ nasIp, sessionId }, 'radius_accounting_start_missing_mac')
          break
        }
        await db.query(
          `INSERT INTO radius_sessions
             (tenant_id, mac, ip, nas_ip, session_id, started_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, nas_ip, session_id) DO NOTHING`,
          [tenantId, mac, framedIp ?? null, nasIp, sessionId],
        )
        logger.info(
          { nasIp, mac, sessionId, framedIp },
          'radius_accounting_start',
        )
        break

      case ACCT_STATUS.INTERIM_UPDATE:
        await db.query(
          `UPDATE radius_sessions
              SET bytes_in = $1, bytes_out = $2, ip = COALESCE(ip, $3)
            WHERE tenant_id = $4 AND nas_ip = $5 AND session_id = $6`,
          [bytesIn, bytesOut, framedIp ?? null, tenantId, nasIp, sessionId],
        )
        logger.debug(
          { nasIp, sessionId, bytesIn: String(bytesIn), bytesOut: String(bytesOut) },
          'radius_accounting_interim',
        )
        break

      case ACCT_STATUS.STOP:
        await db.query(
          `UPDATE radius_sessions
              SET stopped_at = CURRENT_TIMESTAMP,
                  bytes_in = $1,
                  bytes_out = $2,
                  terminate_cause = $3
            WHERE tenant_id = $4 AND nas_ip = $5 AND session_id = $6
              AND stopped_at IS NULL`,
          [bytesIn, bytesOut, terminateCause ?? null, tenantId, nasIp, sessionId],
        )
        logger.info(
          {
            nasIp,
            mac,
            sessionId,
            terminateCause,
            bytesIn: String(bytesIn ?? 0),
            bytesOut: String(bytesOut ?? 0),
          },
          'radius_accounting_stop',
        )
        break

      case ACCT_STATUS.ACCOUNTING_ON:
      case ACCT_STATUS.ACCOUNTING_OFF:
        logger.info({ nasIp, statusType }, 'radius_accounting_nas_state')
        break

      default:
        logger.debug({ nasIp, statusType, sessionId }, 'radius_accounting_unknown_status_type')
    }
  } catch (err) {
    logger.error(
      {
        nasIp,
        sessionId,
        statusType,
        err: err instanceof Error ? err.message : String(err),
      },
      'radius_accounting_db_error',
    )
    // Não manda response — NAS vai retentar, dando outra chance do DB
    // voltar (DB down é quadro transitório).
    return
  }

  sendResponse(socket, rinfo, packet, config.sharedSecret, logger)
}

function sendResponse(
  socket: dgram.Socket,
  rinfo: dgram.RemoteInfo,
  packet: AccountingPacket,
  secret: string,
  logger: FastifyBaseLogger,
): void {
  const response = radius.encode_response({
    packet,
    code: 'Accounting-Response',
    secret,
  }) as Buffer
  socket.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
    if (err) {
      logger.error(
        { nasIp: rinfo.address, err: err.message },
        'radius_accounting_response_send_error',
      )
    }
  })
}

function toBigInt(value: unknown): bigint | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string') {
    try { return BigInt(value) } catch { return null }
  }
  return null
}
