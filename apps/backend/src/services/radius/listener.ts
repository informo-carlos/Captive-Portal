// Listener RADIUS — UDP/1812 (Access-Request).
//
// Decodifica o pacote com o shared secret do tenant (a `radius` lib valida
// o Message-Authenticator e joga InvalidSecretError se bater errado), extrai
// o MAC do atributo User-Name, consulta MAB no Redis e responde Accept/Reject.
//
// Accounting (UDP/1813) e CoA (UDP/3799) são implementados em B11.
// Spec: docs/spec-radius-auth.md §3, §7-B10

import * as dgram from 'node:dgram'
import type { AddressInfo } from 'node:net'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'
// `radius` não tem @types — declaração mínima suficiente pro uso aqui.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const radius = require('radius')
import { lookupMabAuthorization, normalizeMac, rememberNasForMac } from './mab'
import type { RadiusServiceConfig } from './index'

interface RadiusPacket {
  code: string
  identifier: number
  authenticator: Buffer
  attributes: Record<string, string | number>
  raw_attributes: unknown[]
}

/** Idle timeout do guest em segundos — fixo em 30min, padrão razoável. */
const IDLE_TIMEOUT_SEC = 1800

export interface RadiusListener {
  /** Fecha os sockets UDP. Idempotente. */
  stop(): Promise<void>
  /** Endereços efetivamente bindados (pra log/testes). */
  authAddress: () => AddressInfo | null
}

export interface CreateListenerDeps {
  config: RadiusServiceConfig
  tenantId: string
  redis: Redis
  logger: FastifyBaseLogger
}

/**
 * Sobe socket UDP em `config.authPort` pra receber Access-Request.
 * Falhas de parsing e secret inválido são silenciosamente dropadas com log
 * — RFC 2865 §3 recomenda não responder a pacotes inválidos (evita oráculo
 * de ataque).
 */
