// Stub do serviço Zenvia — B6 usa esse stub, B7 implementa o envio real.
// Em dev, loga o OTP como otp_sent: true (NUNCA loga o código real).

import type { FastifyBaseLogger } from 'fastify'

interface SendSmsParams {
  to: string        // E.164 sem o +
  otp: string       // 6 dígitos
  tenantName: string
}

export async function sendOtpSms(
  params: SendSmsParams,
  _zenviaToken: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  // Stub: não envia SMS real, apenas loga que foi "enviado"
  // NUNCA logar o OTP — regra do CLAUDE.md
  logger.info(
    { to: params.to, tenantName: params.tenantName, otp_sent: true },
    'zenvia_sms_stub: SMS simulado com sucesso',
  )
}
