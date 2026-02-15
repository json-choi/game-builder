import { describe, expect, test } from 'bun:test'
import { detectGodot, getArchitecture, clearQuarantine, type DetectionResult } from './detect'

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

    test('result has all DetectionResult interface properties', () => {
      const result = detectGodot()
      expect(result).toHaveProperty('found')
      expect(result).toHaveProperty('path')
      expect(result).toHaveProperty('version')
      expect(result).toHaveProperty('compatible')
      expect(result).toHaveProperty('source')
    })

    test('source is one of valid enum values', () => {
      const result = detectGodot()
      const validSources: DetectionResult['source'][] = ['path', 'common-location', 'user-config', 'none']
      expect(validSources).toContain(result.source)
    })

    test('compatible is false when not found', () => {
      const result = detectGodot()
      if (!result.found) {
        expect(result.compatible).toBe(false)
      }
    })

    test('version is null when not found', () => {
      const result = detectGodot()
      if (!result.found) {
        expect(result.version).toBeNull()
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

    test('archLabel is non-empty string', () => {
      const arch = getArchitecture()
      expect(arch.archLabel.length).toBeGreaterThan(0)
    })

    test('returns all three fields', () => {
      const arch = getArchitecture()
      expect(arch).toHaveProperty('platform')
      expect(arch).toHaveProperty('arch')
      expect(arch).toHaveProperty('archLabel')
    })

    test('platform matches process.platform exactly', () => {
      const arch = getArchitecture()
      expect(arch.platform).toStrictEqual(process.platform)
    })
  })

  describe('clearQuarantine', () => {
    test('returns true on non-darwin platforms', () => {
      if (process.platform !== 'darwin') {
        expect(clearQuarantine('/some/app.app')).toBe(true)
      }
    })

    test('returns boolean regardless of platform', () => {
      const result = clearQuarantine('/tmp/test.app')
      expect(typeof result).toBe('boolean')
    })

    test('handles empty path without throwing', () => {
      const result = clearQuarantine('')
      expect(typeof result).toBe('boolean')
    })

    test('handles non-existent path without throwing', () => {
      const result = clearQuarantine('/nonexistent/path/to/Godot.app')
      expect(typeof result).toBe('boolean')
    })
  })
})
