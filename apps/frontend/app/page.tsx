'use client'

import { Suspense, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PhoneInput, { validatePhone } from '../components/PhoneInput'
import { ApiRequestError, requestOtp } from '../lib/api'

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
  const serial = searchParams.get('serial') || ''
  const mac = searchParams.get('mac') || ''
  const ip = searchParams.get('ip') || ''

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)

  const validationError = validatePhone(phone)
  const nameError = nameTouched && name.trim().length < 2 ? 'Informe seu nome.' : null

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setApiError(null)
      setNameTouched(true)

      if (name.trim().length < 2 || validationError) return

      setLoading(true)
      try {
        await requestOtp({ phone, mac, ip }, serial)
        const params = new URLSearchParams({ serial, phone, name: name.trim(), mac, ip })
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
    [name, phone, serial, mac, ip, validationError, router],
  )

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        {/* Placeholder logo */}
        <div className="mb-4 flex flex-col items-center">
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
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
              />
            </svg>
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900">Wi-Fi Login</h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Insira seus dados para receber o código de acesso
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="w-full">
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-gray-700"
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
              className={`w-full rounded-lg border px-4 py-3 text-lg text-gray-900 placeholder-gray-400 outline-none transition-colors focus:ring-2 ${
                nameError
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
              } disabled:bg-gray-100 disabled:text-gray-500`}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-600">{nameError}</p>
            )}
          </div>

          <PhoneInput
            value={phone}
            onChange={setPhone}
            error={validationError}
            disabled={loading}
          />

          {apiError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !!validationError || name.trim().length < 2}
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
                Enviando...
              </span>
            ) : (
              'Receber código'
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
