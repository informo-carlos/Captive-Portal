import type { FastifyPluginAsync } from 'fastify'
import { encrypt, decrypt } from '../services/crypto'

interface TenantSerial {
  serial: string
  role: 'primary' | 'secondary'
}

interface SonicwallConfig {
  host: string
  user: string
  password: string
  firmware?: number
  mode: 'rest' | 'lhm'
  lhm_port?: number
  guest_service_user?: string
  guest_service_pass?: string
}

// Validação LHM: campos obrigatórios quando mode = 'lhm'
function validateLhmConfig(config: { mode?: string; guest_service_user?: string; guest_service_pass?: string }): string | null {
  if (config.mode === 'lhm') {
    if (!config.guest_service_user || !config.guest_service_pass) {
      return 'Campos guest_service_user e guest_service_pass são obrigatórios quando mode = "lhm".'
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
              t.session_duration_minutes, t.created_at, t.updated_at,
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
      serials: row['serials'],
      sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
      session_duration_minutes: row['session_duration_minutes'],
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
        required: ['name', 'port', 'serials', 'sonicwall_config', 'zenvia_token'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          port: { type: 'integer', minimum: 29000, maximum: 29999 },
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
            required: ['host', 'user', 'password', 'mode'],
            properties: {
              host: { type: 'string', minLength: 1 },
              user: { type: 'string', minLength: 1 },
              password: { type: 'string', minLength: 1 },
              firmware: { type: 'integer' },
              mode: { type: 'string', enum: ['rest', 'lhm'] },
              lhm_port: { type: 'integer' },
              guest_service_user: { type: 'string' },
              guest_service_pass: { type: 'string' },
            },
          },
          zenvia_token: { type: 'string', minLength: 1 },
          session_duration_minutes: { type: 'integer', minimum: 15, maximum: 1440, default: 480 },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      port: number
      serials: TenantSerial[]
      sonicwall_config: SonicwallConfig
      zenvia_token: string
      session_duration_minutes?: number
    }

    // Validação LHM
    const lhmError = validateLhmConfig(body.sonicwall_config)
    if (lhmError) {
      return reply.code(422).send({
        error: 'missing_lhm_fields',
        message: lhmError,
        code: 422,
      })
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
      const encryptedConfig = encrypt(JSON.stringify(body.sonicwall_config), encryptionKey)
      const encryptedZenvia = encrypt(body.zenvia_token, encryptionKey)

      // 4. Insere tenant
      const insertResult = await client.query(
        `INSERT INTO tenants (name, port, status, sonicwall_config, zenvia_token, session_duration_minutes)
         VALUES ($1, $2, 'active', $3, $4, $5)
         RETURNING id, name, port, status, session_duration_minutes, created_at`,
        [body.name, body.port, JSON.stringify({ encrypted: encryptedConfig }), encryptedZenvia, body.session_duration_minutes ?? 480],
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
        serials: serialRows,
        session_duration_minutes: tenant.session_duration_minutes,
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
      serials: row.serials,
      sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
      session_duration_minutes: row.session_duration_minutes,
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
              user: { type: 'string' },
              password: { type: 'string' },
              firmware: { type: 'integer' },
              mode: { type: 'string', enum: ['rest', 'lhm'] },
              lhm_port: { type: 'integer' },
              guest_service_user: { type: 'string' },
              guest_service_pass: { type: 'string' },
            },
          },
          zenvia_token: { type: 'string' },
          session_duration_minutes: { type: 'integer', minimum: 15, maximum: 1440 },
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

        // Validação LHM após merge (ponto crítico: rest→lhm sem guest_service)
        const lhmError = validateLhmConfig(newConfig as { mode?: string; guest_service_user?: string; guest_service_pass?: string })
        if (lhmError) {
          await client.query('ROLLBACK')
          return reply.code(422).send({
            error: 'missing_lhm_fields',
            message: lhmError,
            code: 422,
          })
        }

        const encryptedConfig = encrypt(JSON.stringify(newConfig), encryptionKey)
        updates.push(`sonicwall_config = $${paramIdx++}`)
        values.push(JSON.stringify({ encrypted: encryptedConfig }))
        changes['sonicwall_config'] = 'updated'
      }

      // zenvia_token
      if (body['zenvia_token'] !== undefined) {
        const encryptedZenvia = encrypt(body['zenvia_token'] as string, encryptionKey)
        updates.push(`zenvia_token = $${paramIdx++}`)
        values.push(encryptedZenvia)
        changes['zenvia_token'] = 'updated'
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
        serials: row.serials,
        sonicwall_config: sanitizeConfigFromDb(row, encryptionKey),
        session_duration_minutes: row.session_duration_minutes,
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
}

export default tenantRoutes
