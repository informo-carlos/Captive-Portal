// ⚠️  ESTRATÉGIA REST DESCONTINUADA  ⚠️
//
// Validamos contra um SonicWall TZ 570 (SonicOS 7.3.2) e contra a documentação
// oficial do SonicOS API: NÃO existe endpoint REST público pra liberar um
// guest individual por MAC/IP. Os endpoints /user/guest/* só fazem
// configuração de perfis e logout em massa.
//
// Esta função existe apenas para falhar de forma explícita se alguém ainda
// configurar SONICWALL_MODE=rest. O caminho oficial pra liberar guest a
// partir de portal externo é "External Guest Authentication" via LHM.
//
// Ver: services/sonicwall/lhm.ts

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

export async function releaseAccessRest(
  _params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const message =
    'SonicWall REST API não suporta liberação de guest por MAC/IP. ' +
    'Configure SONICWALL_MODE=lhm e habilite External Guest Authentication ' +
    'na zona Wi-Fi do SonicWall.'

  logger.error({ mode: 'rest' }, 'sonicwall_rest_unsupported')

  return {
    success: false,
    raw: { error: 'rest_mode_unsupported', message },
    mode: 'rest',
  }
}
