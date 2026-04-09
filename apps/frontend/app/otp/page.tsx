'use client'

import { Suspense, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OtpInput from '../../components/OtpInput'
import CountdownTimer from '../../components/CountdownTimer'
import { ApiRequestError, requestOtp, verifyOtp } from '../../lib/api'
import { deserializeLhmParams, isValidLhmRedirectUrl } from '../../lib/lhm-params'

export default function OtpPageWrapper() {
  return (
    <Suspense fallback={null}>
      <OtpPage />
    </Suspense>
  )
}

function OtpPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const serial = searchParams.get('serial') || ''
  const phone = searchParams.get('phone') || ''
  const mac = searchParams.get('mac') || ''
  const ip = searchParams.get('ip') || ''
  // Params LHM serializados pela página anterior — repassados ao backend no resend
  // e usados pelo backend de volta no verify-otp pra construir a redirect_url.
  // useMemo pra estabilizar a referência (evita recriar useCallback a cada render).
  const lhmSerialized = searchParams.get('lhm') || ''
  const lhmParams = useMemo(
    () => deserializeLhmParams(lhmSerialized),
    [lhmSerialized],
  )

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [expired, setExpired] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [resending, setResending] = useState(false)
  const [timerKey, setTimerKey] = useState(0)

  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const missingParams = !serial || !phone || !mac || !ip

  useEffect(() => {
    if (missingParams) router.replace('/error')
  }, [missingParams, router])

  const triggerShake = useCallback(() => {
    setShake(true)
    if (shakeTimeout.current) clearTimeout(shakeTimeout.current)
    shakeTimeout.current = setTimeout(() => setShake(false), 500)
  }, [])

  const handleExpire = useCallback(() => {
    setExpired(true)
  }, [])

  const handleResend = useCallback(async () => {
    setResending(true)
    setError(null)
    try {
      await requestOtp({ phone, mac, ip, lhm_params: lhmParams }, serial)
      setOtpDigits(Array(6).fill(''))
      setExpired(false)
      setBlocked(false)
      setTimerKey((k) => k + 1)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.error === 'unauthorized_firewall') {
          router.push('/error')
          return
        }
        setError(err.message)
      } else {
        setError('Erro ao reenviar código.')
      }
    } finally {
      setResending(false)
    }
  }, [phone, serial, mac, ip, lhmParams, router])

  const handleVerify = useCallback(async () => {
    const otp = otpDigits.join('')
    if (otp.length !== 6) return

    setError(null)
    setLoading(true)

    try {
      const result = await verifyOtp({ phone, otp }, serial)
      // Em modo LHM o backend devolve uma URL do gateway SonicWall — o navegador
      // do usuário precisa ir até ela pra confirmar a auth no firewall.
      // Validamos o formato (https + path /externalGuestLogin.cgi) pra mitigar
      // open redirect caso o backend devolva qualquer coisa estranha.
      if (result.redirect_url) {
        if (isValidLhmRedirectUrl(result.redirect_url)) {
          window.location.href = result.redirect_url
          return
        }
        // URL suspeita: trata como sucesso normal e loga no console.
        // eslint-disable-next-line no-console
        console.warn('redirect_url inválido recebido do backend, ignorando')
      }
      const expiresIn = result.expires_in
      router.push(`/success?serial=${serial}&expires_in=${expiresIn}`)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        switch (err.error) {
          case 'unauthorized_firewall':
            router.push('/error')
            return

          case 'invalid_otp':
            triggerShake()
            setError(
              err.attempts_remaining !== undefined
                ? `Código inválido. Tentativas restantes: ${err.attempts_remaining}`
                : 'Código inválido.',
            )
            break

          case 'otp_blocked':
            setBlocked(true)
            setError('Muitas tentativas. Solicite um novo código.')
            break

          case 'otp_not_found':
            setExpired(true)
            setError('Código expirado. Solicite um novo código.')
            break

          case 'sonicwall_failed':
            setError('Falha ao liberar acesso. Contate o suporte.')
            break

          default:
            setError(err.message)
        }
      } else {
        setError('Erro inesperado. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }, [otpDigits, phone, serial, router, triggerShake])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      handleVerify()
    },
    [handleVerify],
  )

  const otpFull = otpDigits.every((d) => d !== '')
  const inputDisabled = loading || expired || blocked

  const phoneMasked = phone.length >= 10
    ? `(${phone.slice(0, 2)}) ${phone[2]}****-${phone.slice(-4)}`
    : phone

  if (missingParams) return null

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[5%] top-[20%] h-64 w-64 rounded-full bg-edge-cyan/8 blur-3xl" />
        <div className="animate-float-reverse absolute right-[10%] bottom-[15%] h-80 w-80 rounded-full bg-edge-cyan/5 blur-3xl" />
      </div>

      <div className="animate-slide-up relative z-10 w-full max-w-sm">
        <div className="absolute -inset-1 rounded-2xl bg-edge-cyan/5 blur-xl" />

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="mb-6 flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-edge-cyan/10 border border-edge-cyan/20">
              <svg className="h-7 w-7 text-edge-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="mt-3 text-xl font-bold text-white">Verificacao</h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              Enviamos um codigo para{' '}
              <span className="font-medium text-slate-300">{phoneMasked}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Timer */}
            <CountdownTimer
              key={timerKey}
              initialSeconds={300}
              onExpire={handleExpire}
            />

            {/* OTP Input */}
            <OtpInput
              value={otpDigits}
              onChange={setOtpDigits}
              disabled={inputDisabled}
              shake={shake}
            />

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Main button */}
            {!expired && !blocked ? (
              <button
                type="submit"
                disabled={loading || !otpFull}
                className="w-full rounded-xl bg-gradient-to-r from-edge-cyan to-teal-400 py-3 text-base font-bold text-[#0a0e17] transition-all hover:shadow-lg hover:shadow-edge-cyan/20 focus:outline-none focus:ring-2 focus:ring-edge-cyan/50 focus:ring-offset-2 focus:ring-offset-[#0a0e17] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </span>
                ) : (
                  'Verificar'
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-base font-semibold text-white transition-all hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-edge-cyan/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resending ? 'Reenviando...' : 'Reenviar codigo'}
              </button>
            )}
          </form>
        </div>
      </div>
    </main>
  )
}
