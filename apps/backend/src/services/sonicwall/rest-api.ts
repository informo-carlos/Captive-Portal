// Stub da estratégia REST API — B7 implementa a chamada real à SonicOS API.
// Na B6, simula sucesso para permitir teste do fluxo completo.

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

export async function releaseAccessRest(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  logger.info(
    { mac: params.mac, ip: params.ip, phone: params.phone, sessionMinutes: params.sessionMinutes },
    'sonicwall_rest_stub: acesso simulado com sucesso',
  )

  return {
    success: true,
    raw: { stub: true, message: 'SonicWall REST API stub — B7 implementa chamada real' },
    mode: 'rest',
  }
}
