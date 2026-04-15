'use client'

import { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PhoneInput, { validatePhone } from '../components/PhoneInput'
import TermsModal from '../components/TermsModal'
import { useBranding } from '../components/BrandingProvider'
import { ApiRequestError, requestOtp } from '../lib/api'
import { extractLhmParams, serializeLhmParams } from '../lib/lhm-params'

export default function PhonePageWrapper() {
  return (
    <Suspense fallback={null}>
      <PhonePage />
    </Suspense>
  )
}

function PhonePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { logoUrl, secondaryColor, welcomeText } = useBranding()
  // SonicWall TZ570 manda o serial como `ufi` (Unique Firewall Identifier).
  // Aceitamos ambos os nomes pra cobrir diferenças entre firmwares.
  const serial = searchParams.get('serial') || searchParams.get('ufi') || ''
  const mac = searchParams.get('mac') || ''
  const ip = searchParams.get('ip') || ''
  // Captura quaisquer params extras injetados pelo SonicWall no modo LHM
  // (sessionId, mgmtBaseUrl, ufi, etc) — variam por firmware.
  // useMemo pra estabilizar a referência (evita recriar o useCallback toda render).
  const lhmParams = useMemo(() => extractLhmParams(searchParams), [searchParams])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)

  const missingDeviceInfo = !serial || !mac || !ip

  useEffect(() => {
    if (missingDeviceInfo) router.replace('/error')
  }, [missingDeviceInfo, router])

  const validationError = validatePhone(phone)
  const nameError = nameTouched && name.trim().length < 2 ? 'Informe seu nome.' : null

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setApiError(null)
      setNameTouched(true)

      if (name.trim().length < 2 || validationError || !termsAccepted) return

      setLoading(true)
      try {
        await requestOtp({ phone, mac, ip, lhm_params: lhmParams }, serial)
        const params = new URLSearchParams({ serial, phone, name: name.trim(), mac, ip })
        const lhmSerialized = serializeLhmParams(lhmParams)
        if (lhmSerialized) params.set('lhm', lhmSerialized)
        router.push(`/otp?${params.toString()}`)
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (err.error === 'unauthorized_firewall') {
            router.push('/error')
            return
          }
          if (err.error === 'rate_limit') {
            const minutes = err.retry_after
              ? Math.ceil(err.retry_after / 60)
              : 10
            setApiError(`Muitas tentativas. Aguarde ${minutes} minutos.`)
          } else {
            setApiError(err.message)
          }
        } else {
          setApiError('Erro inesperado. Tente novamente.')
        }
      } finally {
        setLoading(false)
      }
    },
    [name, phone, serial, mac, ip, lhmParams, validationError, termsAccepted, router],
  )

  if (missingDeviceInfo) return null

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[5%] top-[20%] h-64 w-64 rounded-full bg-edge-cyan/8 blur-3xl" />
        <div className="animate-float-reverse absolute right-[10%] bottom-[15%] h-80 w-80 rounded-full bg-edge-cyan/5 blur-3xl" />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,229,195,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,195,.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Dots top */}
      <div className="pointer-events-none absolute top-4 left-0 right-0 flex justify-center gap-2 opacity-20">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-edge-cyan/50" />
        ))}
      </div>

      <div className="animate-slide-up relative z-10 w-full max-w-sm">
        {/* Glow */}
        <div className="absolute -inset-1 rounded-2xl bg-edge-cyan/5 blur-xl" />

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <div className="mb-5 flex flex-col items-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-14 w-auto max-w-[200px] object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-edge-cyan/10 border border-edge-cyan/20">
                <svg className="h-7 w-7 text-edge-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
                  />
                </svg>
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold text-white">Wi-Fi Login</h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              {welcomeText || 'Insira seus dados para receber o codigo de acesso'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="w-full">
              <label
                htmlFor="name"
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400"
              >
                Nome
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 text-base text-white bg-white/[0.04] placeholder-slate-600 outline-none transition-colors focus:ring-2 ${
                  nameError
                    ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15'
                    : 'border-white/[0.08] focus:border-edge-cyan/40 focus:ring-edge-cyan/15'
                } disabled:opacity-50`}
              />
              {nameError && (
                <p className="mt-1 text-sm text-red-400">{nameError}</p>
              )}
            </div>

            <PhoneInput
              value={phone}
              onChange={setPhone}
              error={validationError}
              disabled={loading}
            />

            {/* Termos de uso */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={termsAccepted}
                onClick={() => setTermsAccepted((v) => !v)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  termsAccepted
                    ? 'border-edge-cyan/40 bg-edge-cyan/20'
                    : 'border-white/[0.12] bg-white/[0.04] hover:border-white/[0.2]'
                }`}
              >
                {termsAccepted && (
                  <svg className="h-3.5 w-3.5 text-edge-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <p className="text-xs leading-relaxed text-slate-400">
                Li e concordo com os{' '}
                <button
                  type="button"
                  onClick={() => setTermsModalOpen(true)}
                  className="font-medium text-edge-cyan underline underline-offset-2 transition-colors hover:text-edge-cyan/80"
                >
                  Termos de Uso e Politica de Privacidade
                </button>
              </p>
            </div>

            {apiError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {apiError}
              </div>
            )}

            <TermsModal
              open={termsModalOpen}
              onClose={() => setTermsModalOpen(false)}
              onAccept={() => {
                setTermsAccepted(true)
                setTermsModalOpen(false)
              }}
            />

            <button
              type="submit"
              disabled={loading || !!validationError || name.trim().length < 2 || !termsAccepted}
              className="w-full rounded-xl bg-edge-cyan py-3 text-base font-bold transition-all hover:shadow-lg hover:shadow-edge-cyan/20 focus:outline-none focus:ring-2 focus:ring-edge-cyan/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: secondaryColor }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </span>
              ) : (
                'Receber codigo'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Dots bottom */}
      <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center gap-2 opacity-20">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-edge-cyan/50" />
        ))}
      </div>
    </main>
  )
}
