import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface AuthUser {
  id: string
  name: string
  email: string
  image: string | null
}

export interface DeepLinkAuthDeps {
  userDataPath: string
  backendUrl: string
  /** null = encryption unavailable, falls back to plaintext storage */
  encrypt: ((plaintext: string) => Buffer) | null
  /** null = encryption unavailable, falls back to plaintext read */
  decrypt: ((encrypted: Buffer) => string) | null
  onAuthStateChanged?: (state: { authenticated: boolean; user: AuthUser | null }) => void
}

export interface DeepLinkParseResult {
  type: 'auth'
  code: string
}

const PROTOCOL = 'gamebuilder'

export function getTokenPath(userDataPath: string): string {
  const dir = join(userDataPath, 'auth')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'session.enc')
}

export function saveToken(
  userDataPath: string,
  token: string,
  encrypt: ((plaintext: string) => Buffer) | null
): void {
  if (encrypt) {
    const encrypted = encrypt(token)
    writeFileSync(getTokenPath(userDataPath), encrypted)
  } else {
    writeFileSync(getTokenPath(userDataPath), token, 'utf-8')
  }
}

export function loadToken(
  userDataPath: string,
  decrypt: ((encrypted: Buffer) => string) | null
): string | null {
  const tokenPath = getTokenPath(userDataPath)
  if (!existsSync(tokenPath)) return null
  try {
    const data = readFileSync(tokenPath)
    if (decrypt) {
      return decrypt(data)
    }
    return data.toString('utf-8')
  } catch {
    return null
  }
}

export function clearToken(userDataPath: string): void {
  const tokenPath = getTokenPath(userDataPath)
  if (existsSync(tokenPath)) {
    writeFileSync(tokenPath, '')
  }
}

export function parseDeepLink(url: string): DeepLinkParseResult | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${PROTOCOL}:`) return null

    const code = parsed.searchParams.get('code')
    if (parsed.hostname === 'auth' && code) {
      return { type: 'auth', code }
    }

    return null
  } catch {
    return null
  }
}

export async function exchangeDeviceCode(
  backendUrl: string,
  code: string
): Promise<{ token: string; user: AuthUser } | null> {
  try {
    const response = await fetch(`${backendUrl}/api/auth/device/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    if (!response.ok) {
      console.error('[deep-link] Device code exchange failed:', response.status)
      return null
    }

    return (await response.json()) as { token: string; user: AuthUser }
  } catch (err) {
    console.error('[deep-link] Exchange error:', err)
    return null
  }
}

export function createDeepLinkAuth(deps: DeepLinkAuthDeps) {
  let currentUser: AuthUser | null = null

  function handleDeepLink(url: string): void {
    const result = parseDeepLink(url)
    if (!result) {
      if (url) console.error('[deep-link] Failed to parse URL:', url)
      return
    }

    if (result.type === 'auth') {
      handleAuthCode(result.code)
    }
  }

  async function handleAuthCode(code: string): Promise<void> {
    const data = await exchangeDeviceCode(deps.backendUrl, code)
    if (!data) return

    saveToken(deps.userDataPath, data.token, deps.encrypt)
    currentUser = data.user

    deps.onAuthStateChanged?.({
      authenticated: true,
      user: currentUser,
    })
  }

  function getToken(): string | null {
    return loadToken(deps.userDataPath, deps.decrypt)
  }

  function getCurrentUser(): AuthUser | null {
    return currentUser
  }

  function setCurrentUser(user: AuthUser | null): void {
    currentUser = user
  }

  function logout(): void {
    clearToken(deps.userDataPath)
    currentUser = null
  }

  return {
    handleDeepLink,
    handleAuthCode,
    getToken,
    getCurrentUser,
    setCurrentUser,
    logout,
  }
}
