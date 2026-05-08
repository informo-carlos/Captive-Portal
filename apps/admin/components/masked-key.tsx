'use client'

import { useState } from 'react'
import { useNotifications } from '../lib/notification-context'

interface MaskedKeyProps {
  value: string
  label?: string
  revealable?: boolean
  copyable?: boolean
}

export function MaskedKey({
  value,
  label,
  revealable = true,
  copyable = true,
}: MaskedKeyProps) {
  const [revealed, setRevealed] = useState(false)
  const { add: notify } = useNotifications()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      notify({
        type: 'system',
        action: 'clipboard_copy',
        status: 'completed',
        message: 'Copiado!',
        detail: label ? `${label} copiado` : 'Valor copiado para a área de transferência',
      })
    } catch {
      // Fallback: execCommand (páginas não-HTTPS)
      const el = document.createElement('textarea')
      el.value = value
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      notify({
        type: 'system',
        action: 'clipboard_copy',
        status: 'completed',
        message: 'Copiado!',
      })
    }
  }

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-wider text-t-label shrink-0">
          {label}:
        </span>
      )}
      <span
        className="flex-1 font-mono text-sm text-t-secondary break-all"
        aria-label={
          revealed
            ? value
            : `${label ?? 'Chave'} escondida — clique pra mostrar`
        }
      >
        {revealed ? value : '••••••••••••••••••••'}
      </span>
      {revealable && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 rounded border border-t-input px-2 py-0.5 text-[11px] text-t-label hover:bg-t-hover hover:text-t-secondary transition-colors"
          aria-label={revealed ? 'Esconder chave' : 'Mostrar chave'}
        >
          {revealed ? '🙈 Esconder' : '👁 Mostrar'}
        </button>
      )}
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded border border-t-input px-2 py-0.5 text-[11px] text-t-label hover:bg-t-hover hover:text-t-secondary transition-colors"
          aria-label={`Copiar ${label ?? 'valor'}`}
          title="Copiar"
        >
          📋
        </button>
      )}
    </div>
  )
}
