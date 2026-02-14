import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  isGodotProject,
  parseProjectGodot,
  createProject,
  validateProjectStructure,
} from './project'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `godot-project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
})

const VALID_PROJECT_GODOT = `; Engine configuration file.
config_version=5

[application]

config/name="Test Game"
run/main_scene="res://scenes/Main.tscn"
config/features=PackedStringArray("4.4", "Forward Plus")

[display]

window/size/viewport_width=1152
window/size/viewport_height=648
`

describe('project', () => {
  describe('isGodotProject', () => {
    test('returns true when project.godot exists', () => {
      writeFileSync(join(testDir, 'project.godot'), VALID_PROJECT_GODOT)
      expect(isGodotProject(testDir)).toBe(true)
    })

    test('returns false when project.godot does not exist', () => {
      expect(isGodotProject(testDir)).toBe(false)
    })

    test('returns false for non-existent directory', () => {
      expect(isGodotProject(join(testDir, 'nonexistent'))).toBe(false)
    })
  })

  describe('parseProjectGodot', () => {
    test('returns null when project.godot does not exist', () => {
      expect(parseProjectGodot(testDir)).toBeNull()
    })

    test('parses a valid project.godot file', () => {
      writeFileSync(join(testDir, 'project.godot'), VALID_PROJECT_GODOT)

      const project = parseProjectGodot(testDir)
      expect(project).not.toBeNull()
      expect(project!.name).toBe('Test Game')
      expect(project!.configVersion).toBe(5)
      expect(project!.mainScene).toBe('res://scenes/Main.tscn')
      expect(project!.features).toEqual(['4.4', 'Forward Plus'])
      expect(project!.valid).toBe(true)
    })

    test('returns valid=false for non-5 config version', () => {
      const content = VALID_PROJECT_GODOT.replace('config_version=5', 'config_version=4')
      writeFileSync(join(testDir, 'project.godot'), content)

      const project = parseProjectGodot(testDir)
      expect(project!.configVersion).toBe(4)
      expect(project!.valid).toBe(false)
    })

    test('handles project.godot without main_scene', () => {
      const content = `config_version=5\n\n[application]\n\nconfig/name="No Scene"\n`
      writeFileSync(join(testDir, 'project.godot'), content)

      const project = parseProjectGodot(testDir)
      expect(project!.mainScene).toBeNull()
    })

    test('handles project.godot without features', () => {
      const content = `config_version=5\n\n[application]\n\nconfig/name="No Features"\n`
      writeFileSync(join(testDir, 'project.godot'), content)

      const project = parseProjectGodot(testDir)
      expect(project!.features).toEqual([])
    })

    test('defaults name to "Unknown" when not present', () => {
      const content = `config_version=5\n`
      writeFileSync(join(testDir, 'project.godot'), content)

      const project = parseProjectGodot(testDir)
      expect(project!.name).toBe('Unknown')
    })

    test('resolves path to absolute', () => {
      writeFileSync(join(testDir, 'project.godot'), VALID_PROJECT_GODOT)
      const project = parseProjectGodot(testDir)
      expect(project!.path).toBe(testDir)
    })
  })

  describe('createProject', () => {
    test('creates project directory with subdirectories', () => {
      const projectDir = join(testDir, 'new-game')
      createProject(projectDir, { name: 'My Game' })

      expect(existsSync(join(projectDir, 'scenes'))).toBe(true)
      expect(existsSync(join(projectDir, 'scripts'))).toBe(true)
      expect(existsSync(join(projectDir, 'assets'))).toBe(true)
    })

    test('creates project.godot file', () => {
      const projectDir = join(testDir, 'new-game')
      createProject(projectDir, { name: 'My Game' })

      const projectGodot = join(projectDir, 'project.godot')
      expect(existsSync(projectGodot)).toBe(true)

      const content = readFileSync(projectGodot, 'utf-8')
      expect(content).toContain('config/name="My Game"')
      expect(content).toContain('config_version=5')
    })

    test('returns correct GodotProject structure', () => {
      const projectDir = join(testDir, 'new-game')
      const project = createProject(projectDir, { name: 'My Game' })

      expect(project.name).toBe('My Game')
      expect(project.configVersion).toBe(5)
      expect(project.valid).toBe(true)
      expect(project.features).toEqual(['4.4', 'Forward Plus'])
    })

    test('uses custom features', () => {
      const projectDir = join(testDir, 'custom')
      const project = createProject(projectDir, {
        name: 'Custom',
        features: ['4.6', 'Mobile'],
      })

      expect(project.features).toEqual(['4.6', 'Mobile'])
      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('4.6')
      expect(content).toContain('Mobile')
    })

    test('uses custom viewport dimensions', () => {
      const projectDir = join(testDir, 'custom-viewport')
      createProject(projectDir, {
        name: 'Custom VP',
        viewportWidth: 1920,
        viewportHeight: 1080,
      })

      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('viewport_width=1920')
      expect(content).toContain('viewport_height=1080')
    })

    test('uses default viewport 1152x648', () => {
      const projectDir = join(testDir, 'default-vp')
      createProject(projectDir, { name: 'Default VP' })

      const content = readFileSync(join(projectDir, 'project.godot'), 'utf-8')
      expect(content).toContain('viewport_width=1152')
      expect(content).toContain('viewport_height=648')
    })

    test('handles mainScene option', () => {
      const projectDir = join(testDir, 'with-scene')
      const project = createProject(projectDir, {
        name: 'With Scene',
        mainScene: 'res://scenes/Game.tscn',
      })

      expect(project.mainScene).toBe('res://scenes/Game.tscn')
    })

    test('creates project in existing directory', () => {
      const projectDir = join(testDir, 'existing')
      mkdirSync(projectDir)
      writeFileSync(join(projectDir, 'readme.txt'), 'hello')

      createProject(projectDir, { name: 'Existing Dir' })

      expect(existsSync(join(projectDir, 'project.godot'))).toBe(true)
      expect(existsSync(join(projectDir, 'readme.txt'))).toBe(true)
    })
  })

  describe('validateProjectStructure', () => {
    test('returns valid for correct project', () => {
      writeFileSync(join(testDir, 'project.godot'), VALID_PROJECT_GODOT)
      const result = validateProjectStructure(testDir)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('returns invalid for non-existent directory', () => {
      const result = validateProjectStructure(join(testDir, 'nonexistent'))
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('does not exist')
    })

    test('returns error for missing project.godot', () => {
      const result = validateProjectStructure(testDir)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing project.godot')
    })

    test('returns error for wrong config version', () => {
      const content = VALID_PROJECT_GODOT.replace('config_version=5', 'config_version=4')
      writeFileSync(join(testDir, 'project.godot'), content)

      const result = validateProjectStructure(testDir)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Unsupported config_version'))).toBe(true)
    })
  })
})
