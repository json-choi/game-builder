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

    test('handles Mac OSX platform (legacy)', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Legacy Mac"
platform="Mac OSX"
runnable=true
export_path="exports/mac/game.dmg"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('macos')

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles HTML5 platform (Godot 3 legacy)', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="HTML5 Export"
platform="HTML5"
runnable=true
export_path="exports/html5/index.html"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('web')

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles Linux/X11 platform string', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Linux Build"
platform="Linux/X11"
runnable=true
export_path="exports/linux/game"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('linux')

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles Android platform', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Android APK"
platform="Android"
runnable=true
export_path="exports/android/game.apk"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('android')

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles iOS platform', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="iOS Build"
platform="iOS"
runnable=false
export_path="exports/ios/game.ipa"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('ios')
      expect(result[0].runnable).toBe(false)

      rmSync(dir, { recursive: true, force: true })
    })

    test('returns empty array for empty cfg file', () => {
      const dir = getTmpDir()
      writeFileSync(join(dir, 'export_presets.cfg'), '')

      const result = getExportPresets(dir)
      expect(result).toEqual([])

      rmSync(dir, { recursive: true, force: true })
    })

    test('defaults runnable to false when not specified', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Minimal"
platform="Web"
export_path="exports/web/game.html"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].runnable).toBe(false)

      rmSync(dir, { recursive: true, force: true })
    })

    test('defaults exportPath to empty string when not specified', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="No Path"
platform="Web"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].exportPath).toBe('')

      rmSync(dir, { recursive: true, force: true })
    })

    test('defaults platform to linux when not specified', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="No Platform"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result[0].platform).toBe('linux')

      rmSync(dir, { recursive: true, force: true })
    })

    test('skips preset sections without a name', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

platform="Web"
runnable=true

[preset.1]

name="Valid"
platform="Linux"

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Valid')

      rmSync(dir, { recursive: true, force: true })
    })

    test('ignores non-matching lines in cfg', () => {
      const dir = getTmpDir()
      const cfg = `[preset.0]

name="Test"
platform="Web"
; this is a comment
not_a_valid_line

`
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test')

      rmSync(dir, { recursive: true, force: true })
    })

    test('parses all six supported platforms in one cfg', () => {
      const dir = getTmpDir()
      const platforms = [
        { name: 'Win', platform: 'Windows Desktop', expected: 'windows' },
        { name: 'Lin', platform: 'Linux/X11', expected: 'linux' },
        { name: 'Mac', platform: 'macOS', expected: 'macos' },
        { name: 'Web', platform: 'Web', expected: 'web' },
        { name: 'Droid', platform: 'Android', expected: 'android' },
        { name: 'Apple', platform: 'iOS', expected: 'ios' },
      ]

      let cfg = ''
      platforms.forEach((p, i) => {
        cfg += `[preset.${i}]\n\nname="${p.name}"\nplatform="${p.platform}"\n\n`
      })
      writeFileSync(join(dir, 'export_presets.cfg'), cfg)

      const result = getExportPresets(dir)
      expect(result).toHaveLength(6)
      platforms.forEach((p, i) => {
        expect(result[i].name).toBe(p.name)
        expect(result[i].platform).toBe(p.expected)
      })

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

    test('round-trip: created presets can be parsed back', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir)

      const presets = getExportPresets(dir)
      expect(presets).toHaveLength(4)

      const names = presets.map((p) => p.name)
      expect(names).toContain('Windows Desktop')
      expect(names).toContain('Linux')
      expect(names).toContain('macOS')
      expect(names).toContain('Web')

      rmSync(dir, { recursive: true, force: true })
    })

    test('all default presets are runnable', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir)

      const presets = getExportPresets(dir)
      for (const preset of presets) {
        expect(preset.runnable).toBe(true)
      }

      rmSync(dir, { recursive: true, force: true })
    })

    test('default presets have correct export paths', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir)

      const presets = getExportPresets(dir)
      const win = presets.find((p) => p.name === 'Windows Desktop')
      const linux = presets.find((p) => p.name === 'Linux')
      const mac = presets.find((p) => p.name === 'macOS')
      const web = presets.find((p) => p.name === 'Web')

      expect(win!.exportPath).toContain('.exe')
      expect(linux!.exportPath).toContain('exports/')
      expect(mac!.exportPath).toContain('.dmg')
      expect(web!.exportPath).toContain('.html')

      rmSync(dir, { recursive: true, force: true })
    })

    test('single platform round-trip works', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir, 'Web')

      const presets = getExportPresets(dir)
      expect(presets).toHaveLength(1)
      expect(presets[0].name).toBe('Web')
      expect(presets[0].platform).toBe('web')
      expect(presets[0].exportPath).toContain('.html')

      rmSync(dir, { recursive: true, force: true })
    })

    test('Windows preset has correct file extension', () => {
      const dir = getTmpDir()
      createDefaultPresets(dir, 'Windows Desktop')

      const presets = getExportPresets(dir)
      expect(presets[0].exportPath).toMatch(/game\.exe$/)

      rmSync(dir, { recursive: true, force: true })
    })

    test('overwrites existing export_presets.cfg', () => {
      const dir = getTmpDir()
      writeFileSync(join(dir, 'export_presets.cfg'), 'old content')

      createDefaultPresets(dir)

      const content = readFileSync(join(dir, 'export_presets.cfg'), 'utf-8')
      expect(content).not.toContain('old content')
      expect(content).toContain('[preset.')

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

    test('uses fallback error message when stderr is empty on non-zero exit', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 42, stdout: '', stderr: '', timedOut: false })
      )

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Linux',
        outputPath: join(dir, 'exports', 'game'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exit code 42')

      rmSync(dir, { recursive: true, force: true })
    })

    test('onProgress fires on failure path', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: 'build broke', timedOut: false })
      )

      const messages: string[] = []
      const dir = getTmpDir()

      await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
        onProgress: (msg) => messages.push(msg),
      })

      expect(messages.some((m) => m.includes('Starting export'))).toBe(true)
      expect(messages.some((m) => m.includes('Export failed'))).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })

    test('onProgress fires on timeout path', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: '', timedOut: true })
      )

      const messages: string[] = []
      const dir = getTmpDir()

      await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
        onProgress: (msg) => messages.push(msg),
      })

      expect(messages.some((m) => m.includes('timed out'))).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })

    test('onProgress fires on exception path', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.reject(new Error('process crashed'))
      )

      const messages: string[] = []
      const dir = getTmpDir()

      await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
        onProgress: (msg) => messages.push(msg),
      })

      expect(messages.some((m) => m.includes('Export error'))).toBe(true)
      expect(messages.some((m) => m.includes('process crashed'))).toBe(true)

      rmSync(dir, { recursive: true, force: true })
    })

    test('passes preset name to CLI export function', async () => {
      const dir = getTmpDir()

      await exportProject({
        projectPath: dir,
        preset: 'Windows Desktop',
        outputPath: join(dir, 'exports', 'game.exe'),
      })

      expect(mockCliExportProject).toHaveBeenCalledTimes(1)
      const callArgs = mockCliExportProject.mock.calls[0]
      expect(callArgs[1]).toBe('Windows Desktop')

      rmSync(dir, { recursive: true, force: true })
    })

    test('resolves outputPath to absolute', async () => {
      const dir = getTmpDir()

      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.outputPath).toMatch(/^\//)

      rmSync(dir, { recursive: true, force: true })
    })

    test('handles non-Error thrown exceptions', async () => {
      mockCliExportProject.mockImplementation(() => Promise.reject('string error'))

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('string error')

      rmSync(dir, { recursive: true, force: true })
    })

    test('duration is measured even on failure', async () => {
      mockCliExportProject.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: 'fail', timedOut: false })
      )

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.duration).toBeGreaterThanOrEqual(0)

      rmSync(dir, { recursive: true, force: true })
    })

    test('duration is measured even on exception', async () => {
      mockCliExportProject.mockImplementation(() => Promise.reject(new Error('kaboom')))

      const dir = getTmpDir()
      const result = await exportProject({
        projectPath: dir,
        preset: 'Web',
        outputPath: join(dir, 'exports', 'game.html'),
      })

      expect(result.duration).toBeGreaterThanOrEqual(0)

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

    test('result always has installed property', () => {
      const result = checkExportTemplates('/some/path')
      expect(result).toHaveProperty('installed')
    })

    test('version is undefined when binary fails', () => {
      const result = checkExportTemplates('/nonexistent/godot')
      expect(result.version).toBeUndefined()
    })

    test('handles empty string path', () => {
      const result = checkExportTemplates('')
      expect(result.installed).toBe(false)
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

    test('returns URL for version without stable suffix', () => {
      const url = getExportTemplateUrl('4.4')
      expect(url).toContain('4.4-stable')
      expect(url).toContain('export_templates.tpz')
    })

    test('handles version with patch number', () => {
      const url = getExportTemplateUrl('4.4.1')
      expect(url).toContain('4.4.1-stable')
      expect(url).toContain('export_templates.tpz')
    })

    test('URL contains github releases path', () => {
      const url = getExportTemplateUrl('4.6-stable')
      expect(url).toMatch(/^https:\/\/github\.com\/godotengine\/godot\/releases\/download\//)
    })

    test('URL ends with .tpz extension', () => {
      const url = getExportTemplateUrl('4.6-stable')
      expect(url).toMatch(/\.tpz$/)
    })

    test('handles version string with surrounding whitespace', () => {
      const url = getExportTemplateUrl('  4.6-stable  ')
      expect(url).toContain('export_templates.tpz')
    })
  })
})
