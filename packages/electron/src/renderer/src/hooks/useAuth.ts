import { useState, useEffect, useCallback } from 'react'

export interface AuthUserInfo {
  id: string
  name: string
  email: string
  image: string | null
}

interface AuthStateResponse {
  authenticated: boolean
  user: AuthUserInfo | null
}

function getAuthApi() {
  return (window as unknown as { api: { auth: {
    getState: () => Promise<AuthStateResponse>
    logout: () => Promise<boolean>
    openLogin: () => Promise<void>
    signInEmail: (email: string, password: string) => Promise<AuthStateResponse>
    onStateChanged: (cb: (state: AuthStateResponse) => void) => () => void
  }}}).api.auth
}

export function useAuth() {
  const [user, setUser] = useState<AuthUserInfo | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadState = async () => {
      try {
        const state = await getAuthApi().getState()
        if (cancelled) return
        setUser(state.user)
        setIsAuthenticated(state.authenticated)
      } catch {
        if (cancelled) return
        setUser(null)
        setIsAuthenticated(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadState()

    const unsubscribe = getAuthApi().onStateChanged((state) => {
      if (cancelled) return
      setUser(state.user)
      setIsAuthenticated(state.authenticated)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const login = useCallback(() => {
    getAuthApi().openLogin()
  }, [])

  const signInEmail = useCallback(async (email: string, password: string) => {
    const result = await getAuthApi().signInEmail(email, password)
    setUser(result.user)
    setIsAuthenticated(result.authenticated)
    return result
  }, [])

  const logout = useCallback(async () => {
    await getAuthApi().logout()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return { user, isAuthenticated, isLoading, login, signInEmail, logout }
}
