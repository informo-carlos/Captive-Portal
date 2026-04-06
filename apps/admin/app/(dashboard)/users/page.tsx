'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AdminUser } from '@captive-portal/shared'
import { RequireRole } from '../../../components/require-role'
import { UserModal } from '../../../components/user-modal'
import { getUsers, deleteUser, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  superadmin: { label: 'Superadmin', className: 'bg-purple-100 text-purple-700' },
  admin: { label: 'Admin', className: 'bg-blue-100 text-blue-700' },
  viewer: { label: 'Viewer', className: 'bg-gray-100 text-gray-700' },
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalUser, setModalUser] = useState<AdminUser | null | undefined>(undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsers()
      setUsers(res.data)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao carregar usuários.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteUser(id)
      setConfirmDeleteId(null)
      fetchUsers()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao deletar usuário.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca'
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <RequireRole minRole="superadmin">
      <div>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios Admin</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie os usuarios com acesso ao painel.
            </p>
          </div>
          <button
            onClick={() => setModalUser(null)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Novo usuario
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Perfil</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ultimo login</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    Nenhum usuario encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const badge = ROLE_BADGES[u.role] || ROLE_BADGES.viewer
                  const isSelf = currentUser?.id === u.id

                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {u.name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-400">(voce)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(u.last_login)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModalUser(u)}
                            className="rounded px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            Editar
                          </button>
                          {!isSelf && (
                            <>
                              {confirmDeleteId === u.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-500">Confirmar?</span>
                                  <button
                                    onClick={() => handleDelete(u.id)}
                                    disabled={deletingId === u.id}
                                    className="rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                  >
                                    {deletingId === u.id ? '...' : 'Sim'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
                                  >
                                    Nao
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(u.id)}
                                  className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  Deletar
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {modalUser !== undefined && (
          <UserModal
            user={modalUser}
            onClose={() => setModalUser(undefined)}
            onSuccess={() => {
              setModalUser(undefined)
              fetchUsers()
            }}
          />
        )}
      </div>
    </RequireRole>
  )
}
