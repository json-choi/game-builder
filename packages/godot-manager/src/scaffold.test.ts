import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { scaffoldProject, getAvailableTemplates } from './scaffold'

let testDir: string
let templatesDir: string

beforeEach(() => {
  const id = `scaffold-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  testDir = join(tmpdir(), id)
  templatesDir = join(testDir, 'templates')
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
})

function createFakeTemplate(name: string): string {
  const templateDir = join(templatesDir, name)
  mkdirSync(join(templateDir, 'scenes'), { recursive: true })
  mkdirSync(join(templateDir, 'scripts'), { recursive: true })
  mkdirSync(join(templateDir, 'assets'), { recursive: true })

  const projectGodot = `; Engine configuration file.
config_version=5

[application]

config/name="Template Project"
config/features=PackedStringArray("4.4", "Forward Plus")

[display]

window/size/viewport_width=1152
window/size/viewport_height=648
`
  writeFileSync(join(templateDir, 'project.godot'), projectGodot)
  writeFileSync(join(templateDir, 'scenes', 'Main.tscn'), '[gd_scene format=3]\n')
  writeFileSync(join(templateDir, 'scripts', 'main.gd'), 'extends Node2D\n')

  return templateDir
}

describe('scaffold', () => {
  describe('scaffoldProject', () => {
    test('creates project from template', () => {
      createFakeTemplate('basic-2d')
      const projectDir = join(testDir, 'my-game')

      const result = scaffoldProject(projectDir, {
        name: 'My Game',
        template: 'basic-2d',
        templatesDir,
      })

      expect(result).toBe(join(testDir, 'my-game'))
      expect(existsSync(join(projectDir, 'project.godot'))).toBe(true)
      expect(existsSync(join(projectDir, 'scenes', 'Main.tscn'))).toBe(true)
      expect(existsSync(join(projectDir, 'scripts', 'main.gd'))).toBe(true)
    })

    test('customizes project name in project.godot', () => {
      createFakeTemplate('basic-2d')
      const projectDir = join(testDir, 'named-game')

      scaffoldProject(projectDir, {
        name: 'Custom Name',
        template: 'basic-2d',
        templatesDir,
      })

      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('config/name="Custom Name"')
      expect(content).not.toContain('config/name="Template Project"')
    })

    test('customizes viewport width', () => {
      createFakeTemplate('basic-2d')
      const projectDir = join(testDir, 'custom-width')

      scaffoldProject(projectDir, {
        name: 'Test',
        template: 'basic-2d',
        templatesDir,
        viewportWidth: 1920,
      })

      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('viewport_width=1920')
    })

    test('customizes viewport height', () => {
      createFakeTemplate('basic-2d')
      const projectDir = join(testDir, 'custom-height')

      scaffoldProject(projectDir, {
        name: 'Test',
        template: 'basic-2d',
        templatesDir,
        viewportHeight: 1080,
      })

      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('viewport_height=1080')
    })

    test('defaults to basic-2d template', () => {
      createFakeTemplate('basic-2d')
      const projectDir = join(testDir, 'default-template')

      scaffoldProject(projectDir, {
        name: 'Default',
        templatesDir,
      })

      expect(existsSync(join(projectDir, 'project.godot'))).toBe(true)
    })

    test('throws when template does not exist', () => {
      expect(() =>
        scaffoldProject(join(testDir, 'fail'), {
          name: 'Fail',
          template: 'nonexistent',
          templatesDir,
        })
      ).toThrow('Template not found')
    })

    test('skips .godot directory when copying', () => {
      const templateDir = createFakeTemplate('with-cache')
      mkdirSync(join(templateDir, '.godot', 'editor'), { recursive: true })
      writeFileSync(join(templateDir, '.godot', 'editor', 'cache.bin'), 'cache')

      const projectDir = join(testDir, 'no-cache')
      scaffoldProject(projectDir, {
        name: 'No Cache',
        template: 'with-cache',
        templatesDir,
      })

      expect(existsSync(join(projectDir, '.godot'))).toBe(false)
      expect(existsSync(join(projectDir, 'project.godot'))).toBe(true)
    })

    test('copies nested directory structure', () => {
      const templateDir = createFakeTemplate('nested')
      mkdirSync(join(templateDir, 'assets', 'sprites', 'enemies'), { recursive: true })
      writeFileSync(join(templateDir, 'assets', 'sprites', 'enemies', 'slime.png'), 'png-data')

      const projectDir = join(testDir, 'nested-project')
      scaffoldProject(projectDir, {
        name: 'Nested',
        template: 'nested',
        templatesDir,
      })

      expect(existsSync(join(projectDir, 'assets', 'sprites', 'enemies', 'slime.png'))).toBe(true)
    })
  })

  describe('getAvailableTemplates', () => {
    test('returns sorted list of available template directories', () => {
      const templates = getAvailableTemplates()
      expect(Array.isArray(templates)).toBe(true)
      expect(templates).toContain('basic-2d')
    })
  })
})
