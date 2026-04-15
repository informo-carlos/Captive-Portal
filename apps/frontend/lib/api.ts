import type { ApiError } from '@captive-portal/shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export class ApiRequestError extends Error {
  public readonly error: string
  public readonly code: number
  public readonly field?: string
  public readonly attempts_remaining?: number
  public readonly retry_after?: number

  constructor(apiError: ApiError) {
    super(apiError.message)
    this.name = 'ApiRequestError'
    this.error = apiError.error
    this.code = apiError.code
    this.field = apiError.field
    this.attempts_remaining = apiError.attempts_remaining
    this.retry_after = apiError.retry_after
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiRequestError({
      error: 'network_error',
      message: 'Erro de comunicação com o servidor. Tente novamente.',
      code: res.status,
    })
  }

  if (!res.ok) {
    throw new ApiRequestError(body as ApiError)
  }

  return body as T
}

// ─── Portal endpoints ───────────────────────────────────

export interface RequestOtpParams {
  phone: string
  mac: string
  ip: string
  /**
   * Qualquer query param extra capturado no redirect inicial do SonicWall
   * (modo LHM/External Guest Auth). Ex: sessionId, magic, mgmtBaseUrl, etc.
   * Vai direto pro Redis junto com a sessão e é usado de volta no verify-otp.
   */
  lhm_params?: Record<string, string>
}

export interface RequestOtpResponse {
  message: string
  expires_in: number
}

export function requestOtp(
  params: RequestOtpParams,
  serial: string,
): Promise<RequestOtpResponse> {
  return request<RequestOtpResponse>('/auth/request-otp', {
    method: 'POST',
    headers: { 'X-Sonicwall-Serial': serial },
    body: JSON.stringify(params),
  })
}

export interface VerifyOtpParams {
  phone: string
  otp: string
}

/**
 * Payload que o backend devolve em modo LHM pra o browser do guest (que
 * está DENTRO da LAN do SW) disparar o POST final em /lhmapi/externalAAAGuest.
 * A VPS não tem rota pro mgmtBaseUrl do SW, então o browser faz o trabalho.
 */
export interface LhmBrowserSubmit {
  urls: string[]
  body: string
  redirectTo: string
}

export interface VerifyOtpResponse {
  message: string
  expires_in: number
  /**
   * Em modo LHM o backend devolve aqui o payload pro browser disparar
   * o POST no SonicWall. Em modo REST vem vazio e a UI mostra /success.
   */
  lhm_submit?: LhmBrowserSubmit
}

export function verifyOtp(
  params: VerifyOtpParams,
  serial: string,
): Promise<VerifyOtpResponse> {
  return request<VerifyOtpResponse>('/auth/verify-otp', {
    method: 'POST',
    headers: { 'X-Sonicwall-Serial': serial },
    body: JSON.stringify(params),
  })
}
