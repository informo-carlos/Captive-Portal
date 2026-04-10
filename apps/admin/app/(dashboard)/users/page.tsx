'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AdminUser } from '@captive-portal/shared'
import { RequireRole } from '../../../components/require-role'
import { UserModal } from '../../../components/user-modal'
import { getUsers, deleteUser, ApiRequestError } from '../../../lib/api'
import { useAuth } from '../../../lib/auth-context'
import { useNotifications } from '../../../lib/notification-context'

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  superadmin: { label: 'Superadmin', className: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  admin: { label: 'Admin', className: 'bg-edge-cyan/10 text-edge-cyan border border-edge-cyan/20' },
  viewer: { label: 'Viewer', className: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const { add: notify } = useNotifications()
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
        setError('Erro ao carregar usuarios.')
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
      const deleted = users.find((u) => u.id === id)
      await deleteUser(id)
      notify({
        type: 'user',
        action: 'user_deleted',
        message: 'Usuario deletado',
        detail: deleted?.name || id,
      })
      setConfirmDeleteId(null)
      fetchUsers()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro ao deletar usuario.')
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
            <h1 className="text-2xl font-bold text-t-primary">Usuarios Admin</h1>
            <p className="mt-1 text-sm text-t-label">
              Gerencie os usuarios com acesso ao painel.
            </p>
          </div>
          <button
            onClick={() => setModalUser(null)}
            className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-[#0a0e17] hover:bg-edge-cyan/90 transition-colors"
          >
            Novo usuario
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl glass-card">
          <table className="min-w-full divide-y divide-t-default">
            <thead className="bg-t-thead">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Nome</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Email</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Perfil</th>
                <th className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-t-label">Ultimo login</th>
                <th className="px-6 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-t-label">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-default">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-t-label">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-t-label">
                    Nenhum usuario encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const badge = ROLE_BADGES[u.role] || ROLE_BADGES.viewer
                  const isSelf = currentUser?.id === u.id

                  return (
                    <tr key={u.id} className="hover:bg-t-hover-subtle transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-t-secondary">
                        {u.name}
                        {isSelf && (
                          <span className="ml-2 text-[10px] text-t-label">(voce)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-t-muted">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-t-muted">
                        {formatDate(u.last_login)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModalUser(u)}
                            className="rounded-md px-2 py-1 text-xs text-edge-cyan hover:bg-edge-cyan/10 transition-colors"
                          >
                            Editar
                          </button>
                          {!isSelf && (
                            <>
                              {confirmDeleteId === u.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-t-label">Confirmar?</span>
                                  <button
                                    onClick={() => handleDelete(u.id)}
                                    disabled={deletingId === u.id}
                                    className="rounded-md px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                                  >
                                    {deletingId === u.id ? '...' : 'Sim'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-md px-2 py-1 text-xs text-t-label hover:bg-t-hover transition-colors"
                                  >
                                    Nao
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(u.id)}
                                  className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
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
