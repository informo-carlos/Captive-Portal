'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBranding } from '../../components/BrandingProvider'

export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SuccessPage />
    </Suspense>
  )
}

function formatCountdown(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

function SuccessPage() {
  const searchParams = useSearchParams()
  const { logoUrl } = useBranding()
  const [closing, setClosing] = useState(false)

  const expiresInSeconds = parseInt(searchParams.get('expires_in') || '0', 10)
  const [remaining, setRemaining] = useState(expiresInSeconds)

  const formatDuration = useCallback(() => {
    if (expiresInSeconds <= 0) return null
    const hours = expiresInSeconds / 3600
    if (hours >= 1) {
      const h = Math.floor(hours)
      const m = Math.round((hours - h) * 60)
      if (m === 0) return `${h} hora${h > 1 ? 's' : ''}`
      return `${h}h ${m}min`
    }
    return `${Math.round(hours * 60)} minutos`
  }, [expiresInSeconds])

  const durationText = formatDuration()

  // Countdown timer
  useEffect(() => {
    if (remaining <= 0) return
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [remaining > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close after 5s
  useEffect(() => {
    const timer = setTimeout(() => {
      setClosing(true)
      window.close()
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  const progressPercent = expiresInSeconds > 0
    ? (remaining / expiresInSeconds) * 100
    : 0

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[10%] top-[20%] h-64 w-64 rounded-full bg-edge-cyan/8 blur-3xl" />
        <div className="animate-float-reverse absolute right-[10%] bottom-[20%] h-72 w-72 rounded-full bg-edge-cyan/5 blur-3xl" />
      </div>

      <div className="animate-slide-up relative z-10 w-full max-w-sm">
        <div className="absolute -inset-1 rounded-2xl bg-edge-cyan/5 blur-xl" />

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            {/* Logo or Checkmark */}
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-16 w-auto max-w-[200px] object-contain animate-scale-in" />
            ) : (
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-edge-cyan/10 border border-edge-cyan/20 animate-scale-in">
                <div className="absolute inset-0 rounded-full border border-edge-cyan/30 animate-pulse-ring" />
                <svg className="h-10 w-10 text-edge-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path className="animate-check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            <h1 className="mt-4 text-2xl font-bold text-white">
              Acesso liberado!
            </h1>

            <p className="mt-2 text-slate-400">
              Voce ja pode navegar na internet. Pode fechar esta janela.
            </p>

            {/* Countdown timer */}
            {expiresInSeconds > 0 && (
              <div className="mt-5 w-full">
                <div className="rounded-xl border border-edge-cyan/20 bg-edge-cyan/5 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
                    Tempo de acesso: {durationText}
                  </p>
                  {remaining > 0 ? (
                    <>
                      <p className="text-2xl font-bold tabular-nums text-edge-cyan">
                        {formatCountdown(remaining)}
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-linear"
                          style={{
                            width: `${progressPercent}%`,
                            backgroundColor: remaining < 300 ? '#ef4444' : '#00e5c3',
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-600">
                        {remaining < 300 ? 'Sessao expirando em breve' : 'Sessao ativa'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-red-400">
                      Sessao expirada
                    </p>
                  )}
                </div>
              </div>
            )}

            {closing && (
              <p className="mt-4 text-xs text-slate-600">
                Fechando automaticamente...
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
