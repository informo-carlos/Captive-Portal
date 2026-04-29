// Testes do listener RADIUS — cobertura dos casos de probe e MAB.
//
// Estratégia: subir o listener em porta efêmera (0 → kernel escolhe),
// enviar pacotes UDP reais e verificar a resposta (ou ausência dela).
// A lib `radius` é usada diretamente pra montar/decodificar os pacotes,
// igual ao código de produção.

import * as dgram from 'node:dgram'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const radius = require('radius')

const SECRET = 'test-shared-secret'
const WRONG_SECRET = 'wrong-secret'
const TENANT_ID = 'tenant-test'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Envia um Buffer UDP e aguarda a primeira resposta (ou timeout). */
function sendAndReceive(
  payload: Buffer,
  targetPort: number,
  timeoutMs = 500,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4')
    let done = false

    const finish = (buf: Buffer | null) => {
      if (done) return
      done = true
      client.close()
      resolve(buf)
    }

    client.on('message', (msg) => finish(msg))
    client.send(payload, 0, payload.length, targetPort, '127.0.0.1', (err) => {
      if (err) finish(null)
    })
    setTimeout(() => finish(null), timeoutMs)
  })
}

/**
 * Constrói um Access-Request bem-formado com Message-Authenticator.
 * `userName` vai em User-Name e User-Password (padrão MAB).
 * `userPasswordOverride` permite injetar bytes brutos no lugar do User-Password
 * (para simular o heartbeat do SonicWall com length 2).
 */
function buildAccessRequest(opts: {
  secret: string
  userName: string
  userPasswordOverride?: Buffer
  identifier?: number
}): Buffer {
  const { secret, userName, userPasswordOverride, identifier = 1 } = opts

  if (userPasswordOverride) {
    // Monta o pacote base com User-Name + Message-Authenticator e injeta
    // os bytes brutos de User-Password manualmente no buffer.
    //
    // Estrutura Access-Request:
    //   [Code=1][Id][Len 2B][Authenticator 16B][Attrs...]
    //
    // Attr User-Password = type 2, len = 2 + value.length
    // Attr User-Name     = type 1, len = 2 + name.length
    // Attr Message-Authenticator = type 80, len = 18 (2+16)

    const nameBytes = Buffer.from(userName, 'utf8')
    // User-Password attr com bytes brutos de tamanho 0 (apenas type+len = 2)
    const pwAttrLen = 2 + userPasswordOverride.length
    const nameAttrLen = 2 + nameBytes.length
    const maAttrLen = 18 // Message-Authenticator fixo 16 bytes

    const totalLen = 20 + pwAttrLen + nameAttrLen + maAttrLen
    const pkt = Buffer.alloc(totalLen, 0)

    let offset = 0
    pkt.writeUInt8(1, offset++) // code = Access-Request
    pkt.writeUInt8(identifier, offset++) // identifier
    pkt.writeUInt16BE(totalLen, offset); offset += 2 // length
    // authenticator (16 bytes random)
    const auth = Buffer.alloc(16)
    for (let i = 0; i < 16; i++) auth[i] = Math.floor(Math.random() * 256)
    auth.copy(pkt, offset); offset += 16

    // User-Name attr
    pkt.writeUInt8(1, offset++); pkt.writeUInt8(nameAttrLen, offset++)
    nameBytes.copy(pkt, offset); offset += nameBytes.length

    // User-Password attr (bytes brutos — viola RFC 2865 §5.2 propositalmente)
    pkt.writeUInt8(2, offset++); pkt.writeUInt8(pwAttrLen, offset++)
    userPasswordOverride.copy(pkt, offset); offset += userPasswordOverride.length

    // Message-Authenticator (16 zeros — sem HMAC real; basta existir pro listener
    // não dropar por ausência do atributo. O decode_without_secret não valida.)
    pkt.writeUInt8(80, offset++); pkt.writeUInt8(maAttrLen, offset++)
    // 16 bytes zero já preenchidos pelo Buffer.alloc

    return pkt
  }

  // Caminho normal: usa a lib pra montar com HMAC correto.
  // `add_message_authenticator: true` faz a lib calcular e inserir o atributo
  // 80 (Message-Authenticator) corretamente — necessário pra o listener aceitar
  // o pacote (linha de checagem RFC 5080 §2.2).
  return radius.encode({
    code: 'Access-Request',
    identifier,
    secret,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add_message_authenticator: true as any,
    attributes: [
      ['User-Name', userName],
      ['User-Password', userName],
    ],
  }) as Buffer
}

