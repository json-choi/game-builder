import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const mockCliExportProject = mock(() =>
  Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
)
const mockDetectGodot = mock(() => ({
  found: true,
  path: '/usr/bin/godot',
  version: { major: 4, minor: 6, patch: 0, label: 'stable', build: '', hash: '', raw: '4.6' },
  compatible: true,
  source: 'path' as const,
}))
mock.module('./cli.js', () => ({
  exportProject: mockCliExportProject,
  checkOnly: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
  runHeadless: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
  getVersion: async () => ({ exitCode: 0, stdout: '4.6.stable', stderr: '', timedOut: false }),
  spawnGodotEditor: () => ({}),
  spawnGodotPreview: () => ({}),
}))

mock.module('./detect.js', () => ({
  detectGodot: mockDetectGodot,
}))

const {
  getExportPresets,
  createDefaultPresets,
  exportProject,
  checkExportTemplates,
  getExportTemplateUrl,
} = await import('./export')

function getTmpDir(): string {
  const dir = join(tmpdir(), `export-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('export', () => {
  afterEach(() => {
    mockCliExportProject.mockClear()
    mockDetectGodot.mockClear()
    mockCliExportProject.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
    )
    mockDetectGodot.mockImplementation(() => ({
      found: true,
      path: '/usr/bin/godot',
      version: { major: 4, minor: 6, patch: 0, label: 'stable', build: '', hash: '', raw: '4.6' },
      compatible: true,
      source: 'path' as const,
    }))
  })

  describe('getExportPresets', () => {
    test('returns empty array if no export_presets.cfg exists', () => {
      const dir = getTmpDir()
      const result = getExportPresets(dir)
      expect(result).toEqual([])
      rmSync(dir, { recursive: true, force: true })
    })

    test('parses a single preset', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Web"
platform="Web"
runnable=true
export_path="exports/web/game.html"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Web')
      expect(result[0].platform).toBe('web')
      expect(result[0].runnable).toBe(true)
      expect(result[0].exportPath).toBe('exports/web/game.html')

      rmSync(dir, { recursive: true, force: true })
    })

    test('parses multiple presets', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Windows Desktop"
platform="Windows Desktop"
runnable=true
export_path="exports/win/game.exe"

[preset.1]

name="Linux"
platform="Linux/X11"
runnable=false
export_path="exports/linux/game"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Windows Desktop')
      expect(result[0].platform).toBe('windows')
      expect(result[1].name).toBe('Linux')
      expect(result[1].platform).toBe('linux')
      expect(result[1].runnable).toBe(false)

      rmSync(dir, { recursive: true, force: true })
    })

    test('defaults platform to linux for unknown platform', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Custom"
platform="SomeUnknownPlatform"
runnable=true
export_path="exports/custom/game"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('linux')

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles macOS platform', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Mac Build"
platform="macOS"
runnable=true
export_path="exports/mac/game.dmg"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('macos')

      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('createDefaultPresets', () => {
    test('creates export_presets.cfg with all default presets', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir)

      const cfgPath = join(dir, 'export_presets.cfg')
      expect(existsSync(cfgPath)).toBe(true)

      const content = readFileSync(cfgPath, 'utf-8')
      expect(content).toContain('Windows Desktop')
      expect(content).toContain('Linux')
      expect(content).toContain('macOS')
      expect(content).toContain('Web')

      rmSync(dir, { recursive: true, force: true })
    })

    test('creates only specified platform preset', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir, 'Web')

      const content = readFileSync(join(dir, 'export_presets.cfg'), 'utf-8')
      expect(content).toContain('Web')
      expect(content).not.toContain('Windows Desktop')
      expect(content).not.toContain('Linux')

      rmSync(dir, { recursive: true, force: true })
    })

    test('falls back to Linux preset for unknown platform name', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir, 'UnknownPlatform')

      const content = readFileSync(join(dir, 'export_presets.cfg'), 'utf-8')
      expect(content).toContain('UnknownPlatform')
      expect(content).toContain('Linux/X11')

      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('exportProject', () => {
    test('returns success on exit code 0', async () => {
      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.success).toBe(true)
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(result.error).toBeUndefined()

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns failure on non-zero exit code', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Export error', timedOut: false })
      )

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Export error')

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns failure on timeout', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: '', timedOut: true })
      )

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns failure on exception', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.reject(new Error('spawn failed'))
      )

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('spawn failed')

      rmSync(dir, { recursive: true, force: true })
    })

    test('calls onProgress callback', async () => {
      const messages: string[] = []
      const dir = getTmpDir()

      await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
        onProgress: (msg) => messages.push(msg),
      })

      expect(messages.length).toBeGreaterThan(0)
      expect(messages.some((m) => m.includes('Starting export'))).toBe(true)
      expect(messages.some((m) => m.includes('completed successfully'))).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })

    test('creates output directory if it does not exist', async () => {
      const dir = getTmpDir()
      const outputPath = join(dir, 'deep', 'nested', 'output', 'game.html')

      await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath,
      })

      expect(existsSync(join(dir, 'deep', 'nested', 'output'))).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('checkExportTemplates', () => {
    test('returns installed: false for non-existent binary', () => {
      const result = checkExportTemplates('/nonexistent/godot')
      expect(result.installed).toBe(false)
    })

    test('returns an object with installed field', () => {
      const result = checkExportTemplates('/usr/bin/godot')
      expect(typeof result.installed).toBe('boolean')
    })
  })

  describe('getExportTemplateUrl', () => {
    test('returns correct URL for stable version', () => {
      const url = getExportTemplateUrl('4.6-stable')
      expect(url).toContain('4.6-stable')
      expect(url).toContain('export_templates.tpz')
      expect(url).toContain('github.com/godotengine/godot')
    })

    test('strips trailing .stable suffix', () => {
      const url = getExportTemplateUrl('4.6.stable')
      expect(url).toContain('export_templates.tpz')
    })
  })
})
