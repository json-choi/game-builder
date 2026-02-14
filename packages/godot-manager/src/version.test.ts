import { describe, expect, test } from 'bun:test'
import {
  parseGodotVersion,
  formatVersion,
  compareVersions,
  isVersionCompatible,
  versionCompatibilityMessage,
  getBinaryName,
  getDownloadFilename,
  MIN_SUPPORTED_VERSION,
  MAX_SUPPORTED_MINOR,
  type GodotVersion,
} from './version'

function v(major: number, minor: number, patch = 0, label = 'stable'): GodotVersion {
  return { major, minor, patch, label, build: '', hash: '', raw: '' }
}

describe('version', () => {
  describe('parseGodotVersion', () => {
    test('parses full version string with all components', () => {
      const result = parseGodotVersion('4.6.stable.official.89cea1439')
      expect(result).not.toBeNull()
      expect(result!.major).toBe(4)
      expect(result!.minor).toBe(6)
      expect(result!.patch).toBe(0)
      expect(result!.label).toBe('stable')
      expect(result!.build).toBe('official')
      expect(result!.hash).toBe('89cea1439')
    })

    test('parses version with patch number', () => {
      const result = parseGodotVersion('4.4.1.stable.official.abc123')
      expect(result).not.toBeNull()
      expect(result!.major).toBe(4)
      expect(result!.minor).toBe(4)
      expect(result!.patch).toBe(1)
      expect(result!.label).toBe('stable')
    })

    test('parses minimal major.minor version', () => {
      const result = parseGodotVersion('4.4')
      expect(result).not.toBeNull()
      expect(result!.major).toBe(4)
      expect(result!.minor).toBe(4)
      expect(result!.patch).toBe(0)
      expect(result!.label).toBe('stable')
    })

    test('returns null for invalid version strings', () => {
      expect(parseGodotVersion('')).toBeNull()
      expect(parseGodotVersion('invalid')).toBeNull()
      expect(parseGodotVersion('abc.def')).toBeNull()
    })

    test('trims whitespace', () => {
      const result = parseGodotVersion('  4.4  ')
      expect(result).not.toBeNull()
      expect(result!.major).toBe(4)
      expect(result!.minor).toBe(4)
    })

    test('preserves raw string (trimmed)', () => {
      const result = parseGodotVersion('  4.6.stable.official.89cea1439  ')
      expect(result!.raw).toBe('4.6.stable.official.89cea1439')
    })
  })

  describe('formatVersion', () => {
    test('formats stable version as major.minor.patch', () => {
      expect(formatVersion(v(4, 6, 0))).toBe('4.6.0')
    })

    test('formats version with non-stable label', () => {
      expect(formatVersion(v(4, 5, 0, 'beta'))).toBe('4.5.0-beta')
    })

    test('formats version with patch and stable label', () => {
      expect(formatVersion(v(4, 4, 1))).toBe('4.4.1')
    })
  })

  describe('compareVersions', () => {
    test('returns 0 for equal versions', () => {
      expect(compareVersions(v(4, 4, 0), v(4, 4, 0))).toBe(0)
    })

    test('compares by major version', () => {
      expect(compareVersions(v(3, 0, 0), v(4, 0, 0))).toBe(-1)
      expect(compareVersions(v(5, 0, 0), v(4, 0, 0))).toBe(1)
    })

    test('compares by minor version', () => {
      expect(compareVersions(v(4, 3, 0), v(4, 5, 0))).toBe(-1)
      expect(compareVersions(v(4, 6, 0), v(4, 4, 0))).toBe(1)
    })

    test('compares by patch version', () => {
      expect(compareVersions(v(4, 4, 0), v(4, 4, 1))).toBe(-1)
      expect(compareVersions(v(4, 4, 2), v(4, 4, 1))).toBe(1)
    })
  })

  describe('isVersionCompatible', () => {
    test('returns true for minimum supported version', () => {
      expect(isVersionCompatible(v(4, MIN_SUPPORTED_VERSION.minor, 0))).toBe(true)
    })

    test('returns true for max supported minor', () => {
      expect(isVersionCompatible(v(4, MAX_SUPPORTED_MINOR, 0))).toBe(true)
    })

    test('returns false for wrong major version', () => {
      expect(isVersionCompatible(v(3, 5, 0))).toBe(false)
      expect(isVersionCompatible(v(5, 5, 0))).toBe(false)
    })

    test('returns false for minor below minimum', () => {
      expect(isVersionCompatible(v(4, MIN_SUPPORTED_VERSION.minor - 1, 0))).toBe(false)
    })

    test('returns false for minor above maximum', () => {
      expect(isVersionCompatible(v(4, MAX_SUPPORTED_MINOR + 1, 0))).toBe(false)
    })
  })

  describe('versionCompatibilityMessage', () => {
    test('returns compatible message for valid version', () => {
      const msg = versionCompatibilityMessage(v(4, 5, 0))
      expect(msg).toContain('is compatible')
      expect(msg).toContain('4.5.0')
    })

    test('returns NOT compatible message for invalid version', () => {
      const msg = versionCompatibilityMessage(v(3, 5, 0))
      expect(msg).toContain('is NOT compatible')
    })
  })

  describe('getBinaryName', () => {
    test('returns macOS binary path', () => {
      const name = getBinaryName(v(4, 6), 'darwin', 'x64')
      expect(name).toBe('Godot.app/Contents/MacOS/Godot')
    })

    test('returns Windows binary name', () => {
      const name = getBinaryName(v(4, 6), 'win32', 'x64')
      expect(name).toBe('Godot_v4.6-stable_win64.exe')
    })

    test('returns Linux x86_64 binary name', () => {
      const name = getBinaryName(v(4, 6), 'linux', 'x64')
      expect(name).toBe('Godot_v4.6-stable_linux.x86_64')
    })

    test('returns Linux arm64 binary name', () => {
      const name = getBinaryName(v(4, 6), 'linux', 'arm64')
      expect(name).toBe('Godot_v4.6-stable_linux.arm64')
    })

    test('throws for unsupported platform', () => {
      expect(() => getBinaryName(v(4, 6), 'freebsd' as NodeJS.Platform)).toThrow(
        'Unsupported platform: freebsd'
      )
    })
  })

  describe('getDownloadFilename', () => {
    test('returns macOS zip filename', () => {
      const name = getDownloadFilename(v(4, 6), 'darwin', 'x64')
      expect(name).toBe('Godot_v4.6-stable_macos.universal.zip')
    })

    test('returns Windows zip filename', () => {
      const name = getDownloadFilename(v(4, 6), 'win32', 'x64')
      expect(name).toBe('Godot_v4.6-stable_win64.exe.zip')
    })

    test('returns Linux x86_64 zip filename', () => {
      const name = getDownloadFilename(v(4, 6), 'linux', 'x64')
      expect(name).toBe('Godot_v4.6-stable_linux.x86_64.zip')
    })

    test('returns Linux arm64 zip filename', () => {
      const name = getDownloadFilename(v(4, 6), 'linux', 'arm64')
      expect(name).toBe('Godot_v4.6-stable_linux.arm64.zip')
    })

    test('throws for unsupported platform', () => {
      expect(() => getDownloadFilename(v(4, 6), 'freebsd' as NodeJS.Platform)).toThrow(
        'Unsupported platform: freebsd'
      )
    })
  })
})
