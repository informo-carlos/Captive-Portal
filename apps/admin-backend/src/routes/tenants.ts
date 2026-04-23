import type { FastifyPluginAsync } from 'fastify'
import type { PoolClient } from 'pg'
import { encrypt, decrypt } from '../services/crypto'

interface TenantSerial {
  serial: string
  role: 'primary' | 'secondary'
}

interface SonicwallConfig {
  mode: 'rest' | 'lhm'
  host?: string
  port?: number
  user?: string
  password?: string
  firmware?: number
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

type AuthMode = 'sonicwall' | 'radius'

interface RadiusConfig {
  shared_secret?: string
  coa_port?: number
  session_timeout_sec?: number
  nas_ip_allowlist?: string[]
}

/** Range de portas UDP pra RADIUS. Espelha o HTTP 29000-29099 (B9 spec §3.4). */
const RADIUS_PORT_MIN = 18120
const RADIUS_PORT_MAX = 18219

/**
 * Aloca par (auth, acct) de portas UDP livres dentro da transação.
 * Estratégia: varrer o range sequencialmente, pulando qualquer porta já
 * reservada por outro tenant. Usa o client da transação pra garantir
 * consistência com o INSERT que vem a seguir (mesmo que dois POSTs
 * concorrentes rodem, cada um vê o snapshot seu e o UNIQUE constraint
 * do banco é o tie-breaker final).
 */
async function allocateRadiusPortPair(
  client: PoolClient,
): Promise<{ authPort: number; acctPort: number }> {
  const usedResult = await client.query<{ radius_auth_port: number | null; radius_acct_port: number | null }>(
    `SELECT radius_auth_port, radius_acct_port FROM tenants
      WHERE (radius_auth_port IS NOT NULL OR radius_acct_port IS NOT NULL)
        AND deleted_at IS NULL`,
  )
  const used = new Set<number>()
  for (const row of usedResult.rows) {
    if (row.radius_auth_port !== null) used.add(row.radius_auth_port)
    if (row.radius_acct_port !== null) used.add(row.radius_acct_port)
  }

  // Procura o primeiro par (auth, acct=auth+1) livre.
  for (let auth = RADIUS_PORT_MIN; auth < RADIUS_PORT_MAX; auth += 2) {
    const acct = auth + 1
    if (!used.has(auth) && !used.has(acct)) {
      return { authPort: auth, acctPort: acct }
    }
  }
  throw new Error(
    `Range de portas RADIUS (${RADIUS_PORT_MIN}-${RADIUS_PORT_MAX}) esgotado`,
  )
}

/**
 * Valida que os campos RADIUS necessários estão presentes na criação.
 * shared_secret é o único obrigatório — demais têm defaults no listener.
 */
function validateRadiusCreate(config: RadiusConfig | undefined): string | null {
  if (!config || !config.shared_secret) {
    return 'shared_secret é obrigatório quando auth_mode = "radius".'
  }
  if (config.coa_port !== undefined && (config.coa_port < 1 || config.coa_port > 65535)) {
    return 'coa_port fora do range 1-65535.'
  }
  return null
}

/**
 * Valida que os campos exigidos pelo modo escolhido estão presentes.
 *
 * - mode='rest': a VPS chama a API REST do SonicWall, então host/user/password
 *   são obrigatórios.
 * - mode='lhm': quem fala com o SonicWall é o navegador do usuário (External
 *   Guest Authentication). A VPS não precisa de credenciais nem do host —
 *   tudo vem do `mgmtBaseUrl` que o próprio SW envia no redirect inicial.
 *   guest_service_user/pass continuam OPCIONAIS (só usar se o SW estiver
 *   configurado pra exigir auth no callback do externalGuestLogin.cgi).
 */
function validateModeRequirements(
  config: { mode?: string; host?: string; user?: string; password?: string },
): string | null {
  if (config.mode === 'rest') {
    const missing: string[] = []
    if (!config.host) missing.push('host')
    if (!config.user) missing.push('user')
    if (!config.password) missing.push('password')
    if (missing.length > 0) {
      return `Campos ${missing.join(', ')} são obrigatórios quando mode = "rest".`
    }
  }
  return null
}

// Remove campos sensíveis do sonicwall_config para a response
function sanitizeConfig(encrypted: string, encryptionKey: string): Record<string, unknown> | null {
  try {
    const jsonStr = typeof encrypted === 'string' && encrypted.includes(':')
      ? decrypt(encrypted, encryptionKey)
      : encrypted
    const config = JSON.parse(jsonStr)
    const { password, guest_service_pass, ...safe } = config
    return safe
  } catch {
    // Se sonicwall_config for JSONB com campo "encrypted"
    return null
  }
}

function decryptConfigFromDb(row: Record<string, unknown>, encryptionKey: string): Record<string, unknown> | null {
  const config = row['sonicwall_config'] as Record<string, unknown> | null
  if (!config) return null

  // Formato: { encrypted: "iv:ciphertext" }
  if (config['encrypted'] && typeof config['encrypted'] === 'string') {
    try {
      const decrypted = decrypt(config['encrypted'] as string, encryptionKey)
      return JSON.parse(decrypted)
    } catch {
      return null
    }
  }

  return config
}

function sanitizeConfigFromDb(row: Record<string, unknown>, encryptionKey: string): Record<string, unknown> | null {
  const full = decryptConfigFromDb(row, encryptionKey)
  if (!full) return null
  const { password, guest_service_pass, ...safe } = full
  return safe
}

/**
 * Extrai o radius_config do DB (criptografado no mesmo formato que
 * sonicwall_config: { encrypted: "iv:ciphertext" }) e retorna a versão
 * pública — sem o shared_secret, com `has_shared_secret: bool` pra a UI.
 */
function sanitizeRadiusConfigFromDb(
  row: Record<string, unknown>,
  encryptionKey: string,
): Record<string, unknown> {
  const raw = row['radius_config'] as Record<string, unknown> | null
  if (!raw) return { has_shared_secret: false }

  let decrypted: RadiusConfig = {}
  if (raw['encrypted'] && typeof raw['encrypted'] === 'string') {
    try {
      decrypted = JSON.parse(decrypt(raw['encrypted'] as string, encryptionKey)) as RadiusConfig
    } catch {
      return { has_shared_secret: false }
    }
  } else if (typeof raw === 'object') {
    // Formato não criptografado (ex: tenant legado) — assume que já é o objeto
    decrypted = raw as RadiusConfig
  }

  const { shared_secret, ...safe } = decrypted
  return {
    ...safe,
    has_shared_secret: !!shared_secret,
  }
}

const tenantRoutes: FastifyPluginAsync = async (fastify) => {
  const encryptionKey = fastify.config.encryptionKey

  // ─── GET /admin/tenants ─────────────────────────────────
  // Nota: GETs não gravam audit_log. Auditar leituras gera volume excessivo
  // e baixo valor para o cenário atual. Reavaliar se dados de rede/config
  // exigirem rastreamento de quem visualizou (tenant_listed / tenant_viewed).
  fastify.get('/admin/tenants', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { status, page, limit } = request.query as { status?: string; page: number; limit: number }
    const offset = (page - 1) * limit

    // Count total
    const conditions: string[] = ["t.deleted_at IS NULL"]
    const params: unknown[] = []
    let paramIdx = 1

    if (status) {
      conditions.push(`t.status = $${paramIdx++}`)
      params.push(status)
    }

    const where = conditions.join(' AND ')

    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM tenants t WHERE ${where}`,
      params,
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Fetch tenants com seriais e sessions_count
    const dataParams = [...params, limit, offset]
    const result = await fastify.db.query(
      `SELECT t.id, t.name, t.port, t.status, t.sonicwall_config, t.zenvia_token,
              t.zenvia_sender, t.provisioning_error, t.container_id, t.provisioned_at,
              t.session_duration_minutes, t.branding, t.created_at, t.updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ts.id, 'serial', ts.serial, 'role', ts.role))
                 FROM tenant_serials ts WHERE ts.tenant_id = t.id), '[]'
              ) AS serials,
              (SELECT COUNT(*) FROM wifi_sessions ws WHERE ws.tenant_id = t.id)::int AS sessions_count
       FROM tenants t
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataParams,
    )

    const data = result.rows.map((row: Record<string, unknown>) => ({
      id: row['id'],
      name: row['name'],
      port: row['port'],
      status: row['status'],
      auth_mode: row['auth_mode'] ?? 'sonicwall',
      serials: row['serials'],
      sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
      radius_config: sanitizeRadiusConfigFromDb(row, encryptionKey),
      radius_auth_port: row['radius_auth_port'] ?? null,
      radius_acct_port: row['radius_acct_port'] ?? null,
      // Não retornamos o sender em si — apenas se está configurado.
      // Mesmo padrão do password: nunca sai do backend depois de gravado.
      has_zenvia_sender: !!row['zenvia_sender'],
      provisioning_error: row['provisioning_error'] ?? null,
      container_id: row['container_id'] ?? null,
      provisioned_at: row['provisioned_at'] ?? null,
      session_duration_minutes: row['session_duration_minutes'],
      branding: row['branding'] || {},
      sessions_count: row['sessions_count'],
      created_at: row['created_at'],
    }))

    return reply.code(200).send({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    })
  })

  // ─── POST /admin/tenants ────────────────────────────────
  fastify.post('/admin/tenants', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'port', 'serials', 'zenvia_token', 'zenvia_sender'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          port: { type: 'integer', minimum: 29000, maximum: 29999 },
          auth_mode: { type: 'string', enum: ['sonicwall', 'radius'], default: 'sonicwall' },
          serials: {
            type: 'array',
            minItems: 1,
            maxItems: 2,
            items: {
              type: 'object',
              required: ['serial', 'role'],
              properties: {
                serial: { type: 'string', minLength: 1 },
                role: { type: 'string', enum: ['primary', 'secondary'] },
              },
            },
          },
          sonicwall_config: {
            type: 'object',
            // Apenas `mode` é universalmente obrigatório. Os demais campos são
            // exigidos conforme o modo, e a validação acontece no handler em
            // validateModeRequirements (ver acima).
            // Schema opcional pra permitir tenants radius-only (sem sonicwall).
            required: ['mode'],
            properties: {
              mode: { type: 'string', enum: ['rest', 'lhm'] },
              host: { type: 'string' },
              port: { type: 'integer', minimum: 1, maximum: 65535 },
              user: { type: 'string' },
              password: { type: 'string' },
              firmware: { type: 'integer' },
              lhm_port: { type: 'integer' },
              guest_service_user: { type: 'string' },
              guest_service_pass: { type: 'string' },
            },
          },
          radius_config: {
            type: 'object',
            // shared_secret é obrigatório em validateRadiusCreate quando auth_mode=radius.
            properties: {
              shared_secret: { type: 'string', minLength: 8, maxLength: 256 },
              coa_port: { type: 'integer', minimum: 1, maximum: 65535, default: 3799 },
              session_timeout_sec: { type: 'integer', minimum: 300, maximum: 86400 },
              nas_ip_allowlist: {
                type: 'array',
                items: { type: 'string', maxLength: 64 },
                maxItems: 32,
              },
            },
          },
          zenvia_token: { type: 'string', minLength: 1 },
          zenvia_sender: { type: 'string', minLength: 1, maxLength: 64 },
          session_duration_minutes: { type: 'integer', minimum: 15, maximum: 1440, default: 480 },
          branding: {
            type: 'object',
            properties: {
              logo_url: { type: 'string', maxLength: 2048 },
              primary_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
              secondary_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
              welcome_text: { type: 'string', maxLength: 500 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      port: number
      auth_mode?: AuthMode
      serials: TenantSerial[]
      sonicwall_config?: SonicwallConfig
      radius_config?: RadiusConfig
      zenvia_token: string
      zenvia_sender: string
      session_duration_minutes?: number
      branding?: { logo_url?: string; primary_color?: string; secondary_color?: string; welcome_text?: string }
    }

    const authMode: AuthMode = body.auth_mode ?? 'sonicwall'

    // Validação específica por modo
    if (authMode === 'sonicwall') {
      if (!body.sonicwall_config) {
        return reply.code(422).send({
          error: 'missing_sonicwall_config',
          message: 'sonicwall_config é obrigatório quando auth_mode = "sonicwall".',
          code: 422,
        })
      }
      const modeError = validateModeRequirements(body.sonicwall_config)
      if (modeError) {
        return reply.code(422).send({
          error: 'missing_mode_fields',
          message: modeError,
          code: 422,
        })
      }
    } else {
      // radius
      const radiusError = validateRadiusCreate(body.radius_config)
      if (radiusError) {
        return reply.code(422).send({
          error: 'missing_radius_fields',
          message: radiusError,
          code: 422,
        })
      }
    }

    const client = await fastify.db.connect()
    try {
      await client.query('BEGIN')

      // 1. Verifica porta duplicada
      const portCheck = await client.query(
        'SELECT id FROM tenants WHERE port = $1 AND deleted_at IS NULL',
        [body.port],
      )
      if (portCheck.rows.length > 0) {
        await client.query('ROLLBACK')
        return reply.code(409).send({
          error: 'conflict',
          message: `A porta ${body.port} já está em uso por outro cliente.`,
          field: 'port',
          code: 409,
        })
      }

      // 2. Verifica seriais duplicados
      for (const s of body.serials) {
        const serialCheck = await client.query(
          'SELECT ts.id FROM tenant_serials ts JOIN tenants t ON t.id = ts.tenant_id WHERE ts.serial = $1 AND t.deleted_at IS NULL',
          [s.serial],
        )
        if (serialCheck.rows.length > 0) {
          await client.query('ROLLBACK')
          return reply.code(409).send({
            error: 'conflict',
            message: `O serial ${s.serial} já está cadastrado em outro cliente.`,
            field: 'serial',
            code: 409,
          })
        }
      }

      // 3. Criptografa campos sensíveis
      // sonicwall_config sempre existe no DB (default '{}'), mas só tem
      // conteúdo real pra tenants sonicwall. Radius-only salva o objeto vazio
      // pra não quebrar schema existente.
      const swConfigToEncrypt = body.sonicwall_config ?? {}
      const encryptedConfig = encrypt(JSON.stringify(swConfigToEncrypt), encryptionKey)
      const encryptedZenvia = encrypt(body.zenvia_token, encryptionKey)
      const encryptedSender = encrypt(body.zenvia_sender, encryptionKey)

      // 3a. Só pra tenants RADIUS: criptografa radius_config e aloca UDP
      let encryptedRadiusPayload: string | null = null
      let radiusAuthPort: number | null = null
      let radiusAcctPort: number | null = null
      if (authMode === 'radius' && body.radius_config) {
        encryptedRadiusPayload = encrypt(JSON.stringify(body.radius_config), encryptionKey)
        const ports = await allocateRadiusPortPair(client)
        radiusAuthPort = ports.authPort
        radiusAcctPort = ports.acctPort
      }

      // 4. Insere tenant — começa em status='provisioning'.
      // O worker (apps/provisioner) vai pegar o registro, criar o container
      // Docker e o bloco nginx, e mover pra 'active'. Em caso de falha, vai
      // pra 'failed' com a mensagem em provisioning_error.
      const insertResult = await client.query(
        `INSERT INTO tenants
           (name, port, status, auth_mode,
            sonicwall_config, radius_config, radius_auth_port, radius_acct_port,
            zenvia_token, zenvia_sender, session_duration_minutes, branding)
         VALUES ($1, $2, 'provisioning', $3,
                 $4, $5, $6, $7,
                 $8, $9, $10, $11)
         RETURNING id, name, port, status, auth_mode,
                   radius_auth_port, radius_acct_port,
                   session_duration_minutes, branding, created_at`,
        [
          body.name,
          body.port,
          authMode,
          JSON.stringify({ encrypted: encryptedConfig }),
          encryptedRadiusPayload ? JSON.stringify({ encrypted: encryptedRadiusPayload }) : '{}',
          radiusAuthPort,
          radiusAcctPort,
          encryptedZenvia,
          encryptedSender,
          body.session_duration_minutes ?? 480,
          JSON.stringify(body.branding || {}),
        ],
      )
      const tenant = insertResult.rows[0]

      // 5. Insere seriais
      const serialRows: Record<string, unknown>[] = []
      for (const s of body.serials) {
        const serialResult = await client.query(
          'INSERT INTO tenant_serials (tenant_id, serial, role) VALUES ($1, $2, $3) RETURNING id, serial, role',
          [tenant.id, s.serial, s.role],
        )
        serialRows.push(serialResult.rows[0])
      }

      // 6. Audit log (usa plugin com client transacional)
      await fastify.logAudit({
        adminUserId: request.admin.id,
        action: 'tenant_created',
        payload: { tenant_id: tenant.id, name: body.name, port: body.port },
        ipAddress: request.ip,
        client,
      })

      await client.query('COMMIT')

      return reply.code(201).send({
        id: tenant.id,
        name: tenant.name,
        port: tenant.port,
        status: tenant.status,
        auth_mode: tenant.auth_mode,
        radius_auth_port: tenant.radius_auth_port,
        radius_acct_port: tenant.radius_acct_port,
        serials: serialRows,
        session_duration_minutes: tenant.session_duration_minutes,
        branding: tenant.branding || {},
        created_at: tenant.created_at,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // ─── GET /admin/tenants/:id ─────────────────────────────
  fastify.get('/admin/tenants/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const result = await fastify.db.query(
      `SELECT t.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ts.id, 'serial', ts.serial, 'role', ts.role))
                 FROM tenant_serials ts WHERE ts.tenant_id = t.id), '[]'
              ) AS serials
       FROM tenants t
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id],
    )

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado.',
        code: 404,
      })
    }

    const row = result.rows[0]

    // Stats de sessões
    const statsResult = await fastify.db.query(
      `SELECT
         COUNT(*)::int AS total_sessions,
         COUNT(*) FILTER (WHERE auth_at >= NOW() - INTERVAL '30 days')::int AS sessions_last_30d,
         MAX(auth_at) AS last_auth_at
       FROM wifi_sessions WHERE tenant_id = $1`,
      [id],
    )
    const stats = statsResult.rows[0]

    return reply.code(200).send({
      id: row.id,
      name: row.name,
      port: row.port,
      status: row.status,
      auth_mode: row.auth_mode ?? 'sonicwall',
      serials: row.serials,
      sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
      radius_config: sanitizeRadiusConfigFromDb(row, encryptionKey),
      radius_auth_port: row.radius_auth_port ?? null,
      radius_acct_port: row.radius_acct_port ?? null,
      has_zenvia_sender: !!row.zenvia_sender,
      provisioning_error: row.provisioning_error ?? null,
      container_id: row.container_id ?? null,
      provisioned_at: row.provisioned_at ?? null,
      session_duration_minutes: row.session_duration_minutes,
      branding: row.branding || {},
      stats: {
        total_sessions: stats.total_sessions,
        sessions_last_30d: stats.sessions_last_30d,
        last_auth_at: stats.last_auth_at,
      },
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  })

  // ─── PUT /admin/tenants/:id ─────────────────────────────
  fastify.put('/admin/tenants/:id', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          serials: {
            type: 'array',
            minItems: 1,
            maxItems: 2,
            items: {
              type: 'object',
              required: ['serial', 'role'],
              properties: {
                serial: { type: 'string', minLength: 1 },
                role: { type: 'string', enum: ['primary', 'secondary'] },
              },
            },
          },
          sonicwall_config: {
            type: 'object',
            properties: {
              host: { type: 'string' },
              port: { type: 'integer', minimum: 1, maximum: 65535 },
              user: { type: 'string' },
              password: { type: 'string' },
              firmware: { type: 'integer' },
              mode: { type: 'string', enum: ['rest', 'lhm'] },
              lhm_port: { type: 'integer' },
              guest_service_user: { type: 'string' },
              guest_service_pass: { type: 'string' },
            },
          },
          radius_config: {
            type: 'object',
            properties: {
              shared_secret: { type: 'string', minLength: 8, maxLength: 256 },
              coa_port: { type: 'integer', minimum: 1, maximum: 65535 },
              session_timeout_sec: { type: 'integer', minimum: 300, maximum: 86400 },
              nas_ip_allowlist: {
                type: 'array',
                items: { type: 'string', maxLength: 64 },
                maxItems: 32,
              },
            },
          },
          zenvia_token: { type: 'string' },
          zenvia_sender: { type: 'string', minLength: 1, maxLength: 64 },
          session_duration_minutes: { type: 'integer', minimum: 15, maximum: 1440 },
          branding: {
            type: 'object',
            properties: {
              logo_url: { type: 'string', maxLength: 2048 },
              primary_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
              secondary_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
              welcome_text: { type: 'string', maxLength: 500 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>

    // Busca tenant atual
    const existing = await fastify.db.query(
      'SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [id],
    )
    if (existing.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado.',
        code: 404,
      })
    }

    const client = await fastify.db.connect()
    try {
      await client.query('BEGIN')

      const updates: string[] = []
      const values: unknown[] = []
      let paramIdx = 1
      const changes: Record<string, unknown> = {}

      // name
      if (body['name'] !== undefined) {
        updates.push(`name = $${paramIdx++}`)
        values.push(body['name'])
        changes['name'] = body['name']
      }

      // session_duration_minutes
      if (body['session_duration_minutes'] !== undefined) {
        updates.push(`session_duration_minutes = $${paramIdx++}`)
        values.push(body['session_duration_minutes'])
        changes['session_duration_minutes'] = body['session_duration_minutes']
      }

      // sonicwall_config — merge com o existente
      if (body['sonicwall_config'] !== undefined) {
        const currentConfig = decryptConfigFromDb(existing.rows[0], encryptionKey) || {}
        const newConfig = { ...currentConfig, ...(body['sonicwall_config'] as Record<string, unknown>) }

        // Valida o resultado do merge (ponto crítico: troca de modo lhm→rest
        // que precise de host/user/password ainda não preenchidos).
        const modeError = validateModeRequirements(
          newConfig as { mode?: string; host?: string; user?: string; password?: string },
        )
        if (modeError) {
          await client.query('ROLLBACK')
          return reply.code(422).send({
            error: 'missing_mode_fields',
            message: modeError,
            code: 422,
          })
        }

        const encryptedConfig = encrypt(JSON.stringify(newConfig), encryptionKey)
        updates.push(`sonicwall_config = $${paramIdx++}`)
        values.push(JSON.stringify({ encrypted: encryptedConfig }))
        changes['sonicwall_config'] = 'updated'
      }

      // radius_config — merge com o existente + re-encriptar.
      // auth_mode NÃO é editável via PUT (mudar modo requer recriar container
      // + dealocar portas UDP, fluxo dedicado no futuro).
      if (body['radius_config'] !== undefined) {
        const existingRow = existing.rows[0]
        const existingRaw = (existingRow['radius_config'] as Record<string, unknown> | null) ?? null
        let currentRadius: RadiusConfig = {}
        if (existingRaw && existingRaw['encrypted'] && typeof existingRaw['encrypted'] === 'string') {
          try {
            currentRadius = JSON.parse(decrypt(existingRaw['encrypted'] as string, encryptionKey)) as RadiusConfig
          } catch {
            currentRadius = {}
          }
        }
        const merged: RadiusConfig = {
          ...currentRadius,
          ...(body['radius_config'] as RadiusConfig),
        }

        // Se o tenant é RADIUS, shared_secret deve continuar presente.
        if (existingRow['auth_mode'] === 'radius' && !merged.shared_secret) {
          await client.query('ROLLBACK')
          return reply.code(422).send({
            error: 'missing_radius_fields',
            message: 'shared_secret não pode ser removido de um tenant RADIUS.',
            code: 422,
          })
        }

        const encryptedRadius = encrypt(JSON.stringify(merged), encryptionKey)
        updates.push(`radius_config = $${paramIdx++}`)
        values.push(JSON.stringify({ encrypted: encryptedRadius }))
        // Não logamos o shared_secret; só indicamos que houve mudança.
        const { shared_secret, ...safeDiff } = body['radius_config'] as RadiusConfig
        changes['radius_config'] = {
          ...safeDiff,
          shared_secret: shared_secret ? 'updated' : undefined,
        }
      }

      // zenvia_token
      if (body['zenvia_token'] !== undefined) {
        const encryptedZenvia = encrypt(body['zenvia_token'] as string, encryptionKey)
        updates.push(`zenvia_token = $${paramIdx++}`)
        values.push(encryptedZenvia)
        changes['zenvia_token'] = 'updated'
      }

      // zenvia_sender
      if (body['zenvia_sender'] !== undefined) {
        const encryptedSender = encrypt(body['zenvia_sender'] as string, encryptionKey)
        updates.push(`zenvia_sender = $${paramIdx++}`)
        values.push(encryptedSender)
        changes['zenvia_sender'] = 'updated'
      }

      // branding — JSONB direto, sem criptografia
      if (body['branding'] !== undefined) {
        updates.push(`branding = $${paramIdx++}`)
        values.push(JSON.stringify(body['branding']))
        changes['branding'] = body['branding']
      }

      // serials — se enviados, substituir
      if (body['serials'] !== undefined) {
        const serials = body['serials'] as TenantSerial[]

        // Verifica conflitos com seriais de OUTROS tenants
        for (const s of serials) {
          const check = await client.query(
            'SELECT ts.id FROM tenant_serials ts JOIN tenants t ON t.id = ts.tenant_id WHERE ts.serial = $1 AND t.id != $2 AND t.deleted_at IS NULL',
            [s.serial, id],
          )
          if (check.rows.length > 0) {
            await client.query('ROLLBACK')
            return reply.code(409).send({
              error: 'conflict',
              message: `O serial ${s.serial} já está cadastrado em outro cliente.`,
              field: 'serial',
              code: 409,
            })
          }
        }

        await client.query('DELETE FROM tenant_serials WHERE tenant_id = $1', [id])
        for (const s of serials) {
          await client.query(
            'INSERT INTO tenant_serials (tenant_id, serial, role) VALUES ($1, $2, $3)',
            [id, s.serial, s.role],
          )
        }
        changes['serials'] = serials.map((s) => s.serial)
      }

      // Campos que entram como env var no container do portal — mudá-los
      // exige recriar o container, senão o valor novo fica no DB mas o
      // container segue com o antigo (ex: ALLOWED_SERIALS desatualizado → o
      // firewall novo volta 403 no serial-guard).
      const needsReprovision =
        body['serials'] !== undefined ||
        body['sonicwall_config'] !== undefined ||
        body['radius_config'] !== undefined ||
        body['zenvia_token'] !== undefined ||
        body['zenvia_sender'] !== undefined
      if (needsReprovision) {
        updates.push(`status = $${paramIdx++}`)
        values.push('provisioning')
        changes['status'] = 'provisioning'
      }

      // updated_at — atualiza sempre que houve qualquer mudança (incluindo só serials)
      if (updates.length > 0 || body['serials'] !== undefined) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`)
        values.push(id)
        await client.query(
          `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values,
        )
      }

      // Audit log com diff (usa plugin com client transacional)
      await fastify.logAudit({
        adminUserId: request.admin.id,
        action: 'tenant_updated',
        payload: { tenant_id: id, changes },
        ipAddress: request.ip,
        client,
      })

      await client.query('COMMIT')

      // Retorna tenant atualizado
      const updated = await fastify.db.query(
        `SELECT t.*,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', ts.id, 'serial', ts.serial, 'role', ts.role))
                   FROM tenant_serials ts WHERE ts.tenant_id = t.id), '[]'
                ) AS serials
         FROM tenants t WHERE t.id = $1`,
        [id],
      )
      const row = updated.rows[0]

      return reply.code(200).send({
        id: row.id,
        name: row.name,
        port: row.port,
        status: row.status,
        auth_mode: row.auth_mode ?? 'sonicwall',
        serials: row.serials,
        sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
        radius_config: sanitizeRadiusConfigFromDb(row, encryptionKey),
        radius_auth_port: row.radius_auth_port ?? null,
        radius_acct_port: row.radius_acct_port ?? null,
        session_duration_minutes: row.session_duration_minutes,
        branding: row.branding || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // ─── PATCH /admin/tenants/:id/status ────────────────────
  fastify.patch('/admin/tenants/:id/status', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: 'active' | 'inactive' }

    const result = await fastify.db.query(
      'UPDATE tenants SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, port, status',
      [status, id],
    )

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado.',
        code: 404,
      })
    }

    const action = status === 'active' ? 'tenant_activated' : 'tenant_deactivated'
    await fastify.logAudit({
      adminUserId: request.admin.id,
      action,
      payload: { tenant_id: id },
      ipAddress: request.ip,
    })

    return reply.code(200).send(result.rows[0])
  })

  // ─── POST /admin/tenants/:id/retry-provisioning ────────
  // Reseta um tenant em status='failed' de volta pra 'provisioning' pro
  // worker tentar de novo. Útil quando o admin corrigiu algo (ex: cert
  // SonicWall, libera porta no host) e quer reativar sem recriar.
  fastify.post('/admin/tenants/:id/retry-provisioning', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const result = await fastify.db.query(
      `UPDATE tenants
         SET status = 'provisioning',
             provisioning_error = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL AND status = 'failed'
       RETURNING id, name, status`,
      [id],
    )

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado ou não está em estado failed.',
        code: 404,
      })
    }

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'tenant_retry_provisioning',
      payload: { tenant_id: id },
      ipAddress: request.ip,
    })

    return reply.code(200).send(result.rows[0])
  })

  // ─── DELETE /admin/tenants/:id ──────────────────────────
  fastify.delete('/admin/tenants/:id', {
    preHandler: [fastify.authenticate, fastify.requireRole('superadmin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const result = await fastify.db.query(
      "UPDATE tenants SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id, name",
      [id],
    )

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado.',
        code: 404,
      })
    }

    await fastify.logAudit({
      adminUserId: request.admin.id,
      action: 'tenant_deleted',
      payload: { tenant_id: id, name: result.rows[0].name },
      ipAddress: request.ip,
    })

    return reply.code(200).send({ message: 'Tenant removido com sucesso.' })
  })

  // ─── GET /admin/tenants/:id/radius-status ─────────────────────
  // Handoff pro F11 (Carlos): badge online/offline + contagem de sessões
  // ativas por tenant RADIUS. Heurística de "online": status='active' e
  // chegou accounting recente (<5min). Spec: docs/spec-radius-auth.md §9.
  fastify.get('/admin/tenants/:id/radius-status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const tenantResult = await fastify.db.query(
      `SELECT id, auth_mode, status FROM tenants
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
    if (tenantResult.rows.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Tenant não encontrado.',
        code: 404,
      })
    }
    const tenant = tenantResult.rows[0]

    // Tenant não-RADIUS não tem listener UDP — retorna enabled=false.
    if (tenant.auth_mode !== 'radius') {
      return reply.code(200).send({
        enabled: false,
        online: false,
        active_sessions: 0,
        last_accounting_at: null,
      })
    }

    // Agrega estado do accounting — última sessão vista + ativas.
    const statsResult = await fastify.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE stopped_at IS NULL)::int AS active_sessions,
         MAX(started_at) AS last_accounting_at
       FROM radius_sessions WHERE tenant_id = $1`,
      [id],
    )
    const stats = statsResult.rows[0]
    // pg costuma parsear TIMESTAMPTZ como Date, mas se alguém ajustar um
    // type parser custom viraria string — normalizamos defensivamente pra
    // evitar `.getTime is not a function` em runtime.
    const rawLastAccounting = stats.last_accounting_at
    const lastAccounting: Date | null =
      rawLastAccounting == null
        ? null
        : rawLastAccounting instanceof Date
          ? rawLastAccounting
          : new Date(rawLastAccounting)

    // "online" exige 2 condições:
    //   - tenant ativo (container up — provisioner garante)
    //   - accounting visto há menos de 5min (NAS tá falando com a gente)
    // Se nunca rolou accounting (tenant novo), aceitamos active-no-traffic
    // como "online" — operador vê badge verde assim que configura, não
    // precisa esperar o primeiro guest.
    const FIVE_MIN_MS = 5 * 60 * 1000
    const hasRecentAccounting =
      lastAccounting !== null &&
      !Number.isNaN(lastAccounting.getTime()) &&
      Date.now() - lastAccounting.getTime() < FIVE_MIN_MS
    const neverSeenAccounting = lastAccounting === null
    const online =
      tenant.status === 'active' && (hasRecentAccounting || neverSeenAccounting)

    return reply.code(200).send({
      enabled: true,
      online,
      active_sessions: stats.active_sessions,
      last_accounting_at: lastAccounting ? lastAccounting.toISOString() : null,
    })
  })
}

export default tenantRoutes
