// Cliente real da Zenvia SMS API v2.
// Endpoint: POST https://api.zenvia.com/v2/channels/sms/messages
// Auth:     header X-API-TOKEN
// Payload:  { from, to (E.164 sem '+'), contents: [{ type: 'text', text }] }
//
// NUNCA logar o OTP — regra do CLAUDE.md. Apenas { otp_sent: true }.

import type { FastifyBaseLogger } from 'fastify'

interface SendOtpParams {
  to: string         // E.164 sem o '+' (ex: 5514999024004)
  otp: string        // 6 dígitos
  tenantName: string
}

interface ZenviaConfig {
  token: string
  sender: string
}

const ZENVIA_URL = 'https://api.zenvia.com/v2/channels/sms/messages'
const TIMEOUT_MS = 10_000

export async function sendOtpSms(
  params: SendOtpParams,
  config: ZenviaConfig,
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!config.token || !config.sender) {
    logger.error(
      { hasToken: !!config.token, hasSender: !!config.sender },
      'zenvia_not_configured',
    )
    throw new Error('zenvia_not_configured')
  }

  const text = `${params.tenantName}: seu código de acesso é ${params.otp}. Válido por 5 minutos.`

  const body = {
    from: config.sender,
    to: params.to,
    contents: [{ type: 'text', text }],
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(ZENVIA_URL, {
      method: 'POST',
      headers: {
        'X-API-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const isAbort = (err as Error).name === 'AbortError'
    logger.error(
      { to: params.to, error: (err as Error).message, timeout: isAbort },
      'zenvia_request_failed',
    )
    throw new Error(isAbort ? 'zenvia_timeout' : 'zenvia_network_error')
  }
  clearTimeout(timer)

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text().catch(() => '<empty>')
    }
    logger.error(
      { to: params.to, status: response.status, body: errorBody },
      'zenvia_api_error',
    )
    throw new Error(`zenvia_api_error_${response.status}`)
  }

  const data = (await response.json()) as { id?: string; direction?: string }

  // OK — NUNCA logar o OTP.
  logger.info(
    {
      to: params.to,
      tenantName: params.tenantName,
      messageId: data.id,
      direction: data.direction,
      otp_sent: true,
    },
    'zenvia_sms_sent',
  )
}
