// LHM — Lightweight Hotspot Messaging / External Guest Authentication
//
// Modelo de comunicação:
//
//   1. Cliente Wi-Fi conecta no SSID com External Guest Auth habilitado
//   2. SonicWall intercepta o tráfego HTTP e redireciona pra URL do nosso
//      portal, INJETANDO query params como sessionId, mac, ip, srcZone,
//      mgmtBaseUrl, magic. Os nomes/quantidade variam por firmware.
//   3. Nosso serial-guard captura esses params e armazena no Redis junto
//      com a sessão OTP, indexado por (tenantId, mac).
//   4. Usuário faz fluxo OTP normal.
//   5. No verify-otp, em vez de chamar API REST do SonicWall, esta função
//      MONTA uma URL especial DO PRÓPRIO SONICWALL (geralmente apontando
//      pro mgmtBaseUrl que veio no redirect) e devolve no `redirectUrl`.
//   6. O frontend redireciona o navegador do usuário pra essa URL. Como
//      o navegador está DENTRO da rede do cliente, fala com o gateway
//      local — nossa VPS NUNCA toca no SonicWall.
//
// IMPORTANTE: o formato exato da URL de retorno e o cálculo do hash/magic
// dependem do firmware do SonicWall. Os TODOs abaixo só podem ser
// preenchidos com o protocolo capturado contra um aparelho real.
// Ver: docs/lhm-protocol-tz570.md (a ser criado na sessão de mapeamento)

import type { FastifyBaseLogger } from 'fastify'
import type { ReleaseAccessParams, ReleaseAccessResult, SonicwallConfig } from './index'

/**
 * Lista de nomes de query params que SonicWalls em modo External Guest Auth
 * costumam injetar no redirect inicial. Capturamos qualquer um que aparecer
 * e guardamos cru — não validamos formato aqui porque varia por firmware.
 */
export const KNOWN_LHM_PARAM_NAMES = [
  'sessionId',
  'mac',
  'ip',
  'srcZone',
  'dstZone',
  'mgmtBaseUrl',
  'clientRedirectUrl',
  'magic',
  'hash',
  'ifName',
  'urlFragment',
] as const

export async function releaseAccessLhm(
  params: ReleaseAccessParams,
  _config: SonicwallConfig,
  logger: FastifyBaseLogger,
): Promise<ReleaseAccessResult> {
  const lhm = params.lhmParams ?? {}

  // Sem os params do redirect inicial não há LHM possível — significa que
  // o usuário chegou no portal sem passar pelo SonicWall (ex: acesso direto
  // por IP). Nesse caso falhamos com erro claro.
  if (!lhm['mac'] && !lhm['sessionId']) {
    logger.error(
      { hasLhmParams: Object.keys(lhm).length > 0, lhmKeys: Object.keys(lhm) },
      'lhm_missing_redirect_params',
    )
    return {
      success: false,
      raw: {
        error: 'missing_lhm_params',
        message:
          'Esta sessão não foi iniciada via redirect do SonicWall. ' +
          'Conecte-se à rede Wi-Fi e tente novamente.',
      },
      mode: 'lhm',
    }
  }

  // TODO(fase 2): preencher após mapeamento contra TZ 570
  //
  // O que falta descobrir na sessão ao vivo com o aparelho:
  //
  //   1. Qual é a URL base que o SonicWall espera de volta?
  //      Hipóteses comuns:
  //        - https://<gateway>:8081/sonicui/7/login/auth (porta interna do SonicOS)
  //        - O próprio mgmtBaseUrl que veio no redirect
  //        - Uma URL fixa configurada no External Guest Auth
  //
  //   2. Quais query params/body o redirect de volta precisa carregar?
  //      Hipóteses: sessionId, mac, magic (ecoado do redirect inicial),
  //      authenticated=1, e possivelmente um HMAC calculado com
  //      guest_service_pass + sessionId.
  //
  //   3. Precisa de algum HMAC/assinatura? Em qual formato?
  //
  // Até a fase 2, retornamos erro descritivo pra não dar falso positivo.

  logger.error(
    { lhmParams: lhm, mac: params.mac, ip: params.ip },
    'lhm_protocol_not_yet_mapped',
  )

  return {
    success: false,
    raw: {
      error: 'lhm_protocol_not_mapped',
      message:
        'LHM aguardando mapeamento do protocolo contra o SonicWall TZ 570. ' +
        'Ver TODO em services/sonicwall/lhm.ts',
      capturedParams: lhm,
    },
    mode: 'lhm',
  }
}
