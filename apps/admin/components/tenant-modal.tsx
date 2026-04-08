'use client'

import { useState, useEffect } from 'react'
import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '@captive-portal/shared'
import { createTenant, updateTenant } from '../lib/api'
import { ApiRequestError } from '../lib/api'

interface TenantModalProps {
  tenant: Tenant | null
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  name: string
  port: string
  serial_primary: string
  serial_secondary: string
  sw_host: string
  sw_port: string
  sw_user: string
  sw_password: string
  sw_firmware: string
  sw_mode: 'rest' | 'lhm'
  sw_lhm_port: string
  sw_guest_user: string
  sw_guest_pass: string
  zenvia_token: string
  zenvia_sender: string
}

const EMPTY_FORM: FormData = {
  name: '',
  port: '',
  serial_primary: '',
  serial_secondary: '',
  sw_host: '',
  sw_port: '',
  sw_user: '',
  sw_password: '',
  sw_firmware: '7',
  sw_mode: 'rest',
  sw_lhm_port: '4043',
  sw_guest_user: '',
  sw_guest_pass: '',
  zenvia_token: '',
  zenvia_sender: '',
}

export function TenantModal({ tenant, onClose, onSuccess }: TenantModalProps) {
  const isEditing = !!tenant
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)

  useEffect(() => {
    if (tenant) {
      const primary = tenant.serials.find((s) => s.role === 'primary')
      const secondary = tenant.serials.find((s) => s.role === 'secondary')
      setForm({
        name: tenant.name,
        port: String(tenant.port),
        serial_primary: primary?.serial || '',
        serial_secondary: secondary?.serial || '',
        sw_host: tenant.sonicwall_config?.host || '',
        sw_port: tenant.sonicwall_config?.port ? String(tenant.sonicwall_config.port) : '',
        sw_user: tenant.sonicwall_config?.user || '',
        sw_password: '',
        sw_firmware: String(tenant.sonicwall_config?.firmware || 7),
        sw_mode: tenant.sonicwall_config?.mode || 'rest',
        sw_lhm_port: String(tenant.sonicwall_config?.lhm_port || 4043),
        sw_guest_user: tenant.sonicwall_config?.guest_service_user || '',
        sw_guest_pass: '',
        zenvia_token: '',
        zenvia_sender: '',
      })
    }
  }, [tenant])

  const setField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldError?.field === field) setFieldError(null)
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Nome é obrigatório.'
    if (!isEditing) {
      const port = parseInt(form.port)
      if (isNaN(port) || port < 29000 || port > 29999) return 'Porta deve estar entre 29000 e 29999.'
    }
    if (!form.serial_primary.trim()) return 'Serial primário é obrigatório.'

    // Campos do SonicWall só são obrigatórios em modo REST. No LHM o backend
    // não fala com o SonicWall — quem fala é o navegador do usuário, com
    // base nos parâmetros que o próprio SW envia no redirect inicial.
    if (form.sw_mode === 'rest') {
      if (form.sw_port.trim()) {
        const p = parseInt(form.sw_port)
        if (isNaN(p) || p < 1 || p > 65535) return 'Porta de management deve estar entre 1 e 65535.'
      }
      if (!isEditing) {
        if (!form.sw_host.trim()) return 'Host SonicWall é obrigatório no modo REST.'
        if (!form.sw_user.trim()) return 'Usuário SonicWall é obrigatório no modo REST.'
        if (!form.sw_password.trim()) return 'Senha SonicWall é obrigatória no modo REST.'
      }
    }

    if (!isEditing) {
      if (!form.zenvia_token.trim()) return 'Token Zenvia é obrigatório.'
      if (!form.zenvia_sender.trim()) return 'Sender Zenvia é obrigatório.'
    }
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
        const data: UpdateTenantRequest = {
          name: form.name.trim(),
          serials: buildSerials(),
        }
        // Sempre envia o sonicwall_config no edit (mesmo que só pra trocar de
        // modo). O backend faz merge com o que já existe no banco.
        data.sonicwall_config = { mode: form.sw_mode }
        if (form.sw_mode === 'rest') {
          if (form.sw_host.trim()) data.sonicwall_config.host = form.sw_host.trim()
          if (form.sw_port.trim()) data.sonicwall_config.port = parseInt(form.sw_port)
          if (form.sw_user.trim()) data.sonicwall_config.user = form.sw_user.trim()
          if (form.sw_password.trim()) data.sonicwall_config.password = form.sw_password.trim()
          data.sonicwall_config.firmware = parseInt(form.sw_firmware) || 7
        } else {
          // LHM: porta opcional + guest service só se preenchido
          if (form.sw_lhm_port.trim()) data.sonicwall_config.lhm_port = parseInt(form.sw_lhm_port) || 4043
          if (form.sw_guest_user.trim()) data.sonicwall_config.guest_service_user = form.sw_guest_user.trim()
          if (form.sw_guest_pass.trim()) data.sonicwall_config.guest_service_pass = form.sw_guest_pass.trim()
        }
        if (form.zenvia_token.trim()) data.zenvia_token = form.zenvia_token.trim()
        if (form.zenvia_sender.trim()) data.zenvia_sender = form.zenvia_sender.trim()

        await updateTenant(tenant!.id, data)
      } else {
        const sonicwall_config: CreateTenantRequest['sonicwall_config'] = {
          mode: form.sw_mode,
        }
        if (form.sw_mode === 'rest') {
          sonicwall_config.host = form.sw_host.trim()
          if (form.sw_port.trim()) sonicwall_config.port = parseInt(form.sw_port)
          sonicwall_config.user = form.sw_user.trim()
          sonicwall_config.password = form.sw_password.trim()
          sonicwall_config.firmware = parseInt(form.sw_firmware) || 7
        } else {
          // LHM: nada além do modo é obrigatório. Guest service só se preenchido.
          if (form.sw_lhm_port.trim()) sonicwall_config.lhm_port = parseInt(form.sw_lhm_port) || 4043
          if (form.sw_guest_user.trim()) sonicwall_config.guest_service_user = form.sw_guest_user.trim()
          if (form.sw_guest_pass.trim()) sonicwall_config.guest_service_pass = form.sw_guest_pass.trim()
        }

        const data: CreateTenantRequest = {
          name: form.name.trim(),
          port: parseInt(form.port),
          serials: buildSerials(),
          sonicwall_config,
          zenvia_token: form.zenvia_token.trim(),
          zenvia_sender: form.zenvia_sender.trim(),
        }

        await createTenant(data)
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

  const buildSerials = () => {
    const serials: { serial: string; role: 'primary' | 'secondary' }[] = []
    if (form.serial_primary.trim()) {
      serials.push({ serial: form.serial_primary.trim(), role: 'primary' })
    }
    if (form.serial_secondary.trim()) {
      serials.push({ serial: form.serial_secondary.trim(), role: 'secondary' })
    }
    return serials
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 pt-10 pb-10">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Editar cliente' : 'Novo cliente'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Informações básicas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    fieldError?.field === 'name' ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Porta * {isEditing && <span className="text-xs text-gray-400">(não editável)</span>}
                </label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setField('port', e.target.value)}
                  disabled={isEditing}
                  min={29000}
                  max={29999}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${
                    fieldError?.field === 'port' ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="29000"
                />
              </div>
            </div>
          </div>

          {/* Serials */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Seriais SonicWall</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primário *</label>
                <input
                  type="text"
                  value={form.serial_primary}
                  onChange={(e) => setField('serial_primary', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    fieldError?.field === 'serial' ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="SN-ABC123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secundário <span className="text-xs text-gray-400">(HA pair)</span></label>
                <input
                  type="text"
                  value={form.serial_secondary}
                  onChange={(e) => setField('serial_secondary', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="SN-ABC124 (opcional)"
                />
              </div>
            </div>
          </div>

          {/* SonicWall Config */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Configuração SonicWall</h3>

            {/* Modo — sempre visível, dita o que aparece embaixo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modo de integração</label>
                <select
                  value={form.sw_mode}
                  onChange={(e) => setField('sw_mode', e.target.value as 'rest' | 'lhm')}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="rest">REST API</option>
                  <option value="lhm">LHM (External Guest Auth)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {form.sw_mode === 'rest'
                    ? 'A VPS fala diretamente com a API REST do SonicWall — exige host e credenciais.'
                    : 'O navegador do usuário fala com o SonicWall (External Guest Auth). A VPS não precisa de host nem credenciais.'}
                </p>
              </div>
            </div>

            {/* Campos REST — só aparecem em modo REST */}
            {form.sw_mode === 'rest' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host {!isEditing && '*'}</label>
                  <input
                    type="text"
                    value={form.sw_host}
                    onChange={(e) => setField('sw_host', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="192.168.1.1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Porta de management <span className="text-xs text-gray-400">(default 443)</span>
                  </label>
                  <input
                    type="number"
                    value={form.sw_port}
                    onChange={(e) => setField('sw_port', e.target.value)}
                    min={1}
                    max={65535}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="4040"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usuário {!isEditing && '*'}</label>
                  <input
                    type="text"
                    value={form.sw_user}
                    onChange={(e) => setField('sw_user', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha {!isEditing && '*'}
                    {isEditing && <span className="text-xs text-gray-400">(deixe vazio para manter)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.sw_password}
                    onChange={(e) => setField('sw_password', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={isEditing ? '••••••••' : 'Senha do SonicWall'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Firmware</label>
                  <select
                    value={form.sw_firmware}
                    onChange={(e) => setField('sw_firmware', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="6">Gen 6</option>
                    <option value="7">Gen 7</option>
                  </select>
                </div>
              </div>
            )}

            {/* Campos LHM — opcionais, só aparecem em modo LHM */}
            {form.sw_mode === 'lhm' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-3 text-xs text-amber-800">
                  Em LHM o SonicWall envia tudo o que precisamos no redirect inicial
                  (sessionId, mgmtBaseUrl, ufi, mac, ip). Os campos abaixo são todos
                  opcionais — só preencha guest user/senha se o seu SonicWall estiver
                  configurado pra exigir autenticação no callback do externalGuestLogin.cgi.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Porta LHM <span className="text-xs text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="number"
                      value={form.sw_lhm_port}
                      onChange={(e) => setField('sw_lhm_port', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="4043"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usuário guest <span className="text-xs text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.sw_guest_user}
                      onChange={(e) => setField('sw_guest_user', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="(deixe vazio se não exigido)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Senha guest <span className="text-xs text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="password"
                      value={form.sw_guest_pass}
                      onChange={(e) => setField('sw_guest_pass', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={isEditing ? '••••••••' : '(deixe vazio se não exigido)'}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Zenvia */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Zenvia (SMS)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token {!isEditing && '*'}
                  {isEditing && <span className="text-xs text-gray-400">(deixe vazio para manter)</span>}
                </label>
                <input
                  type="password"
                  value={form.zenvia_token}
                  onChange={(e) => setField('zenvia_token', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={isEditing ? '••••••••' : 'Token da API Zenvia'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sender {!isEditing && '*'}
                  {isEditing && <span className="text-xs text-gray-400">(deixe vazio para manter)</span>}
                </label>
                <input
                  type="text"
                  value={form.zenvia_sender}
                  onChange={(e) => setField('zenvia_sender', e.target.value)}
                  maxLength={64}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={isEditing ? 'inalterado' : 'rafael.mosella'}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Identificador do remetente na Zenvia (aparece como &ldquo;from&rdquo; no SMS).
                </p>
              </div>
            </div>
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
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
