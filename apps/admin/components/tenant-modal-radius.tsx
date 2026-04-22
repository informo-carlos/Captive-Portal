'use client'

import { useState, useRef, useEffect } from 'react'

export interface RadiusFormData {
  shared_secret: string
  coa_port: string
  session_timeout_sec: string
  nas_ip_allowlist: string[]
}

export const EMPTY_RADIUS_FORM: RadiusFormData = {
  shared_secret: '',
  coa_port: '3799',
  session_timeout_sec: '14400',
  nas_ip_allowlist: [],
}

interface Props {
  form: RadiusFormData
  onChange: (patch: Partial<RadiusFormData>) => void
  isEditing: boolean
  /** Se true, shared_secret já existe no servidor — campo funciona como "deixar vazio para manter". */
  hasExistingSecret: boolean
  inputClass: (field?: string) => string
}

const IPV4_CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/

export function validateIpOrCidr(entry: string): string | null {
  const trimmed = entry.trim()
  if (!trimmed) return 'Entrada vazia.'
  const m = trimmed.match(IPV4_CIDR_RE)
  if (!m) return `"${trimmed}" não é um IPv4 nem CIDR válido.`
  const octets = [m[1], m[2], m[3], m[4]].map((o) => parseInt(o, 10))
  if (octets.some((o) => o < 0 || o > 255)) {
    return `"${trimmed}" tem octeto fora de 0-255.`
  }
  if (m[5] !== undefined) {
    const prefix = parseInt(m[5], 10)
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return `"${trimmed}" tem prefixo CIDR inválido (0-32).`
    }
  }
  return null
}

export function validateRadiusForm(
  form: RadiusFormData,
  opts: { isEditing: boolean; hasExistingSecret: boolean },
): string | null {
  if (!opts.isEditing || !opts.hasExistingSecret) {
    if (!form.shared_secret.trim()) {
      return 'Shared secret é obrigatório.'
    }
  }
  if (form.shared_secret.trim() && form.shared_secret.trim().length < 16) {
    return 'Shared secret deve ter no mínimo 16 caracteres.'
  }

  const coa = parseInt(form.coa_port, 10)
  if (isNaN(coa) || coa < 1 || coa > 65535) {
    return 'Porta CoA deve estar entre 1 e 65535.'
  }

  const timeout = parseInt(form.session_timeout_sec, 10)
  if (isNaN(timeout) || timeout < 300 || timeout > 86400) {
    return 'Duração da sessão RADIUS deve estar entre 5 min (300s) e 24h (86400s).'
  }

  for (const entry of form.nas_ip_allowlist) {
    const err = validateIpOrCidr(entry)
    if (err) return err
  }
  return null
}

function secondsToHHMM(secondsStr: string): string {
  const total = parseInt(secondsStr, 10)
  if (isNaN(total) || total < 0) return ''
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function hhmmToSeconds(hhmm: string): string {
  const match = hhmm.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return ''
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (isNaN(h) || isNaN(m)) return ''
  return String(h * 3600 + m * 60)
}

function generateSharedSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/=+$/, '')
}

