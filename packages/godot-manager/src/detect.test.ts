import { describe, expect, test } from 'bun:test'
import { detectGodot, getArchitecture, clearQuarantine } from './detect'

describe('detect', () => {
  describe('detectGodot', () => {
    test('returns a DetectionResult with all required fields', () => {
      const result = detectGodot()
      expect(typeof result.found).toBe('boolean')
      expect(typeof result.compatible).toBe('boolean')
      expect(['path', 'common-location', 'user-config', 'none']).toContain(result.source)

      if (result.found) {
        expect(typeof result.path).toBe('string')
        expect(result.version).not.toBeNull()
        expect(typeof result.version!.major).toBe('number')
        expect(typeof result.version!.minor).toBe('number')
      } else {
        expect(result.path).toBeNull()
        expect(result.version).toBeNull()
        expect(result.compatible).toBe(false)
        expect(result.source).toBe('none')
      }
    })
  })

  describe('getArchitecture', () => {
    test('returns current platform and arch', () => {
      const arch = getArchitecture()
      expect(arch.platform).toBe(process.platform)
      expect(arch.arch).toBe(process.arch)
      expect(typeof arch.archLabel).toBe('string')
    })

    test('archLabel matches arch value', () => {
      const arch = getArchitecture()
      if (arch.arch === 'arm64') {
        expect(arch.archLabel).toBe('ARM64')
      } else {
        expect(arch.archLabel).toBe('x86_64')
      }
    })
  })

  describe('clearQuarantine', () => {
    test('returns true on non-darwin platforms', () => {
      if (process.platform !== 'darwin') {
        expect(clearQuarantine('/some/app.app')).toBe(true)
      }
    })
  })
})
