import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'

export interface AuditLogParams {
  adminUserId: string
  action: string
  payload: Record<string, unknown>
  ipAddress: string
  client?: PoolClient
}

declare module 'fastify' {
  interface FastifyInstance {
    logAudit: (params: AuditLogParams) => Promise<void>
  }
}

export default fp(async (fastify: FastifyInstance) => {
  async function logAudit(params: AuditLogParams): Promise<void> {
    const db: Pool | PoolClient = params.client ?? fastify.db
    await db.query(
      `INSERT INTO audit_logs (admin_user_id, action, payload, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [params.adminUserId, params.action, JSON.stringify(params.payload), params.ipAddress],
    )
  }

  fastify.decorate('logAudit', logAudit)
})