export function TenantModalRadius({ form, onChange, isEditing, hasExistingSecret, inputClass }: Props) {
  const [nasInput, setNasInput] = useState('')
  const [nasError, setNasError] = useState<string | null>(null)
  const [revealSecret, setRevealSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hhmm, setHhmm] = useState(() => secondsToHHMM(form.session_timeout_sec))
  const hhmmInitRef = useRef(false)

  useEffect(() => {
    if (!hhmmInitRef.current) {
      setHhmm(secondsToHHMM(form.session_timeout_sec))
      hhmmInitRef.current = true
    }
  }, [form.session_timeout_sec])

  const addNasEntry = () => {
    const entry = nasInput.trim()
    if (!entry) return
    const err = validateIpOrCidr(entry)
    if (err) {
      setNasError(err)
      return
    }
    if (form.nas_ip_allowlist.includes(entry)) {
      setNasError('Entrada já adicionada.')
      return
    }
    onChange({ nas_ip_allowlist: [...form.nas_ip_allowlist, entry] })
    setNasInput('')
    setNasError(null)
  }

  const removeNasEntry = (entry: string) => {
    onChange({ nas_ip_allowlist: form.nas_ip_allowlist.filter((e) => e !== entry) })
  }

  const handleGenerate = () => {
    const secret = generateSharedSecret()
    onChange({ shared_secret: secret })
    setRevealSecret(true)
  }

  const handleCopy = async () => {
    if (!form.shared_secret) return
    try {
      await navigator.clipboard.writeText(form.shared_secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API indisponível — usuário precisará copiar manualmente
    }
  }

  const handleHhmmChange = (value: string) => {
    setHhmm(value)
    const seconds = hhmmToSeconds(value)
    if (seconds) onChange({ session_timeout_sec: seconds })
  }

  const handleSecondsChange = (value: string) => {
    onChange({ session_timeout_sec: value })
    setHhmm(secondsToHHMM(value))
  }

  return (
    <div className="space-y-4 rounded-lg border border-edge-cyan/20 bg-edge-cyan/5 p-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-edge-cyan">Configuração RADIUS</h3>
        <p className="mt-1 text-[10px] text-t-placeholder">
          Spec: <code>docs/spec-radius-auth.md</code> §3.3. Campos criptografados no servidor antes de gravar.
        </p>
      </div>

      {/* Shared secret */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
          Shared secret {!isEditing && '*'}
          {isEditing && hasExistingSecret && (
            <span className="text-t-placeholder normal-case"> (deixe vazio para manter)</span>
          )}
        </label>
        <div className="flex gap-2">
          <input
            type={revealSecret ? 'text' : 'password'}
            value={form.shared_secret}
            onChange={(e) => onChange({ shared_secret: e.target.value })}
            className={`${inputClass('shared_secret')} flex-1 font-mono`}
            placeholder={isEditing && hasExistingSecret ? '••••••••' : 'Mín. 16 caracteres — cole no firewall'}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setRevealSecret((s) => !s)}
            className="rounded-lg border border-t-input px-3 py-2 text-[11px] font-medium text-t-muted hover:bg-t-hover transition-colors"
            title={revealSecret ? 'Ocultar' : 'Revelar'}
          >
            {revealSecret ? 'Ocultar' : 'Revelar'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!form.shared_secret}
            className="rounded-lg border border-t-input px-3 py-2 text-[11px] font-medium text-t-muted hover:bg-t-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Copiar pra área de transferência"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-lg bg-edge-cyan/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-edge-cyan hover:bg-edge-cyan/30 transition-colors"
            title="Gera 32 bytes aleatórios em base64"
          >
            Gerar
          </button>
        </div>
        <p className="mt-1 text-[10px] text-t-placeholder">
          Server-to-server entre o firewall e o container — nunca compartilhe com o guest.
          Use &ldquo;Gerar&rdquo; pra um segredo forte (32 bytes aleatórios, base64).
        </p>
      </div>

      {/* CoA port + session timeout — 2 colunas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
            Porta CoA (UDP) <span className="text-t-placeholder normal-case">(default 3799)</span>
          </label>
          <input
            type="number"
            value={form.coa_port}
            onChange={(e) => onChange({ coa_port: e.target.value })}
            min={1}
            max={65535}
            className={inputClass('coa_port')}
            placeholder="3799"
          />
          <p className="mt-1 text-[10px] text-t-placeholder">
            Porta UDP que o NAS escuta Disconnect-Request (RFC 5176).
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
            Duração da sessão (HH:MM)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={hhmm}
              onChange={(e) => handleHhmmChange(e.target.value)}
              pattern="\d{1,2}:\d{2}"
              placeholder="04:00"
              className={`${inputClass('session_timeout_sec')} w-24 font-mono`}
            />
            <span className="text-[10px] text-t-placeholder">ou</span>
            <input
              type="number"
              value={form.session_timeout_sec}
              onChange={(e) => handleSecondsChange(e.target.value)}
              min={300}
              max={86400}
              className={`${inputClass()} flex-1`}
              placeholder="14400"
            />
            <span className="text-[10px] text-t-label">seg</span>
          </div>
          <p className="mt-1 text-[10px] text-t-placeholder">
            Vai como Session-Timeout no Access-Accept. Mín 5 min, máx 24h.
          </p>
        </div>
      </div>

      {/* NAS IP allowlist — chips */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
          IPs/CIDRs permitidos (NAS) <span className="text-t-placeholder normal-case">(opcional)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nasInput}
            onChange={(e) => {
              setNasInput(e.target.value)
              if (nasError) setNasError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addNasEntry()
              }
            }}
            className={`${inputClass()} flex-1 font-mono`}
            placeholder="192.168.1.1 ou 10.0.0.0/24"
          />
          <button
            type="button"
            onClick={addNasEntry}
            disabled={!nasInput.trim()}
            className="rounded-lg border border-t-input px-3 py-2 text-[11px] font-medium text-t-muted hover:bg-t-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Adicionar
          </button>
        </div>
        {nasError && (
          <p className="mt-1 text-[10px] text-red-400">{nasError}</p>
        )}
        {form.nas_ip_allowlist.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {form.nas_ip_allowlist.map((entry) => (
              <span
                key={entry}
                className="inline-flex items-center gap-1.5 rounded-md border border-edge-cyan/30 bg-edge-cyan/10 px-2 py-1 text-[11px] font-mono text-edge-cyan"
              >
                {entry}
                <button
                  type="button"
                  onClick={() => removeNasEntry(entry)}
                  className="text-edge-cyan/60 hover:text-edge-cyan"
                  aria-label={`Remover ${entry}`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] text-t-placeholder">
          Se vazio, aceita pacotes RADIUS de qualquer origem — <strong>não recomendado</strong> em produção.
          Enter ou vírgula adiciona; IPv4 ou CIDR (ex: <code>10.0.0.0/24</code>).
        </p>
      </div>
    </div>
  )
}
