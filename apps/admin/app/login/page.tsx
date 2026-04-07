'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'
import { ApiRequestError } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const { login, user, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
      } else {
        setError('Erro de comunicacao com o servidor. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#021327]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#007bbe] border-t-transparent" />
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#010d1a] via-[#021327] to-[#041e3a] px-4 font-roboto">
      {/* Animated background orbs - 4Edge blue palette */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[10%] top-[15%] h-72 w-72 rounded-full bg-[#007bbe]/20 blur-3xl" />
        <div className="animate-float-reverse absolute right-[15%] top-[10%] h-96 w-96 rounded-full bg-[#007bbe]/15 blur-3xl" />
        <div className="animate-pulse-slow absolute bottom-[10%] left-[20%] h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="animate-float absolute bottom-[20%] right-[10%] h-64 w-64 rounded-full bg-[#007bbe]/10 blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,123,190,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,123,190,.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Login card */}
      <div className="animate-slide-up relative z-10 w-full max-w-md">
        {/* Glow behind card */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#007bbe]/20 via-sky-400/15 to-[#007bbe]/20 blur-xl" />

        <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
          {/* 4Edge Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://4edge.cloud/wp-content/uploads/2021/03/4edge-logo-white.png"
                alt="4Edge Datacenter"
                className="h-10 object-contain drop-shadow-lg"
              />
            </div>
            <div className="mx-auto mb-4 h-px w-16 bg-gradient-to-r from-transparent via-[#007bbe]/50 to-transparent" />
            <h1 className="text-xl font-medium tracking-wide text-white/90">
              Captive Portal
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                Email
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-500 focus:border-[#007bbe]/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#007bbe]/20"
                  placeholder="admin@empresa.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                Senha
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-500 focus:border-[#007bbe]/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#007bbe]/20"
                  placeholder="Sua senha"
                />
              </div>
            </div>

            {error && (
              <div className="animate-fade-in rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300 backdrop-blur-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-[#007bbe] to-[#0095e8] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#007bbe]/25 transition-all duration-300 hover:from-[#0095e8] hover:to-[#00a8ff] hover:shadow-[#007bbe]/40 focus:outline-none focus:ring-2 focus:ring-[#007bbe]/50 focus:ring-offset-2 focus:ring-offset-[#021327] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* Shine effect on hover */}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {loading ? (
                <span className="relative flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Entrando...
                </span>
              ) : (
                <span className="relative">Entrar</span>
              )}
            </button>
          </form>

          {/* Bottom decorative */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#007bbe]/20 to-transparent" />
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#007bbe]/40" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Datacenter</span>
              <div className="h-1.5 w-1.5 rounded-full bg-[#007bbe]/40" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#007bbe]/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* Bottom accent dots */}
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 opacity-30">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1 w-1 rounded-full bg-[#007bbe]"
            style={{ animationDelay: `${i * 0.2}s`, animation: 'pulse-slow 3s ease-in-out infinite' }}
          />
        ))}
      </div>
    </main>
  )
}
