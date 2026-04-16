export default function ErrorPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute left-[10%] top-[20%] h-64 w-64 rounded-full bg-red-500/5 blur-3xl" />
        <div className="animate-float-reverse absolute right-[10%] bottom-[20%] h-72 w-72 rounded-full bg-red-500/3 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            {/* Error icon */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <svg className="h-10 w-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            <h1 className="mt-4 text-2xl font-bold text-white">
              Dispositivo nao autorizado
            </h1>

            <p className="mt-2 text-slate-400">
              Este aparelho nao esta autorizado a usar este portal. Contate o
              administrador da rede.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
