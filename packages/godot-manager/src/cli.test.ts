import { describe, expect, mock, test } from 'bun:test'

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

    test('returns GodotCliResult when godot binary does not exist', async () => {
      const result = await checkOnly('/tmp/nonexistent-project', undefined, {
        godotPath: '/nonexistent/godot',
      })
      expect(result).toMatchObject({ exitCode: expect.any(Number) })
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(typeof result.timedOut).toBe('boolean')
    })

    test('returns result with all GodotCliResult fields', async () => {
      const result = await checkOnly('/tmp/nonexistent-project', undefined, {
        godotPath: '/nonexistent/godot',
      })
      expect(result).toHaveProperty('exitCode')
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result).toHaveProperty('timedOut')
    })

    test('accepts scriptPath parameter', async () => {
      const result = await checkOnly('/tmp/nonexistent-project', 'res://test.gd', {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
    })

    test('returns a numeric exit code for nonexistent binary', async () => {
      const result = await checkOnly('/tmp/nonexistent', undefined, {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
    })
  })

  describe('getVersion', () => {
    test('is a function', () => {
      expect(typeof getVersion).toBe('function')
    })

    test('returns GodotCliResult', async () => {
      const result = await getVersion({ godotPath: '/nonexistent/godot' })
      expect(typeof result.exitCode).toBe('number')
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(typeof result.timedOut).toBe('boolean')
    })

    test('accepts custom godotPath option', async () => {
      const result = await getVersion({ godotPath: '/nonexistent/godot' })
      expect(typeof result.exitCode).toBe('number')
    })
  })

  describe('runHeadless', () => {
    test('is a function', () => {
      expect(typeof runHeadless).toBe('function')
    })

    test('returns GodotCliResult', async () => {
      const result = await runHeadless('/tmp/nonexistent', [], {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(typeof result.timedOut).toBe('boolean')
    })

    test('accepts extra arguments', async () => {
      const result = await runHeadless('/tmp/nonexistent', ['--verbose'], {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
    })
  })

  describe('exportProject', () => {
    test('is a function', () => {
      expect(typeof exportProject).toBe('function')
    })

    test('returns GodotCliResult', async () => {
      const result = await exportProject('/tmp/nonexistent', 'Web', '/tmp/out.html', {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(typeof result.timedOut).toBe('boolean')
    })

    test('returns a result with all fields for missing godot', async () => {
      const result = await exportProject('/tmp/nonexistent', 'Linux', '/tmp/out', {
        godotPath: '/nonexistent/godot',
      })
      expect(typeof result.exitCode).toBe('number')
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
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

  describe('GodotCliOptions', () => {
    test('timeout option is accepted', async () => {
      const result = await getVersion({ godotPath: '/nonexistent/godot', timeout: 1000 })
      expect(typeof result.exitCode).toBe('number')
    })

    test('cwd option is accepted', async () => {
      const result = await runHeadless('/tmp', [], {
        godotPath: '/nonexistent/godot',
        cwd: '/tmp',
      })
      expect(typeof result.exitCode).toBe('number')
    })
  })
})
