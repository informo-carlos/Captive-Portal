import type { FastifyPluginAsync } from 'fastify'
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
      // Não retornamos o sender em si — apenas se está configurado.
      // Mesmo padrão do password: nunca sai do backend depois de gravado.
      has_zenvia_sender: !!row['zenvia_sender'],
      provisioning_error: row['provisioning_error'] ?? null,
      container_id: row['container_id'] ?? null,
      provisioned_at: row['provisioned_at'] ?? null,
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
        required: ['name', 'port', 'serials', 'sonicwall_config', 'zenvia_token', 'zenvia_sender'],
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
            // Apenas `mode` é universalmente obrigatório. Os demais campos são
            // exigidos conforme o modo, e a validação acontece no handler em
            // validateModeRequirements (ver acima).
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
          zenvia_token: { type: 'string', minLength: 1 },
          zenvia_sender: { type: 'string', minLength: 1, maxLength: 64 },
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
      zenvia_sender: string
      session_duration_minutes?: number
    }

    // Valida campos obrigatórios conforme o modo (rest exige host/user/pass).
    const modeError = validateModeRequirements(body.sonicwall_config)
    if (modeError) {
      return reply.code(422).send({
        error: 'missing_mode_fields',
        message: modeError,
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
      const encryptedSender = encrypt(body.zenvia_sender, encryptionKey)

      // 4. Insere tenant — começa em status='provisioning'.
      // O worker (apps/provisioner) vai pegar o registro, criar o container
      // Docker e o bloco nginx, e mover pra 'active'. Em caso de falha, vai
      // pra 'failed' com a mensagem em provisioning_error.
      const insertResult = await client.query(
        `INSERT INTO tenants (name, port, status, sonicwall_config, zenvia_token, zenvia_sender, session_duration_minutes)
         VALUES ($1, $2, 'provisioning', $3, $4, $5, $6)
         RETURNING id, name, port, status, session_duration_minutes, created_at`,
        [
          body.name,
          body.port,
          JSON.stringify({ encrypted: encryptedConfig }),
          encryptedZenvia,
          encryptedSender,
          body.session_duration_minutes ?? 480,
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
      has_zenvia_sender: !!row.zenvia_sender,
      provisioning_error: row.provisioning_error ?? null,
      container_id: row.container_id ?? null,
      provisioned_at: row.provisioned_at ?? null,
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
          zenvia_token: { type: 'string' },
          zenvia_sender: { type: 'string', minLength: 1, maxLength: 64 },
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
}

export default tenantRoutes
