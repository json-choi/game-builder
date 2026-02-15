import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type Theme = 'dark' | 'light' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
})

const STORAGE_KEY = 'game-builder-theme'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return 'dark'
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') return getSystemTheme()
  return theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
    } catch {}
    return 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => resolveTheme(theme))

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try { localStorage.setItem(STORAGE_KEY, newTheme) } catch {}
  }, [])

  useEffect(() => {
    setResolvedTheme(resolveTheme(theme))
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => setResolvedTheme(getSystemTheme())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