export async function createListener(
  deps: CreateListenerDeps,
): Promise<RadiusListener> {
  const { config, tenantId, redis, logger } = deps

  if (!config.enabled) {
    throw new Error('createListener chamado com config.enabled=false')
  }

  if (!config.sharedSecret) {
    throw new Error('RADIUS_SHARED_SECRET ausente — listener não pode iniciar')
  }

  const socket = dgram.createSocket('udp4')

  socket.on('message', (msg, rinfo) => {
    handleAccessRequest({
      packet: msg,
      rinfo,
      socket,
      config,
      tenantId,
      redis,
      logger,
    }).catch((err) => {
      // Log mas não propaga — um handler ruim não pode derrubar o listener.
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'radius_handler_error',
      )
    })
  })

  socket.on('error', (err) => {
    logger.error({ err: err.message }, 'radius_socket_error')
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('listening', resolve)
    socket.once('error', reject)
    socket.bind(config.authPort, '0.0.0.0')
  })

  const addr = socket.address() as AddressInfo
  logger.info(
    { host: addr.address, port: addr.port, sessionTimeoutSec: config.sessionTimeoutSec },
    'radius_listener_started',
  )

  let stopped = false
  return {
    async stop() {
      if (stopped) return
      stopped = true
      await new Promise<void>((resolve) => socket.close(() => resolve()))
      logger.info({ port: addr.port }, 'radius_listener_stopped')
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
  redis: Redis
  logger: FastifyBaseLogger
}

async function handleAccessRequest(ctx: HandlerContext): Promise<void> {
  const { packet: rawPacket, rinfo, socket, config, tenantId, redis, logger } = ctx

  // Decode — a `radius` lib valida o Message-Authenticator com o secret e
  // joga InvalidSecretError se bater errado (possível shared_secret errado
  // ou pacote forjado).
  let packet: RadiusPacket
  try {
    packet = radius.decode({ packet: rawPacket, secret: config.sharedSecret }) as RadiusPacket
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // Fallback: tentar decodificar sem validação de secret para distinguir
    // entre "probe legítimo com User-Password malformado" e "secret errado".
    // RFC 2865 §3 — drop silencioso é correto para secret inválido (evita
    // oráculo de ataque). Mas o heartbeat do SonicWall envia User-Password
    // com length 2 (abaixo do mínimo de 16 bytes do RFC) e precisa receber
    // Access-Reject para marcar o servidor como UP.
    let fallbackPacket: RadiusPacket | null = null
    try {
      fallbackPacket = radius.decode_without_secret({ packet: rawPacket }) as RadiusPacket
    } catch {
      // Pacote totalmente corrompido — drop silencioso.
      logger.warn(
        { nasIp: rinfo.address, nasPort: rinfo.port, reason: msg },
        'radius_corrupt_packet',
      )
      return
    }

    // Só tratamos Access-Request no fallback — outros códigos caem em drop.
    if (fallbackPacket.code !== 'Access-Request') {
      logger.warn(
        { nasIp: rinfo.address, nasPort: rinfo.port, reason: msg },
        'radius_bad_secret',
      )
      return
    }

    const fallbackUserName = fallbackPacket.attributes['User-Name']
    const isLikelyMac =
      typeof fallbackUserName === 'string' &&
      normalizeMac(fallbackUserName).length === 12

    if (isLikelyMac) {
      // User-Name parece ser um MAC mas o decode com secret falhou →
      // possível secret errado ou pacote forjado. Drop silencioso (RFC 2865 §3).
      logger.warn(
        { nasIp: rinfo.address, nasPort: rinfo.port, reason: msg },
        'radius_bad_secret',
      )
      return
    }

    // User-Name não é um MAC (ex: "status-check" — probe do SonicWall).
    // Responde Access-Reject para provar ao firewall que o servidor está vivo.
    // Não revela nada sensível: nenhum dado de sessão ou secret é exposto.
    logger.info(
      { nasIp: rinfo.address, identifier: fallbackPacket.identifier, userName: fallbackUserName },
      'radius_probe_rejected',
    )
    sendReject(socket, rinfo, fallbackPacket, config.sharedSecret, 'probe-or-invalid-user', logger)
    return
  }

  // Só respondemos a Access-Request. Accounting (1813) vai em outro listener
  // em B11; mas se cair aqui por configuração errada no NAS, dropa silencioso.
  if (packet.code !== 'Access-Request') {
    logger.debug(
      { code: packet.code, nasIp: rinfo.address },
      'radius_unexpected_packet_code',
    )
    return
  }

  // RFC 5080 §2.2 — Access-Request DEVE conter Message-Authenticator quando
  // o servidor suporta EAP/validação forte. Sem o atributo a lib não
  // consegue verificar o shared secret (decode passa, mas com secret errado
  // o User-Password decodifica pra lixo silenciosamente). Rejeitamos
  // silencioso pra evitar oráculo de ataque. Mikrotik/Unifi/SonicWall
  // modernos todos enviam Message-Authenticator por default.
  if (!('Message-Authenticator' in packet.attributes)) {
    logger.warn(
      { nasIp: rinfo.address, identifier: packet.identifier },
      'radius_missing_message_authenticator',
    )
    return
  }

  // Extrai identidade — User-Name tem o MAC (MAB usa MAC como identidade).
  const userName = packet.attributes['User-Name']
  if (typeof userName !== 'string' || !userName) {
    logger.warn(
      { nasIp: rinfo.address, identifier: packet.identifier },
      'radius_missing_user_name',
    )
    sendReject(socket, rinfo, packet, config.sharedSecret, 'missing-user-name', logger)
    return
  }

  const normalizedMac = normalizeMac(userName)
  if (normalizedMac.length !== 12) {
    // User-Name presente mas não é um MAC reconhecível — trata como Reject
    // (MAB só aceita MAC; outras identidades viriam via EAP, fora de escopo).
    logger.warn(
      { nasIp: rinfo.address, userName, normalizedLen: normalizedMac.length },
      'radius_invalid_mac_format',
    )
    sendReject(socket, rinfo, packet, config.sharedSecret, 'invalid-mac', logger)
    return
  }

  // Tracking do NAS-IP por MAC — verify-otp usa isso depois pra saber pra
  // onde disparar CoA. Falha silenciosa (errar aqui não pode dropar o
  // fluxo de Accept/Reject em andamento). TTL curto (15min), chave
  // sobrescrita a cada novo Access-Request.
  rememberNasForMac(redis, tenantId, normalizedMac, rinfo.address).catch(
    (err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'radius_remember_nas_failed',
      )
    },
  )

  // MAB lookup — chave no Redis gravada pelo verify-otp (B12).
  const mab = await lookupMabAuthorization(redis, tenantId, normalizedMac)

  if (!mab.authorized) {
    logger.info(
      {
        nasIp: rinfo.address,
        identifier: packet.identifier,
        mac: normalizedMac,
        tenantId,
      },
      'radius_reject_mab_miss',
    )
    sendReject(socket, rinfo, packet, config.sharedSecret, 'mab-miss', logger)
    return
  }

  // Accept — Session-Timeout usa o TTL real restante (não o default config),
  // assim se o admin encurtou o timeout do tenant depois de o guest autenticar,
  // o firewall já recebe o valor certo.
  const sessionTimeout = mab.ttlSec ?? config.sessionTimeoutSec
  const response = radius.encode_response({
    packet,
    code: 'Access-Accept',
    secret: config.sharedSecret,
    attributes: [
      ['Session-Timeout', sessionTimeout],
      ['Idle-Timeout', IDLE_TIMEOUT_SEC],
      // Termination-Action=1 (RADIUS-Request) — força o NAS a refazer
      // MAB quando o Session-Timeout expirar, em vez de só desconectar.
      ['Termination-Action', 1],
    ],
  }) as Buffer

  socket.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
    if (err) {
      logger.error(
        { err: err.message, nasIp: rinfo.address },
        'radius_accept_send_error',
      )
    }
  })

  logger.info(
    {
      nasIp: rinfo.address,
      identifier: packet.identifier,
      mac: normalizedMac,
      sessionTimeoutSec: sessionTimeout,
      phone: mab.data?.phone,
    },
    'radius_accept',
  )
}

function sendReject(
  socket: dgram.Socket,
  rinfo: dgram.RemoteInfo,
  packet: RadiusPacket,
  secret: string,
  reason: string,
  logger: FastifyBaseLogger,
): void {
  const response = radius.encode_response({
    packet,
    code: 'Access-Reject',
    secret,
    // Reply-Message ajuda debug no firewall sem vazar nada sensível.
    attributes: [['Reply-Message', `mab-reject: ${reason}`]],
  }) as Buffer

  socket.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
    if (err) {
      logger.error(
        { err: err.message, nasIp: rinfo.address, reason },
        'radius_reject_send_error',
      )
    }
  })
}
