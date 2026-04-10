'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { fetchBranding } from '../lib/api'

interface BrandingContextValue {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  welcomeText: string | null
}

const BrandingContext = createContext<BrandingContextValue>({
  logoUrl: null,
  primaryColor: '#00e5c3',
  secondaryColor: '#0a0e17',
  welcomeText: null,
})

export function useBranding() {
  return useContext(BrandingContext)
}

function hexToRgbTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#00e5c3')
  const [secondaryColor, setSecondaryColor] = useState('#0a0e17')
  const [welcomeText, setWelcomeText] = useState<string | null>(null)

  useEffect(() => {
    fetchBranding()
      .then((b) => {
        if (b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color)) {
          document.documentElement.style.setProperty(
            '--color-primary-rgb',
            hexToRgbTriplet(b.primary_color),
          )
          setPrimaryColor(b.primary_color)
        }
        if (b.secondary_color && /^#[0-9a-fA-F]{6}$/.test(b.secondary_color)) {
          document.documentElement.style.setProperty(
            '--color-bg',
            b.secondary_color,
          )
          setSecondaryColor(b.secondary_color)
        }
        if (b.logo_url) setLogoUrl(b.logo_url)
        if (b.welcome_text) setWelcomeText(b.welcome_text)
      })
      .catch(() => {
        // Fallback: mantém defaults
      })
  }, [])

  return (
    <BrandingContext.Provider value={{ logoUrl, primaryColor, secondaryColor, welcomeText }}>
      {children}
    </BrandingContext.Provider>
  )
}
