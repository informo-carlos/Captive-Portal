'use client'

import { useState, useEffect } from 'react'
import type { AdminUser, AdminRole, CreateUserRequest, UpdateUserRequest } from '@captive-portal/shared'
import { createUser, updateUser, ApiRequestError } from '../lib/api'
import { useNotifications } from '../lib/notification-context'

interface UserModalProps {
  user: AdminUser | null
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  name: string
  email: string
  password: string
  role: AdminRole
}

const EMPTY_FORM: FormData = {
  name: '',
  email: '',
  password: '',
  role: 'viewer',
}

const inputClass =
  'w-full rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm text-t-primary placeholder:text-t-placeholder focus:outline-none focus:ring-1 focus:ring-edge-cyan/40'

export function UserModal({ user, onClose, onSuccess }: UserModalProps) {
  const isEditing = !!user
  const { add: notify } = useNotifications()
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
      })
    }
  }, [user])

  const setField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldError?.field === field) setFieldError(null)
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Nome é obrigatório.'
    if (!form.email.trim()) return 'Email é obrigatório.'
    if (!form.email.includes('@')) return 'Email inválido.'
    if (!isEditing && !form.password.trim()) return 'Senha é obrigatória.'
    if (!isEditing && form.password.length < 6) return 'Senha deve ter no mínimo 6 caracteres.'
    if (isEditing && form.password && form.password.length < 6) return 'Senha deve ter no mínimo 6 caracteres.'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    try {
      if (isEditing) {
        const data: UpdateUserRequest = {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
        }
        if (form.password.trim()) {
          data.password = form.password.trim()
        }
        await updateUser(user!.id, data)
        notify({
          type: 'user',
          action: 'user_updated',
          status: 'completed',
          message: 'Usuario atualizado',
          detail: `${form.name.trim()} (${form.role})`,
        })
      } else {
        const data: CreateUserRequest = {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          role: form.role,
        }
        await createUser(data)
        notify({
          type: 'user',
          action: 'user_created',
          status: 'completed',
          message: 'Novo usuario criado',
          detail: `${form.name.trim()} (${form.role})`,
        })
      }
      onSuccess()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.field) {
          setFieldError({ field: err.field, message: err.message })
        }
        setError(err.message)
      } else {
        setError('Erro inesperado. Tente novamente.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-t-overlay backdrop-blur-sm pt-10 pb-10 animate-modal-overlay">
      <div className="w-full max-w-md rounded-xl border border-t-input bg-t-card shadow-xl animate-modal-content">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-t-default px-6 py-4">
          <h2 className="text-lg font-semibold text-t-primary">
            {isEditing ? 'Editar usuario' : 'Novo usuario'}
          </h2>
          <button
            onClick={onClose}
            className="text-t-label hover:text-t-secondary transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={`${inputClass} ${fieldError?.field === 'name' ? 'border-red-500/50' : ''}`}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className={`${inputClass} ${fieldError?.field === 'email' ? 'border-red-500/50' : ''}`}
              placeholder="email@empresa.com"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
              Senha {isEditing ? '' : '*'}
              {isEditing && <span className="text-t-placeholder normal-case">(deixe vazio para manter)</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              className={inputClass}
              placeholder={isEditing ? '••••••••' : 'Senha segura'}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Perfil *</label>
            <select
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
              className={inputClass}
            >
              <option value="viewer">Viewer (somente leitura)</option>
              <option value="admin">Admin (gerencia tenants)</option>
              <option value="superadmin">Superadmin (acesso total)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-t-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-[#0a0e17] hover:bg-edge-cyan/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar alteracoes' : 'Criar usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
