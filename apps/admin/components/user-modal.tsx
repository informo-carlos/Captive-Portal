'use client'

import { useState, useEffect } from 'react'
import type { AdminUser, AdminRole, CreateUserRequest, UpdateUserRequest } from '@captive-portal/shared'
import { createUser, updateUser, ApiRequestError } from '../lib/api'

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

export function UserModal({ user, onClose, onSuccess }: UserModalProps) {
  const isEditing = !!user
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
      } else {
        const data: CreateUserRequest = {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          role: form.role,
        }
        await createUser(data)
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 pt-10 pb-10">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Editar usuário' : 'Novo usuário'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                fieldError?.field === 'name' ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                fieldError?.field === 'email' ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="email@empresa.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha {isEditing ? '' : '*'}
              {isEditing && <span className="text-xs text-gray-400">(deixe vazio para manter)</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={isEditing ? '••••••••' : 'Senha segura'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Perfil *</label>
            <select
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="viewer">Viewer (somente leitura)</option>
              <option value="admin">Admin (gerencia tenants)</option>
              <option value="superadmin">Superadmin (acesso total)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
