'use client'

import { useState, useEffect } from 'react'
import type { AuthMode, Tenant, CreateTenantRequest, UpdateTenantRequest, RadiusConfig } from '@captive-portal/shared'
import { createTenant, updateTenant } from '../lib/api'
import { ApiRequestError } from '../lib/api'
import { useNotifications } from '../lib/notification-context'
import {
  TenantModalRadius,
  EMPTY_RADIUS_FORM,
  validateRadiusForm,
  type RadiusFormData,
} from './tenant-modal-radius'

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
  auth_mode: AuthMode
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
  session_duration_minutes: string
  branding_logo_url: string
  branding_primary_color: string
  branding_secondary_color: string
  branding_welcome_text: string
}

const EMPTY_FORM: FormData = {
  name: '',
  port: '',
  serial_primary: '',
  serial_secondary: '',
  auth_mode: 'sonicwall',
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
  session_duration_minutes: '480',
  branding_logo_url: '',
  branding_primary_color: '#00e5c3',
  branding_secondary_color: '#0a0e17',
  branding_welcome_text: '',
}

export function TenantModal({ tenant, onClose, onSuccess }: TenantModalProps) {
  const isEditing = !!tenant
  const { add: notify } = useNotifications()
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [radiusForm, setRadiusForm] = useState<RadiusFormData>(EMPTY_RADIUS_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)

  const hasExistingRadiusSecret = !!tenant?.radius_config?.has_shared_secret

  useEffect(() => {
    if (tenant) {
      const primary = tenant.serials.find((s) => s.role === 'primary')
      const secondary = tenant.serials.find((s) => s.role === 'secondary')
      setRadiusForm({
        shared_secret: '',
        coa_port: String(tenant.radius_config?.coa_port ?? 3799),
        session_timeout_sec: String(tenant.radius_config?.session_timeout_sec ?? 14400),
        nas_ip_allowlist: tenant.radius_config?.nas_ip_allowlist ?? [],
      })
      setForm({
        name: tenant.name,
        port: String(tenant.port),
        serial_primary: primary?.serial || '',
        serial_secondary: secondary?.serial || '',
        auth_mode: tenant.auth_mode || 'sonicwall',
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
        session_duration_minutes: String(tenant.session_duration_minutes ?? 480),
        branding_logo_url: tenant.branding?.logo_url || '',
        branding_primary_color: tenant.branding?.primary_color || '#00e5c3',
        branding_secondary_color: tenant.branding?.secondary_color || '#0a0e17',
        branding_welcome_text: tenant.branding?.welcome_text || '',
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

    if (form.auth_mode === 'sonicwall' && form.sw_mode === 'rest') {
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

    if (form.auth_mode === 'radius') {
      const radiusErr = validateRadiusForm(radiusForm, {
        isEditing,
        hasExistingSecret: hasExistingRadiusSecret,
      })
      if (radiusErr) return radiusErr
    }

    if (!isEditing) {
      if (!form.zenvia_token.trim()) return 'Token Zenvia é obrigatório.'
      if (!form.zenvia_sender.trim()) return 'Sender Zenvia é obrigatório.'
    }
    const sessionMin = parseInt(form.session_duration_minutes)
    if (isNaN(sessionMin) || sessionMin < 15 || sessionMin > 1440) {
      return 'Duracao da sessao deve estar entre 15 e 1440 minutos.'
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
          session_duration_minutes: parseInt(form.session_duration_minutes),
        }
        if (form.auth_mode === 'radius') {
          const patch: Partial<RadiusConfig> = {
            coa_port: parseInt(radiusForm.coa_port) || 3799,
            session_timeout_sec: parseInt(radiusForm.session_timeout_sec) || 14400,
            nas_ip_allowlist: radiusForm.nas_ip_allowlist,
          }
          if (radiusForm.shared_secret.trim()) {
            patch.shared_secret = radiusForm.shared_secret.trim()
          }
          data.radius_config = patch
        } else {
          data.sonicwall_config = { mode: form.sw_mode }
          if (form.sw_mode === 'rest') {
            if (form.sw_host.trim()) data.sonicwall_config.host = form.sw_host.trim()
            if (form.sw_port.trim()) data.sonicwall_config.port = parseInt(form.sw_port)
            if (form.sw_user.trim()) data.sonicwall_config.user = form.sw_user.trim()
            if (form.sw_password.trim()) data.sonicwall_config.password = form.sw_password.trim()
            data.sonicwall_config.firmware = parseInt(form.sw_firmware) || 7
          } else {
            if (form.sw_lhm_port.trim()) data.sonicwall_config.lhm_port = parseInt(form.sw_lhm_port) || 4043
            if (form.sw_guest_user.trim()) data.sonicwall_config.guest_service_user = form.sw_guest_user.trim()
            if (form.sw_guest_pass.trim()) data.sonicwall_config.guest_service_pass = form.sw_guest_pass.trim()
          }
        }
        if (form.zenvia_token.trim()) data.zenvia_token = form.zenvia_token.trim()
        if (form.zenvia_sender.trim()) data.zenvia_sender = form.zenvia_sender.trim()

        const branding: Record<string, string> = {}
        if (form.branding_logo_url.trim()) branding.logo_url = form.branding_logo_url.trim()
        if (form.branding_primary_color) branding.primary_color = form.branding_primary_color
        if (form.branding_secondary_color) branding.secondary_color = form.branding_secondary_color
        if (form.branding_welcome_text.trim()) branding.welcome_text = form.branding_welcome_text.trim()
        data.branding = branding

        await updateTenant(tenant!.id, data)
        notify({
          type: 'tenant',
          action: 'tenant_updated',
          status: 'completed',
          message: 'Configuração de tenant atualizada',
          detail: form.name.trim(),
        })
      } else {
        const data: CreateTenantRequest = {
          name: form.name.trim(),
          port: parseInt(form.port),
          auth_mode: form.auth_mode,
          serials: buildSerials(),
          zenvia_token: form.zenvia_token.trim(),
          zenvia_sender: form.zenvia_sender.trim(),
          session_duration_minutes: parseInt(form.session_duration_minutes),
          branding: {
            ...(form.branding_logo_url.trim() && { logo_url: form.branding_logo_url.trim() }),
            primary_color: form.branding_primary_color,
            secondary_color: form.branding_secondary_color,
            ...(form.branding_welcome_text.trim() && { welcome_text: form.branding_welcome_text.trim() }),
          },
        }

        if (form.auth_mode === 'radius') {
          data.radius_config = {
            shared_secret: radiusForm.shared_secret.trim(),
            coa_port: parseInt(radiusForm.coa_port) || 3799,
            session_timeout_sec: parseInt(radiusForm.session_timeout_sec) || 14400,
            nas_ip_allowlist: radiusForm.nas_ip_allowlist,
          }
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
            if (form.sw_lhm_port.trim()) sonicwall_config.lhm_port = parseInt(form.sw_lhm_port) || 4043
            if (form.sw_guest_user.trim()) sonicwall_config.guest_service_user = form.sw_guest_user.trim()
            if (form.sw_guest_pass.trim()) sonicwall_config.guest_service_pass = form.sw_guest_pass.trim()
          }
          data.sonicwall_config = sonicwall_config
        }

        await createTenant(data)
        notify({
          type: 'tenant',
          action: 'tenant_created',
          status: 'completed',
          message: 'Novo tenant criado',
          detail:
            form.auth_mode === 'radius'
              ? `${form.name.trim()} (RADIUS) — porta HTTP ${form.port}. Porta UDP RADIUS será exibida nos detalhes após provisioning.`
              : `${form.name.trim()} — porta ${form.port}`,
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

  const inputClass = (field?: string) =>
    `w-full rounded-lg border bg-t-input px-3 py-2 text-sm text-t-primary placeholder:text-t-placeholder focus:outline-none focus:ring-1 focus:ring-edge-cyan/40 ${
      fieldError?.field === field ? 'border-red-500/50' : 'border-t-input'
    }`

  const durationHours = parseInt(form.session_duration_minutes) / 60

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-t-overlay backdrop-blur-sm pt-10 pb-10 animate-modal-overlay">
      <div className="w-full max-w-2xl rounded-xl border border-t-input bg-t-card shadow-xl animate-modal-content">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-t-default px-6 py-4">
          <h2 className="text-lg font-semibold text-t-primary">
            {isEditing ? 'Editar cliente' : 'Novo cliente'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Tipo de autenticação — seletor em cards */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Tipo de autenticação</h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    key: 'sonicwall' as const,
                    title: 'SonicWall',
                    desc: 'REST API ou LHM (External Guest Auth). Integração proprietária — exige firewall SonicWall.',
                  },
                  {
                    key: 'radius' as const,
                    title: 'RADIUS',
                    desc: 'MAB + OTP + CoA (multi-vendor). Sem cadastro prévio — sessão efêmera no Redis. Funciona com Mikrotik, Unifi, pfSense etc.',
                  },
                ]
              ).map((opt) => {
                const selected = form.auth_mode === opt.key
                const disabled = isEditing && form.auth_mode !== opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setForm((prev) => ({ ...prev, auth_mode: opt.key }))}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-edge-cyan/60 bg-edge-cyan/5'
                        : 'border-t-input bg-t-input hover:bg-t-hover'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-t-primary">{opt.title}</span>
                      {selected && (
                        <span className="rounded-full bg-edge-cyan/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-edge-cyan">
                          selecionado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-t-label">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
            {isEditing && (
              <p className="text-[10px] text-t-placeholder">
                O modo não pode ser alterado após a criação — requer recriar o tenant.
              </p>
            )}
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Informações básicas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className={inputClass('name')}
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                  Porta * {isEditing && <span className="text-t-placeholder normal-case">(nao editavel)</span>}
                </label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setField('port', e.target.value)}
                  disabled={isEditing}
                  min={29000}
                  max={29999}
                  className={`${inputClass('port')} disabled:opacity-40`}
                  placeholder="29000"
                />
              </div>
            </div>
          </div>

          {/* Session Duration */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Sessao Wi-Fi</h3>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                Duracao da sessao (minutos) *
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={form.session_duration_minutes}
                  onChange={(e) => setField('session_duration_minutes', e.target.value)}
                  min={15}
                  max={1440}
                  className={`${inputClass()} w-40`}
                  placeholder="480"
                />
                <span className="text-xs text-t-label">
                  = {isNaN(durationHours) ? '—' : durationHours.toFixed(1)} horas
                </span>
              </div>
              <p className="mt-1 text-[10px] text-t-placeholder">
                Tempo que o usuario fica conectado apos autenticação (15 min - 24h)
              </p>
            </div>
          </div>

          {/* Serials */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Seriais SonicWall</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Primario *</label>
                <input
                  type="text"
                  value={form.serial_primary}
                  onChange={(e) => setField('serial_primary', e.target.value)}
                  className={inputClass('serial')}
                  placeholder="SN-ABC123"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Secundario <span className="text-t-placeholder normal-case">(HA pair)</span></label>
                <input
                  type="text"
                  value={form.serial_secondary}
                  onChange={(e) => setField('serial_secondary', e.target.value)}
                  className={inputClass()}
                  placeholder="SN-ABC124 (opcional)"
                />
              </div>
            </div>
          </div>

          {/* SonicWall Config — só aparece em modo sonicwall */}
          {form.auth_mode === 'sonicwall' && (
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Configuração SonicWall</h3>

            {/* Modo — sempre visível */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Modo de integração</label>
                <select
                  value={form.sw_mode}
                  onChange={(e) => setField('sw_mode', e.target.value as 'rest' | 'lhm')}
                  className={inputClass()}
                >
                  <option value="rest">REST API</option>
                  <option value="lhm">LHM (External Guest Auth)</option>
                </select>
                <p className="mt-1 text-[10px] text-t-placeholder">
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
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Host {!isEditing && '*'}</label>
                  <input
                    type="text"
                    value={form.sw_host}
                    onChange={(e) => setField('sw_host', e.target.value)}
                    className={inputClass()}
                    placeholder="192.168.1.1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                    Porta de management <span className="text-t-placeholder normal-case">(default 443)</span>
                  </label>
                  <input
                    type="number"
                    value={form.sw_port}
                    onChange={(e) => setField('sw_port', e.target.value)}
                    min={1}
                    max={65535}
                    className={inputClass()}
                    placeholder="4040"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Usuário {!isEditing && '*'}</label>
                  <input
                    type="text"
                    value={form.sw_user}
                    onChange={(e) => setField('sw_user', e.target.value)}
                    className={inputClass()}
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                    Senha {!isEditing && '*'}
                    {isEditing && <span className="text-t-placeholder normal-case">(deixe vazio para manter)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.sw_password}
                    onChange={(e) => setField('sw_password', e.target.value)}
                    className={inputClass()}
                    placeholder={isEditing ? '••••••••' : 'Senha do SonicWall'}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Firmware</label>
                  <select
                    value={form.sw_firmware}
                    onChange={(e) => setField('sw_firmware', e.target.value)}
                    className={inputClass()}
                  >
                    <option value="6">Gen 6</option>
                    <option value="7">Gen 7</option>
                  </select>
                </div>
              </div>
            )}

            {/* Campos LHM — só aparecem em modo LHM */}
            {form.sw_mode === 'lhm' && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="mb-3 text-[10px] text-amber-400/80">
                  Em LHM o SonicWall envia tudo o que precisamos no redirect inicial
                  (sessionId, mgmtBaseUrl, ufi, mac, ip). Os campos abaixo são todos
                  opcionais — só preencha guest user/senha se o seu SonicWall estiver
                  configurado pra exigir autenticação no callback do externalGuestLogin.cgi.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                      Porta LHM <span className="text-t-placeholder normal-case">(opcional)</span>
                    </label>
                    <input
                      type="number"
                      value={form.sw_lhm_port}
                      onChange={(e) => setField('sw_lhm_port', e.target.value)}
                      className={inputClass()}
                      placeholder="4043"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                      Usuário guest <span className="text-t-placeholder normal-case">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.sw_guest_user}
                      onChange={(e) => setField('sw_guest_user', e.target.value)}
                      className={inputClass()}
                      placeholder="(deixe vazio se não exigido)"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                      Senha guest <span className="text-t-placeholder normal-case">(opcional)</span>
                    </label>
                    <input
                      type="password"
                      value={form.sw_guest_pass}
                      onChange={(e) => setField('sw_guest_pass', e.target.value)}
                      className={inputClass()}
                      placeholder={isEditing ? '••••••••' : '(deixe vazio se não exigido)'}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Formulário RADIUS */}
          {form.auth_mode === 'radius' && (
            <TenantModalRadius
              form={radiusForm}
              onChange={(patch) => setRadiusForm((prev) => ({ ...prev, ...patch }))}
              isEditing={isEditing}
              hasExistingSecret={hasExistingRadiusSecret}
              inputClass={inputClass}
            />
          )}

          {/* Zenvia */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Zenvia (SMS)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                  Token {!isEditing && '*'}
                  {isEditing && <span className="text-t-placeholder normal-case">(deixe vazio para manter)</span>}
                </label>
                <input
                  type="password"
                  value={form.zenvia_token}
                  onChange={(e) => setField('zenvia_token', e.target.value)}
                  className={inputClass()}
                  placeholder={isEditing ? '••••••••' : 'Token da API Zenvia'}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
                  Sender {!isEditing && '*'}
                  {isEditing && <span className="text-t-placeholder normal-case">(deixe vazio para manter)</span>}
                </label>
                <input
                  type="text"
                  value={form.zenvia_sender}
                  onChange={(e) => setField('zenvia_sender', e.target.value)}
                  maxLength={64}
                  className={inputClass()}
                  placeholder={isEditing ? 'inalterado' : 'rafael.mosella'}
                />
                <p className="mt-1 text-[10px] text-t-placeholder">
                  Identificador do remetente na Zenvia (aparece como &ldquo;from&rdquo; no SMS).
                </p>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-t-muted">Branding do Portal Wi-Fi</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">URL do Logo</label>
                <input
                  type="url"
                  value={form.branding_logo_url}
                  onChange={(e) => setField('branding_logo_url', e.target.value)}
                  className={inputClass()}
                  placeholder="https://exemplo.com/logo.png"
                />
                <p className="mt-1 text-[10px] text-t-placeholder">
                  URL publica da imagem do logo (PNG, SVG ou JPG). Deixe vazio para usar o icone padrao.
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Cor primaria</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.branding_primary_color}
                    onChange={(e) => setField('branding_primary_color', e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-t-input bg-transparent"
                  />
                  <input
                    type="text"
                    value={form.branding_primary_color}
                    onChange={(e) => setField('branding_primary_color', e.target.value)}
                    className={`${inputClass()} flex-1`}
                    placeholder="#00e5c3"
                    maxLength={7}
                  />
                </div>
                <p className="mt-1 text-[10px] text-t-placeholder">Cor dos botoes e destaques</p>
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Cor de fundo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.branding_secondary_color}
                    onChange={(e) => setField('branding_secondary_color', e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-t-input bg-transparent"
                  />
                  <input
                    type="text"
                    value={form.branding_secondary_color}
                    onChange={(e) => setField('branding_secondary_color', e.target.value)}
                    className={`${inputClass()} flex-1`}
                    placeholder="#0a0e17"
                    maxLength={7}
                  />
                </div>
                <p className="mt-1 text-[10px] text-t-placeholder">Cor de fundo da tela de login</p>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">Texto de boas-vindas</label>
                <input
                  type="text"
                  value={form.branding_welcome_text}
                  onChange={(e) => setField('branding_welcome_text', e.target.value)}
                  className={inputClass()}
                  placeholder="Bem-vindo ao Wi-Fi gratuito!"
                  maxLength={500}
                />
                <p className="mt-1 text-[10px] text-t-placeholder">
                  Mensagem exibida na tela de login (max 500 caracteres)
                </p>
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-2">Preview</label>
              <div
                className="relative overflow-hidden rounded-xl border border-t-default p-6"
                style={{ backgroundColor: form.branding_secondary_color }}
              >
                <div className="mx-auto max-w-[200px] text-center">
                  {form.branding_logo_url ? (
                    <div className="mb-3 flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.branding_logo_url}
                        alt="Logo preview"
                        className="h-12 w-auto object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  ) : (
                    <div className="mb-3 flex justify-center">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${form.branding_primary_color}20` }}
                      >
                        <svg className="h-5 w-5" fill="none" stroke={form.branding_primary_color} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                        </svg>
                      </div>
                    </div>
                  )}
                  <p className="text-xs font-medium text-white/90">
                    {form.branding_welcome_text || 'Conecte-se ao Wi-Fi'}
                  </p>
                  <div className="mt-2 h-6 rounded-md border border-white/10 bg-white/5" />
                  <button
                    type="button"
                    className="mt-2 w-full rounded-md py-1.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: form.branding_primary_color,
                      color: form.branding_secondary_color,
                    }}
                  >
                    Conectar
                  </button>
                </div>
              </div>
            </div>
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
              className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
