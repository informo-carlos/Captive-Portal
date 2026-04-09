'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SuccessPage />
    </Suspense>
  )
}

function SuccessPage() {
  const searchParams = useSearchParams()
  const [closing, setClosing] = useState(false)

  const expiresInSeconds = parseInt(searchParams.get('expires_in') || '0', 10)
  const hours = expiresInSeconds > 0 ? expiresInSeconds / 3600 : 0

  const formatDuration = () => {
    if (hours <= 0) return null
    if (hours >= 1) {
      const h = Math.floor(hours)
      const m = Math.round((hours - h) * 60)
      if (m === 0) return `${h} hora${h > 1 ? 's' : ''}`
      return `${h}h ${m}min`
    }
    return `${Math.round(hours * 60)} minutos`
  }

  const durationText = formatDuration()

  useEffect(() => {
    const timer = setTimeout(() => {
      setClosing(true)
      window.close()
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

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
            {/* Checkmark */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-edge-cyan/10 border border-edge-cyan/20">
              <svg className="h-10 w-10 text-edge-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="mt-4 text-2xl font-bold text-white">
              Acesso liberado!
            </h1>

            <p className="mt-2 text-slate-400">
              Voce ja pode navegar na internet. Pode fechar esta janela.
            </p>

            {durationText && (
              <div className="mt-4 rounded-lg border border-edge-cyan/20 bg-edge-cyan/5 px-4 py-2">
                <p className="text-sm font-medium text-edge-cyan">
                  Tempo de acesso: {durationText}
                </p>
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
