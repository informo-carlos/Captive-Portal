'use client'

import { useState, useCallback, type ChangeEvent } from 'react'

// DDDs válidos do Brasil
const VALID_DDDS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 82, // PE, AL
  83, // PB
  84, // RN
  85, 88, // CE
  86, 89, // PI
  87, // PE (interior)
  91, 93, 94, // PA
  92, 97, // AM
  95, // RR
  96, // AP
  98, 99, // MA
]

function formatPhone(digits: string): string {
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function validatePhone(digits: string): string | null {
  if (digits.length === 0) return 'Informe seu número de celular.'
  if (digits.length < 10) return 'Número incompleto.'
  if (digits.length !== 10 && digits.length !== 11)
    return 'Número de telefone inválido.'

  const ddd = parseInt(digits.slice(0, 2), 10)
  if (!VALID_DDDS.includes(ddd)) return 'DDD inválido.'

  if (digits.length === 11 && digits[2] !== '9')
    return 'Número de celular inválido.'

  return null
}

interface PhoneInputProps {
  value: string
  onChange: (digits: string) => void
  error?: string | null
  disabled?: boolean
}

export default function PhoneInput({
  value,
  onChange,
  error,
  disabled = false,
}: PhoneInputProps) {
  const [touched, setTouched] = useState(false)

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const digits = extractDigits(e.target.value)
      onChange(digits)
    },
    [onChange],
  )

  const handleBlur = useCallback(() => {
    setTouched(true)
  }, [])

  const displayError = touched ? error : null

  return (
    <div className="w-full">
      <label
        htmlFor="phone"
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400"
      >
        Numero de celular
      </label>
      <input
        id="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="(11) 9 9999-9999"
        value={formatPhone(value)}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={`w-full rounded-xl border px-4 py-3 text-base text-white bg-white/[0.04] placeholder-slate-600 outline-none transition-colors focus:ring-2 ${
          displayError
            ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15'
            : 'border-white/[0.08] focus:border-edge-cyan/40 focus:ring-edge-cyan/15'
        } disabled:opacity-50`}
      />
      {displayError && (
        <p className="mt-1 text-sm text-red-400">{displayError}</p>
      )}
    </div>
  )
}
