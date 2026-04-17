'use client'

import {
  useRef,
  useCallback,
  type KeyboardEvent,
  type ClipboardEvent,
  type ChangeEvent,
} from 'react'

interface OtpInputProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  shake?: boolean
}

export default function OtpInput({
  value,
  onChange,
  disabled = false,
  shake = false,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < 6) {
      inputRefs.current[index]?.focus()
    }
  }, [])

  const handleChange = useCallback(
    (index: number, e: ChangeEvent<HTMLInputElement>) => {
      const digit = e.target.value.replace(/\D/g, '').slice(-1)
      const newValue = [...value]
      newValue[index] = digit
      onChange(newValue)

      if (digit && index < 5) {
        focusInput(index + 1)
      }
    },
    [value, onChange, focusInput],
  )

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (!value[index] && index > 0) {
          const newValue = [...value]
          newValue[index - 1] = ''
          onChange(newValue)
          focusInput(index - 1)
        } else {
          const newValue = [...value]
          newValue[index] = ''
          onChange(newValue)
        }
        e.preventDefault()
      } else if (e.key === 'ArrowLeft' && index > 0) {
        focusInput(index - 1)
      } else if (e.key === 'ArrowRight' && index < 5) {
        focusInput(index + 1)
      }
    },
    [value, onChange, focusInput],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (pasted.length === 0) return

      const newValue = [...value]
      for (let i = 0; i < pasted.length && i < 6; i++) {
        newValue[i] = pasted[i]
      }
      onChange(newValue)

      const nextEmpty = newValue.findIndex((v) => !v)
      focusInput(nextEmpty === -1 ? 5 : nextEmpty)
    },
    [value, onChange, focusInput],
  )

  return (
    <div
      className={`flex justify-center gap-2 sm:gap-3 ${shake ? 'animate-shake' : ''}`}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          disabled={disabled}
          autoFocus={index === 0}
          className={`h-14 w-11 rounded-lg border-2 text-center text-2xl font-bold text-white bg-white/[0.04] outline-none transition-all sm:h-16 sm:w-12 ${
            value[index]
              ? 'border-edge-cyan/60 bg-edge-cyan/5'
              : 'border-white/[0.1]'
          } focus:border-edge-cyan focus:ring-2 focus:ring-edge-cyan/20 disabled:border-white/[0.05] disabled:bg-white/[0.02] disabled:text-slate-600`}
          aria-label={`Dígito ${index + 1} do código`}
        />
      ))}
    </div>
  )
}
