export interface ApiError {
  error: string
  message: string
  code: number
  field?: string
  attempts_remaining?: number
  retry_after?: number
}

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}
