export type AdminRole = 'superadmin' | 'admin' | 'viewer'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: AdminRole
  last_login: string | null
  created_at: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: Pick<AdminUser, 'id' | 'name' | 'email' | 'role'>
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  role: AdminRole
}

export interface UpdateUserRequest {
  name?: string
  email?: string
  password?: string
  role?: AdminRole
}

export interface AuditLog {
  id: string
  user: {
    id: string
    name: string
    email: string
  }
  action: string
  payload: Record<string, unknown>
  ip_address: string
  created_at: string
}

export interface ReportSummary {
  period: { from: string; to: string }
  totals: {
    sessions: number
    unique_phones: number
    auth_attempts: number
    success_rate: number
  }
  by_tenant: {
    tenant_id: string
    tenant_name: string
    sessions: number
    unique_phones: number
  }[]
  by_day: {
    date: string
    sessions: number
  }[]
}
