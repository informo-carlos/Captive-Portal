'use client'

import { useEffect, useState } from 'react'

export default function SuccessPage() {
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setClosing(true)
      // Tenta fechar a janela (funciona se aberta via JS)
      window.close()
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center text-center">
          {/* Checkmark */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-10 w-10 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Acesso liberado com sucesso!
          </h1>

          <p className="mt-2 text-gray-600">
            Você já pode navegar na internet. Pode fechar esta janela.
          </p>

          <div className="mt-4 rounded-lg bg-blue-50 px-4 py-2">
            <p className="text-sm font-medium text-blue-700">
              Tempo de acesso: 8 horas
            </p>
          </div>

          {closing && (
            <p className="mt-4 text-xs text-gray-400">
              Fechando automaticamente...
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
