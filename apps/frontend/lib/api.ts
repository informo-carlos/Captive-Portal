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

// ─── Branding ───────────────────────────────────────────

export interface BrandingResponse {
  logo_url: string | null
  primary_color: string
  secondary_color: string
  welcome_text: string | null
}

export function fetchBranding(): Promise<BrandingResponse> {
  return request<BrandingResponse>('/branding')
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

export interface VerifyOtpResponse {
  message: string
  expires_in: number
  /**
   * @deprecated Protocolo CGI antigo (SonicOS <= 7.2). Mantido pra compat.
   * Em LHM 7.3+ use lhm_post.
   */
  redirect_url?: string
  /**
   * Em LHM 7.3+ (SonicOS >= 7.3.2), o backend devolve as instruções de POST
   * que o frontend deve executar cross-origin via fetch no-cors. Após o POST
   * o browser redireciona pra req_url (ou /success se não houver).
   */
  lhm_post?: {
    url: string
    payload: Record<string, unknown>
    req_url?: string
  }
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
