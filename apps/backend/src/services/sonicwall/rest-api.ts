// Estratégia REST — STUB.
//
// A SonicOS API (validada contra TZ 570 + OpenAPI oficial) NÃO expõe
// endpoint pra liberar guest individual por MAC/IP. O caminho real de
// produção é o LHM (External Guest Authentication) — ver lhm.ts.
//
// Esta estratégia existe como STUB DE SUCESSO pra ambientes onde o
// SonicWall não está habilitado (dev, staging, demo) ou pra tenants
// configurados em modo "open" enquanto não habilitam o LHM no firewall.
//
// IMPORTANTE: em produção real, sempre use SONICWALL_MODE=lhm.

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

export async function releaseAccessRest(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  logger.warn(
    { mac: params.mac, mode: 'rest' },
    'sonicwall_rest_stub_success',
  )

  return {
    success: true,
    raw: {
      protocol: 'rest-stub',
      note: 'REST mode é stub — para liberar guest de verdade use SONICWALL_MODE=lhm',
    },
    mode: 'rest',
  }
}
