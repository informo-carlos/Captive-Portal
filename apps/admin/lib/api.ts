import type {
  ApiError,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  AdminUser,
  Tenant,
  TenantDetail,
  CreateTenantRequest,
  UpdateTenantRequest,
  WifiSession,
  ReportSummary,
  CreateUserRequest,
  UpdateUserRequest,
  AuditLog,
} from '@captive-portal/shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// ─── Token management ───────────────────────────────────

let authToken: string | null = null

export function setToken(token: string | null) {
  authToken = token
  if (token) {
    localStorage.setItem('token', token)
  } else {
    localStorage.removeItem('token')
  }
}

export function getToken(): string | null {
  if (authToken) return authToken
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('token')
  }
  return authToken
}

// ─── Error class ────────────────────────────────────────

export class ApiRequestError extends Error {
  public readonly error: string
  public readonly code: number
  public readonly field?: string

  constructor(apiError: ApiError) {
    super(apiError.message)
    this.name = 'ApiRequestError'
    this.error = apiError.error
    this.code = apiError.code
    this.field = apiError.field
  }
}

// ─── Base request ───────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...options, headers })

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
    const apiError = body as ApiError

    // Token invalido ou expirado — limpar e redirecionar
    if (res.status === 401) {
      setToken(null)
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }

    throw new ApiRequestError(apiError)
  }

  return body as T
}

// ─── Auth ───────────────────────────────────────────────

export function login(params: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function getMe(): Promise<AdminUser> {
  return request<AdminUser>('/admin/auth/me')
}

// ─── Tenants ────────────────────────────────────────────

export function getTenants(
  params?: { status?: string; page?: number; limit?: number },
): Promise<PaginatedResponse<Tenant>> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return request<PaginatedResponse<Tenant>>(`/admin/tenants${qs ? `?${qs}` : ''}`)
}

export function getTenant(id: string): Promise<TenantDetail> {
  return request<TenantDetail>(`/admin/tenants/${id}`)
}

export function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  return request<Tenant>('/admin/tenants', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTenant(id: string, data: UpdateTenantRequest): Promise<Tenant> {
  return request<Tenant>(`/admin/tenants/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function updateTenantStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<void> {
  return request<void>(`/admin/tenants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function deleteTenant(id: string): Promise<void> {
  return request<void>(`/admin/tenants/${id}`, { method: 'DELETE' })
}

// ─── Sessions ───────────────────────────────────────────

export function getSessions(
  params?: {
    tenant_id?: string
    from?: string
    to?: string
    phone?: string
    page?: number
    limit?: number
  },
): Promise<PaginatedResponse<WifiSession>> {
  const query = new URLSearchParams()
  if (params?.tenant_id) query.set('tenant_id', params.tenant_id)
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  if (params?.phone) query.set('phone', params.phone)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return request<PaginatedResponse<WifiSession>>(`/admin/sessions${qs ? `?${qs}` : ''}`)
}

// ─── Reports ────────────────────────────────────────────

export function getReportSummary(
  params?: { tenant_id?: string; from?: string; to?: string },
): Promise<ReportSummary> {
  const query = new URLSearchParams()
  if (params?.tenant_id) query.set('tenant_id', params.tenant_id)
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  const qs = query.toString()
  return request<ReportSummary>(`/admin/reports/summary${qs ? `?${qs}` : ''}`)
}

// ─── Users ──────────────────────────────────────────────

export function getUsers(): Promise<{ data: AdminUser[] }> {
  return request<{ data: AdminUser[] }>('/admin/users')
}

export function createUser(data: CreateUserRequest): Promise<AdminUser> {
  return request<AdminUser>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateUser(id: string, data: UpdateUserRequest): Promise<AdminUser> {
  return request<AdminUser>(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteUser(id: string): Promise<void> {
  return request<void>(`/admin/users/${id}`, { method: 'DELETE' })
}

// ─── Audit Logs ─────────────────────────────────────────

export function getAuditLogs(
  params?: {
    from?: string
    to?: string
    admin_user_id?: string
    action?: string
    page?: number
    limit?: number
  },
): Promise<PaginatedResponse<AuditLog>> {
  const query = new URLSearchParams()
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  if (params?.admin_user_id) query.set('admin_user_id', params.admin_user_id)
  if (params?.action) query.set('action', params.action)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return request<PaginatedResponse<AuditLog>>(`/admin/audit-logs${qs ? `?${qs}` : ''}`)
}
