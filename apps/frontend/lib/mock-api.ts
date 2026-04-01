/**
 * Mock da API para F2 — simula respostas do backend.
 * Será substituído por chamadas reais em F3.
 *
 * Seriais válidos para mock: "MOCK-SN-001", "MOCK-SN-002"
 *
 * Simulação de erros:
 * - Telefone "11999990000" → rate_limit (429)
 * - OTP "000000" → invalid_otp (422) com tentativas restantes
 * - OTP "999999" → otp_blocked (422)
 * - OTP "111111" → otp_not_found (404)
 * - OTP "222222" → sonicwall_failed (502)
 * - OTP "123456" → sucesso
 * - Qualquer outro OTP de 6 dígitos → invalid_otp
 */

import { ApiRequestError } from './api'
import type { RequestOtpResponse, VerifyOtpResponse } from './api'

const VALID_SERIALS = ['MOCK-SN-001', 'MOCK-SN-002']
const MOCK_DELAY_MS = 800

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isValidSerial(serial: string | null): boolean {
  if (!serial) return false
  return VALID_SERIALS.includes(serial)
}

export async function mockRequestOtp(
  phone: string,
  serial: string,
): Promise<RequestOtpResponse> {
  await delay(MOCK_DELAY_MS)

  if (!isValidSerial(serial)) {
    throw new ApiRequestError({
      error: 'unauthorized_firewall',
      message: 'Este dispositivo não está autorizado a usar este portal.',
      code: 403,
    })
  }

  if (phone === '11999990000') {
    throw new ApiRequestError({
      error: 'rate_limit',
      message: 'Muitas tentativas. Aguarde 10 minutos.',
      code: 429,
      retry_after: 600,
    })
  }

  return {
    message: 'Código enviado por SMS.',
    expires_in: 300,
  }
}

let mockAttemptsRemaining = 3

export async function mockVerifyOtp(
  otp: string,
  serial: string,
): Promise<VerifyOtpResponse> {
  await delay(MOCK_DELAY_MS)

  if (!isValidSerial(serial)) {
    throw new ApiRequestError({
      error: 'unauthorized_firewall',
      message: 'Este dispositivo não está autorizado a usar este portal.',
      code: 403,
    })
  }

  switch (otp) {
    case '123456':
      mockAttemptsRemaining = 3
      return {
        message: 'Acesso liberado. Você já pode navegar.',
        expires_in: 28800,
      }

    case '000000':
      mockAttemptsRemaining = Math.max(0, mockAttemptsRemaining - 1)
      throw new ApiRequestError({
        error: 'invalid_otp',
        message: 'Código inválido.',
        code: 422,
        attempts_remaining: mockAttemptsRemaining,
      })

    case '999999':
      throw new ApiRequestError({
        error: 'otp_blocked',
        message: 'Muitas tentativas incorretas. Solicite um novo código.',
        code: 422,
      })

    case '111111':
      throw new ApiRequestError({
        error: 'otp_not_found',
        message: 'Código expirado ou não solicitado. Solicite um novo código.',
        code: 404,
      })

    case '222222':
      throw new ApiRequestError({
        error: 'sonicwall_failed',
        message:
          'Autenticação válida, mas falha ao liberar acesso. Contate o suporte.',
        code: 502,
      })

    default:
      mockAttemptsRemaining = Math.max(0, mockAttemptsRemaining - 1)
      throw new ApiRequestError({
        error: 'invalid_otp',
        message: 'Código inválido.',
        code: 422,
        attempts_remaining: mockAttemptsRemaining,
      })
  }
}

export function resetMockAttempts(): void {
  mockAttemptsRemaining = 3
}
