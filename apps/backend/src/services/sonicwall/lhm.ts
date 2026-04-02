// Stub do LHM (Lightweight Hotspot Messaging).
// Implementação real fica para quando um cliente precisar desse modo.

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

export async function releaseAccessLhm(
  _params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  logger.error('sonicwall_lhm: modo LHM ainda não implementado')

  return {
    success: false,
    raw: { error: 'LHM não implementado. Configure SONICWALL_MODE=rest ou aguarde implementação futura.' },
    mode: 'lhm',
  }
}
