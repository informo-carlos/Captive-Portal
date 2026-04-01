'use client'

import { useState, useEffect } from 'react'

interface CountdownTimerProps {
  initialSeconds: number
  onExpire: () => void
}

export default function CountdownTimer({
  initialSeconds,
  onExpire,
}: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire()
      return
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsLeft, onExpire])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const progress = secondsLeft / initialSeconds

  const isLow = secondsLeft <= 60
  const barColor = isLow ? 'bg-red-500' : 'bg-blue-500'
  const textColor = isLow ? 'text-red-600' : 'text-gray-600'

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-sm font-medium ${textColor}`}>
          {secondsLeft > 0
            ? `Código válido por ${minutes}:${seconds.toString().padStart(2, '0')}`
            : 'Código expirado'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

export { CountdownTimer }
