import { afterEach, describe, expect, mock, test, beforeEach } from 'bun:test'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import type { GodotVersion } from './version'

function makeVersion(overrides: Partial<GodotVersion> = {}): GodotVersion {
  return {
    major: 4,
    minor: 6,
    patch: 0,
    label: 'stable',
    build: 'official',
    hash: 'abc123',
    raw: '4.6.stable.official.abc123',
    ...overrides,
  }
}

function getTmpDir(): string {
  const dir = join(tmpdir(), `download-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('download', () => {
  describe('verifySha512', () => {
    test('returns true for matching hash', async () => {
      const { verifySha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'test.bin')
      const content = 'hello world'
      writeFileSync(filePath, content)

      const expectedHash = createHash('sha512').update(content).digest('hex')
      const result = await verifySha512(filePath, expectedHash)
      expect(result).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns false for non-matching hash', async () => {
      const { verifySha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'test.bin')
      writeFileSync(filePath, 'hello world')

      const result = await verifySha512(filePath, 'deadbeef'.repeat(16))
      expect(result).toBe(false)

      rmSync(dir, { recursive: true, force: true })
    })

    test('is case-insensitive for expected hash', async () => {
      const { verifySha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'test.bin')
      const content = 'case test'
      writeFileSync(filePath, content)

      const expectedHash = createHash('sha512').update(content).digest('hex').toUpperCase()
      const result = await verifySha512(filePath, expectedHash)
      expect(result).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('computeSha512', () => {
    test('computes correct sha512 hash', async () => {
      const { computeSha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'hash.bin')
      const content = 'test content for hash'
      writeFileSync(filePath, content)

      const result = await computeSha512(filePath)
      const expected = createHash('sha512').update(content).digest('hex')
      expect(result).toBe(expected)

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns hex string of length 128', async () => {
      const { computeSha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'len.bin')
      writeFileSync(filePath, 'x')

      const result = await computeSha512(filePath)
      expect(result).toHaveLength(128)
      expect(result).toMatch(/^[a-f0-9]+$/)

      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('downloadGodot', () => {
    test('returns early if binary already exists at destination', async () => {
      const { downloadGodot } = await import('./download')
      const { getBinaryName } = await import('./version')
      const dir = getTmpDir()
      const version = makeVersion()
      const binaryName = getBinaryName(version, process.platform, process.arch)
      const binaryPath = join(dir, binaryName)

      mkdirSync(join(dir, ...binaryName.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(binaryPath, 'fake-binary')

      const result = await downloadGodot({ version, destDir: dir })
      expect(result.success).toBe(true)
      expect(result.path).toBe(binaryPath)

      rmSync(dir, { recursive: true, force: true })
    })

    test('creates destination directory if it does not exist', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
      ) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = join(tmpdir(), `dl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'nested')

        const result = await downloadGodot({
          version: makeVersion(),
          destDir: dir,
        })

        expect(existsSync(dir)).toBe(true)
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()

        rmSync(join(dir, '..'), { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    test('returns error on HTTP failure', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 500, statusText: 'Server Error' }))
      ) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = getTmpDir()

        const result = await downloadGodot({
          version: makeVersion(),
          destDir: dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('500')

        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    test('returns error on network failure', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = getTmpDir()

        const result = await downloadGodot({
          version: makeVersion(),
          destDir: dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('Download failed')

        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })

  describe('DownloadOptions interface', () => {
    test('accepts minimal required options', async () => {
      const { downloadGodot } = await import('./download')
      const version = makeVersion()
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404 }))
      ) as typeof fetch

      try {
        const dir = getTmpDir()
        const result = await downloadGodot({ version, destDir: dir })
        expect(typeof result.success).toBe('boolean')
        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })
})