// ── setup do listener ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listenerPort: number
let stopListener: () => Promise<void>

// Redis mock mínimo — cobre todos os métodos chamados pelo listener:
//   rememberNasForMac → redis.set(key, val, 'EX', ttl)
//   lookupMabAuthorization → Promise.all([redis.get(key), redis.ttl(key)])
const redisMock = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: async (..._args: any[]) => 'OK' as const,
  get: async (_key: string) => null as string | null,
  ttl: async (_key: string) => -2, // -2 = chave inexistente → not authorized
}

beforeAll(async () => {
  // Import dinâmico para garantir que o módulo é carregado após os mocks.
  const { createListener } = await import('../listener')
  const pinoLogger = (await import('pino')).default({ level: 'silent' })

  const listener = await createListener({
    config: {
      enabled: true,
      sharedSecret: SECRET,
      authPort: 0, // porta efêmera
      acctPort: 0,
      coaPort: 3799,
      sessionTimeoutSec: 3600,
    },
    tenantId: TENANT_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    redis: redisMock as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: pinoLogger as any,
  })

  const addr = listener.authAddress()
  if (!addr) throw new Error('listener não bindou')
  listenerPort = addr.port
  stopListener = listener.stop.bind(listener)
})

afterAll(async () => {
  await stopListener()
})

// ── testes ────────────────────────────────────────────────────────────────────

describe('RADIUS listener — probe e MAB', () => {
  it('caso 1: probe SonicWall (User-Name=status-check, User-Password length 2) → Access-Reject', async () => {
    // SonicWall envia User-Password com apenas 2 bytes (type+len, sem valor),
    // que viola o mínimo de 16 bytes do RFC 2865 §5.2. A lib joga exceção
    // no decode normal. O listener deve responder Access-Reject (não dropar).
    const pkt = buildAccessRequest({
      secret: SECRET,
      userName: 'status-check',
      userPasswordOverride: Buffer.alloc(0), // 0 bytes de valor → len=2
    })

    const resp = await sendAndReceive(pkt, listenerPort, 800)

    expect(resp).not.toBeNull()
    // Primeiro byte do pacote RADIUS = code. 3 = Access-Reject.
    expect(resp![0]).toBe(3)
  })

  it('caso 3: pacote com secret errado (MAC válido no User-Name) → drop silencioso', async () => {
    // MAC válido no User-Name mas assinado com secret errado.
    // Listener deve identificar User-Name como MAC e dropar sem responder.
    const pkt = buildAccessRequest({
      secret: WRONG_SECRET, // assinado com secret diferente
      userName: 'aabbccddeeff',
    })

    const resp = await sendAndReceive(pkt, listenerPort, 600)
    expect(resp).toBeNull()
  })

  it('caso 4: pacote totalmente corrompido (bytes aleatórios) → drop silencioso', async () => {
    const garbage = Buffer.from([0xff, 0x01, 0x00, 0x08, 0xde, 0xad, 0xbe, 0xef])
    const resp = await sendAndReceive(garbage, listenerPort, 600)
    expect(resp).toBeNull()
  })

  it('caso 2 (smoke): MAC não autorizado no Redis → Access-Reject', async () => {
    // Secret correto, MAC bem-formado, mas Redis retorna null (não autorizado).
    const pkt = buildAccessRequest({
      secret: SECRET,
      userName: 'aabbccddeeff',
    })

    const resp = await sendAndReceive(pkt, listenerPort, 800)

    expect(resp).not.toBeNull()
    // Deve responder Access-Reject (code=3).
    expect(resp![0]).toBe(3)
  })
})
