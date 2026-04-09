'use client'

import { Suspense, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OtpInput from '../../components/OtpInput'
import CountdownTimer from '../../components/CountdownTimer'
import { ApiRequestError, requestOtp, verifyOtp } from '../../lib/api'
import { deserializeLhmParams } from '../../lib/lhm-params'

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

  // Sem serial, phone, mac ou ip o fluxo não funciona
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
      // Em modo LHM o backend devolve um payload `lhm_submit` com N URLs
      // candidatas pro externalGuestLogin.cgi do gateway local. Disparamos
      // POSTs fire-and-forget em paralelo (no-cors → opaque response, JS
      // não lê mas o SW processa) e em seguida redirecionamos pro `req`
      // original. Se pelo menos um POST funcionou, o MAC foi autorizado
      // e o redirect passa pelo SW sem reintercepção.
      if (result.lhm_submit) {
        const { urls, body, redirectTo } = result.lhm_submit
        const formBody = new URLSearchParams(body as Record<string, string>)
        // Timeout curto por URL (4s) — mgmtBaseUrl costuma ser inalcançável
        // da WGUEST e trava o fetch até o timeout do browser. Usamos
        // AbortController pra não segurar o botão "Verificando...".
        const attempts = await Promise.all(
          urls.map(async (url) => {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 4000)
            const started = Date.now()
            try {
              await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody,
                signal: ctrl.signal,
              })
              return { url, ok: true, ms: Date.now() - started }
            } catch (e) {
              return {
                url,
                ok: false,
                ms: Date.now() - started,
                err: (e as Error).name + ':' + (e as Error).message,
              }
            } finally {
              clearTimeout(t)
            }
          }),
        )
        // Log de diagnóstico pro backend antes de redirecionar — assim a
        // gente vê nos logs do portal quais URLs o browser do cliente
        // conseguiu atingir. Fire-and-forget, com keepalive pra sobreviver
        // ao unload da página.
        try {
          await fetch(
            `/auth/lhm-debug?serial=${encodeURIComponent(serial)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ attempts, redirectTo }),
              keepalive: true,
            },
          )
        } catch {
          /* ignore */
        }
        window.location.href = redirectTo
        return
      }
      router.push(`/success?serial=${serial}`)
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

  // Mascara o telefone: 11987654321 → (11) 9****-4321
  const phoneMasked = phone.length >= 10
    ? `(${phone.slice(0, 2)}) ${phone[2]}****-${phone.slice(-4)}`
    : phone

  if (missingParams) return null

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <svg
              className="h-7 w-7 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900">
            Verificação
          </h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Enviamos um código para{' '}
            <span className="font-medium text-gray-700">{phoneMasked}</span>
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
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Botão principal */}
          {!expired && !blocked ? (
            <button
              type="submit"
              disabled={loading || !otpFull}
              className="w-full rounded-lg bg-blue-600 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-5 w-5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
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
              className="w-full rounded-lg bg-gray-800 py-3 text-base font-semibold text-white transition-colors hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {resending ? 'Reenviando...' : 'Reenviar código'}
            </button>
          )}
        </form>
      </div>
    </main>
  )
}
