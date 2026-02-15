import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  getTokenPath,
  saveToken,
  loadToken,
  clearToken,
  parseDeepLink,
  exchangeDeviceCode,
  createDeepLinkAuth,
  type DeepLinkAuthDeps,
} from './deep-link-auth'

const mockBase = join(tmpdir(), `deep-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

beforeEach(() => {
  mkdirSync(mockBase, { recursive: true })
})

afterEach(() => {
  if (existsSync(mockBase)) {
    rmSync(mockBase, { recursive: true, force: true })
  }
})

process.on('exit', () => {
  try { rmSync(mockBase, { recursive: true, force: true }) } catch { /* noop */ }
})

describe('getTokenPath', () => {
  test('returns path ending with auth/session.enc', () => {
    const result = getTokenPath(mockBase)
    expect(result).toBe(join(mockBase, 'auth', 'session.enc'))
  })

  test('creates auth directory if it does not exist', () => {
    const authDir = join(mockBase, 'auth')
    expect(existsSync(authDir)).toBe(false)

    getTokenPath(mockBase)

    expect(existsSync(authDir)).toBe(true)
  })

  test('does not throw if auth directory already exists', () => {
    mkdirSync(join(mockBase, 'auth'), { recursive: true })

    expect(() => getTokenPath(mockBase)).not.toThrow()
  })
})

describe('saveToken / loadToken', () => {
  test('saves and loads plaintext token when encrypt/decrypt are null', () => {
    saveToken(mockBase, 'my-secret-token', null)

    const loaded = loadToken(mockBase, null)
    expect(loaded).toBe('my-secret-token')
  })

  test('saves and loads encrypted token', () => {
    const encrypt = (s: string) => Buffer.from(`enc:${s}`)
    const decrypt = (b: Buffer) => b.toString('utf-8').replace('enc:', '')

    saveToken(mockBase, 'encrypted-token', encrypt)

    const raw = readFileSync(getTokenPath(mockBase))
    expect(raw.toString('utf-8')).toBe('enc:encrypted-token')

    const loaded = loadToken(mockBase, decrypt)
    expect(loaded).toBe('encrypted-token')
  })

  test('loadToken returns null when no token file exists', () => {
    const loaded = loadToken(mockBase, null)
    expect(loaded).toBeNull()
  })

  test('loadToken returns null when decrypt throws', () => {
    saveToken(mockBase, 'some-token', null)

    const badDecrypt = () => { throw new Error('decrypt failed') }
    const loaded = loadToken(mockBase, badDecrypt)
    expect(loaded).toBeNull()
  })
})

describe('clearToken', () => {
  test('empties existing token file', () => {
    saveToken(mockBase, 'to-clear', null)
    expect(loadToken(mockBase, null)).toBe('to-clear')

    clearToken(mockBase)

    const content = readFileSync(getTokenPath(mockBase), 'utf-8')
    expect(content).toBe('')
  })

  test('does nothing if token file does not exist', () => {
    expect(() => clearToken(mockBase)).not.toThrow()
  })
})

describe('parseDeepLink', () => {
  test('parses valid auth deep link', () => {
    const result = parseDeepLink('gamebuilder://auth?code=abc123')
    expect(result).toEqual({ type: 'auth', code: 'abc123' })
  })

  test('returns null for wrong protocol', () => {
    const result = parseDeepLink('http://auth?code=abc123')
    expect(result).toBeNull()
  })

  test('returns null for wrong hostname', () => {
    const result = parseDeepLink('gamebuilder://settings?code=abc123')
    expect(result).toBeNull()
  })

  test('returns null when code param is missing', () => {
    const result = parseDeepLink('gamebuilder://auth?token=abc123')
    expect(result).toBeNull()
  })

  test('returns null for invalid URL', () => {
    const result = parseDeepLink('not a url at all')
    expect(result).toBeNull()
  })

  test('returns null for empty string', () => {
    const result = parseDeepLink('')
    expect(result).toBeNull()
  })

  test('handles code with special characters', () => {
    const result = parseDeepLink('gamebuilder://auth?code=abc%3D123%26extra')
    expect(result).toEqual({ type: 'auth', code: 'abc=123&extra' })
  })
})

describe('exchangeDeviceCode', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns token and user on successful exchange', async () => {
    const mockUser = { id: '1', name: 'Test', email: 'test@example.com', image: null }
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ token: 'tok_123', user: mockUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    ) as unknown as typeof fetch

    const result = await exchangeDeviceCode('http://localhost:3001', 'device-code-abc')

    expect(result).toEqual({ token: 'tok_123', user: mockUser })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  test('returns null on non-ok response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))
    ) as unknown as typeof fetch

    const result = await exchangeDeviceCode('http://localhost:3001', 'bad-code')
    expect(result).toBeNull()
  })

  test('returns null on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch

    const result = await exchangeDeviceCode('http://localhost:3001', 'any-code')
    expect(result).toBeNull()
  })

  test('sends correct request body', async () => {
    let capturedBody: string | null = null
    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string
      return new Response(JSON.stringify({ token: 't', user: { id: '1', name: '', email: '', image: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await exchangeDeviceCode('http://backend:9000', 'code-xyz')

    expect(capturedBody!).toBe(JSON.stringify({ code: 'code-xyz' }))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://backend:9000/api/auth/device/exchange',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })
})

describe('createDeepLinkAuth', () => {
  const originalFetch = globalThis.fetch

  function makeDeps(overrides?: Partial<DeepLinkAuthDeps>): DeepLinkAuthDeps {
    return {
      userDataPath: mockBase,
      backendUrl: 'http://localhost:3001',
      encrypt: null,
      decrypt: null,
      ...overrides,
    }
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('handleDeepLink stores token and user on valid auth URL', async () => {
    const mockUser = { id: '1', name: 'Test', email: 'test@test.com', image: null }
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ token: 'tok_abc', user: mockUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    ) as unknown as typeof fetch

    const auth = createDeepLinkAuth(makeDeps())
    auth.handleDeepLink('gamebuilder://auth?code=valid-code')
    await new Promise((r) => setTimeout(r, 50))

    expect(auth.getCurrentUser()).toEqual(mockUser)
    expect(auth.getToken()).toBe('tok_abc')
  })

  test('handleDeepLink calls onAuthStateChanged callback', async () => {
    const mockUser = { id: '2', name: 'Callback', email: 'cb@test.com', image: 'img.png' }
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ token: 'tok_cb', user: mockUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    ) as unknown as typeof fetch

    const onChanged = mock(() => {})
    const auth = createDeepLinkAuth(makeDeps({ onAuthStateChanged: onChanged }))
    auth.handleDeepLink('gamebuilder://auth?code=cb-code')

    await new Promise((r) => setTimeout(r, 50))

    expect(onChanged).toHaveBeenCalledWith({
      authenticated: true,
      user: mockUser,
    })
  })

  test('handleDeepLink ignores invalid URLs without crashing', () => {
    const auth = createDeepLinkAuth(makeDeps())

    expect(() => auth.handleDeepLink('http://not-deep-link')).not.toThrow()
    expect(() => auth.handleDeepLink('garbage')).not.toThrow()
    expect(auth.getCurrentUser()).toBeNull()
  })

  test('logout clears token and user', () => {
    const auth = createDeepLinkAuth(makeDeps())

    saveToken(mockBase, 'existing-token', null)
    auth.setCurrentUser({ id: '1', name: 'User', email: 'u@u.com', image: null })

    auth.logout()

    expect(auth.getCurrentUser()).toBeNull()
    expect(auth.getToken()).toBe('')
  })

  test('getToken returns null when no token stored', () => {
    const auth = createDeepLinkAuth(makeDeps())
    expect(auth.getToken()).toBeNull()
  })

  test('setCurrentUser and getCurrentUser manage user state', () => {
    const auth = createDeepLinkAuth(makeDeps())
    expect(auth.getCurrentUser()).toBeNull()

    const user = { id: '5', name: 'Manual', email: 'm@m.com', image: null }
    auth.setCurrentUser(user)
    expect(auth.getCurrentUser()).toEqual(user)

    auth.setCurrentUser(null)
    expect(auth.getCurrentUser()).toBeNull()
  })
})
