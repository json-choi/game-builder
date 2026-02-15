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

    test('rejects on non-existent file', async () => {
      const { verifySha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'nonexistent.bin')

      await expect(verifySha512(filePath, 'abc')).rejects.toThrow()
      rmSync(dir, { recursive: true, force: true })
    })

    test('handles empty file', async () => {
      const { verifySha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'empty.bin')
      writeFileSync(filePath, '')

      const expectedHash = createHash('sha512').update('').digest('hex')
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

    test('rejects on non-existent file', async () => {
      const { computeSha512 } = await import('./download')
      await expect(computeSha512('/tmp/nonexistent-file-abc')).rejects.toThrow()
    })

    test('returns consistent hash for same content', async () => {
      const { computeSha512 } = await import('./download')
      const dir = getTmpDir()
      const f1 = join(dir, 'a.bin')
      const f2 = join(dir, 'b.bin')
      writeFileSync(f1, 'identical content')
      writeFileSync(f2, 'identical content')

      const h1 = await computeSha512(f1)
      const h2 = await computeSha512(f2)
      expect(h1).toBe(h2)

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns different hash for different content', async () => {
      const { computeSha512 } = await import('./download')
      const dir = getTmpDir()
      const f1 = join(dir, 'a.bin')
      const f2 = join(dir, 'b.bin')
      writeFileSync(f1, 'content A')
      writeFileSync(f2, 'content B')

      const h1 = await computeSha512(f1)
      const h2 = await computeSha512(f2)
      expect(h1).not.toBe(h2)

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles binary content', async () => {
      const { computeSha512 } = await import('./download')
      const dir = getTmpDir()
      const filePath = join(dir, 'binary.bin')
      const buf = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01])
      writeFileSync(filePath, buf)

      const result = await computeSha512(filePath)
      const expected = createHash('sha512').update(buf).digest('hex')
      expect(result).toBe(expected)

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

    test('accepts platform and arch overrides', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
      ) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = getTmpDir()

        const result = await downloadGodot({
          version: makeVersion(),
          destDir: dir,
          platform: 'linux',
          arch: 'x64',
        })

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()

        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    test('returns early with no sha512 when binary already exists', async () => {
      const { downloadGodot } = await import('./download')
      const { getBinaryName } = await import('./version')
      const dir = getTmpDir()
      const version = makeVersion()
      const binaryName = getBinaryName(version, 'linux', 'x64')

      writeFileSync(join(dir, binaryName), 'existing-binary')

      const result = await downloadGodot({ version, destDir: dir, platform: 'linux', arch: 'x64' })
      expect(result.success).toBe(true)
      expect(result.path).toBe(join(dir, binaryName))
      expect(result.sha512).toBeUndefined()

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles archive already downloaded but not extracted', async () => {
      const { downloadGodot } = await import('./download')
      const { getDownloadFilename } = await import('./version')
      const dir = getTmpDir()
      const version = makeVersion()
      const filename = getDownloadFilename(version, 'linux', 'x64')

      writeFileSync(join(dir, filename), 'not-a-real-zip-so-extraction-fails')

      const result = await downloadGodot({
        version,
        destDir: dir,
        platform: 'linux',
        arch: 'x64',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Extraction failed')

      rmSync(dir, { recursive: true, force: true })
    })

    test('calls onProgress callback during download', async () => {
      const origFetch = globalThis.fetch
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'))
          controller.close()
        },
      })
      let fetchCallCount = 0
      globalThis.fetch = mock(() => {
        fetchCallCount++
        if (fetchCallCount === 1) {
          return Promise.resolve(
            new Response(body, {
              status: 200,
              headers: { 'content-length': '4' },
            })
          )
        }
        return Promise.resolve(new Response(null, { status: 404 }))
      }) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = getTmpDir()
        const progressCalls: Array<{ downloaded: number; total: number }> = []

        await downloadGodot({
          version: makeVersion(),
          destDir: dir,
          platform: 'linux',
          arch: 'x64',
          onProgress: (downloaded, total) => {
            progressCalls.push({ downloaded, total })
          },
        })

        if (progressCalls.length > 0) {
          expect(progressCalls[0].total).toBe(4)
          expect(progressCalls[0].downloaded).toBeGreaterThan(0)
        }

        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    test('handles redirect responses during download', async () => {
      const origFetch = globalThis.fetch
      let callCount = 0
      globalThis.fetch = mock(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: 'https://example.com/redirected' },
            })
          )
        }
        return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
      }) as typeof fetch

      try {
        const { downloadGodot } = await import('./download')
        const dir = getTmpDir()

        const result = await downloadGodot({
          version: makeVersion(),
          destDir: dir,
          platform: 'linux',
          arch: 'x64',
        })

        expect(result.success).toBe(false)
        expect(callCount).toBeGreaterThanOrEqual(2)

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

    test('DownloadResult has correct shape on failure', async () => {
      const { downloadGodot } = await import('./download')
      const origFetch = globalThis.fetch
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
      ) as typeof fetch

      try {
        const dir = getTmpDir()
        const result = await downloadGodot({ version: makeVersion(), destDir: dir })

        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('path')
        expect(result.success).toBe(false)
        expect(result.path).toBeNull()
        expect(typeof result.error).toBe('string')

        rmSync(dir, { recursive: true, force: true })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    test('DownloadResult has correct shape on success (binary exists)', async () => {
      const { downloadGodot } = await import('./download')
      const { getBinaryName } = await import('./version')
      const dir = getTmpDir()
      const version = makeVersion()
      const binaryName = getBinaryName(version, 'linux', 'x64')

      writeFileSync(join(dir, binaryName), 'fake')

      const result = await downloadGodot({ version, destDir: dir, platform: 'linux', arch: 'x64' })
      expect(result.success).toBe(true)
      expect(typeof result.path).toBe('string')
      expect(result.error).toBeUndefined()

      rmSync(dir, { recursive: true, force: true })
    })
  })
})
