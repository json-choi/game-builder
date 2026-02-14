import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'events'

mock.module('./detect.js', () => ({
  detectGodot: () => ({
    found: true,
    path: '/usr/bin/godot',
    version: { major: 4, minor: 6, patch: 0, label: 'stable', build: '', hash: '', raw: '4.6' },
    compatible: true,
    source: 'path' as const,
  }),
}))

const { checkOnly, exportProject, getVersion, runHeadless, spawnGodotEditor, spawnGodotPreview } =
  await import('./cli')

describe('cli', () => {
  describe('checkOnly', () => {
    test('is a function', () => {
      expect(typeof checkOnly).toBe('function')
    })

    test('rejects when godot binary does not exist', async () => {
      await expect(
        checkOnly('/tmp/nonexistent-project', undefined, { godotPath: '/nonexistent/godot' })
      ).resolves.toMatchObject({ exitCode: expect.any(Number) })
    })
  })

  describe('getVersion', () => {
    test('is a function', () => {
      expect(typeof getVersion).toBe('function')
    })
  })

  describe('runHeadless', () => {
    test('is a function', () => {
      expect(typeof runHeadless).toBe('function')
    })
  })

  describe('exportProject', () => {
    test('is a function', () => {
      expect(typeof exportProject).toBe('function')
    })
  })

  describe('spawnGodotEditor', () => {
    test('is a function', () => {
      expect(typeof spawnGodotEditor).toBe('function')
    })
  })

  describe('spawnGodotPreview', () => {
    test('is a function', () => {
      expect(typeof spawnGodotPreview).toBe('function')
    })
  })
})
