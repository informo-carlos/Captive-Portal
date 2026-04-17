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
        setError('Erro de comunicação com o servidor. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-edge-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-edge-cyan border-t-transparent" />
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-edge-dark px-4 font-roboto">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[10%] top-[15%] h-72 w-72 rounded-full bg-edge-cyan/10 blur-3xl" />
        <div className="animate-float-reverse absolute right-[15%] top-[10%] h-96 w-96 rounded-full bg-edge-cyan/5 blur-3xl" />
        <div className="animate-pulse-slow absolute bottom-[10%] left-[20%] h-80 w-80 rounded-full bg-teal-500/5 blur-3xl" />
        <div className="animate-float absolute bottom-[20%] right-[10%] h-64 w-64 rounded-full bg-edge-cyan/5 blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,229,195,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,195,.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Decorative dots at top */}
      <div className="pointer-events-none absolute top-6 left-0 right-0 flex justify-center gap-2 opacity-30">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-edge-cyan/40" />
        ))}
      </div>

      {/* Login card */}
      <div className="animate-slide-up relative z-10 w-full max-w-md">
        {/* Glow behind card */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-edge-cyan/10 via-teal-400/5 to-edge-cyan/10 blur-xl" />

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          {/* 4Edge Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-edge-cyan/10 border border-edge-cyan/20">
              <svg className="h-7 w-7 text-edge-cyan" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <h1 className="text-lg font-bold tracking-widest text-white">
              4EDGE
            </h1>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.25em] text-slate-500">
              Painel Administrativo
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
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
                  className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-white shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-600 focus:border-edge-cyan/40 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-edge-cyan/15"
                  placeholder="admin@empresa.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
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
                  className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-4 text-white shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-600 focus:border-edge-cyan/40 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-edge-cyan/15"
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
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-edge-cyan to-teal-400 px-4 py-3 text-sm font-bold text-edge-dark shadow-lg shadow-edge-cyan/20 transition-all duration-300 hover:shadow-edge-cyan/30 focus:outline-none focus:ring-2 focus:ring-edge-cyan/50 focus:ring-offset-2 focus:ring-offset-edge-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {loading ? (
                <span className="relative flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge-dark border-t-transparent" />
                  Entrando...
                </span>
              ) : (
                <span className="relative">Entrar</span>
              )}
            </button>
          </form>

          {/* Bottom decorative */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-edge-cyan/20 to-transparent" />
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-edge-cyan/40" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Datacenter</span>
              <div className="h-1.5 w-1.5 rounded-full bg-edge-cyan/40" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-edge-cyan/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* Bottom decorative dots */}
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center gap-2 opacity-30">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-edge-cyan/40" />
        ))}
      </div>
    </main>
  )
}
