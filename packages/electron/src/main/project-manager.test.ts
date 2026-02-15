import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockBase = join(tmpdir(), `pm-test-base-${Date.now()}-${Math.random().toString(36).slice(2)}`)
mkdirSync(join(mockBase, 'projects'), { recursive: true })
mkdirSync(join(mockBase, 'templates', 'basic-2d', 'scenes'), { recursive: true })
mkdirSync(join(mockBase, 'templates', 'basic-2d', 'scripts'), { recursive: true })
mkdirSync(join(mockBase, 'templates', 'basic-2d', 'assets'), { recursive: true })

const basicProjectGodot = `; Engine configuration file.
config_version=5

[application]

config/name="Template Project"
config/features=PackedStringArray("4.4", "Forward Plus")

[display]

window/size/viewport_width=1152
window/size/viewport_height=648
`
writeFileSync(join(mockBase, 'templates', 'basic-2d', 'project.godot'), basicProjectGodot)
writeFileSync(join(mockBase, 'templates', 'basic-2d', 'scenes', 'Main.tscn'), '[gd_scene format=3]\n')
writeFileSync(join(mockBase, 'templates', 'basic-2d', 'scripts', 'main.gd'), 'extends Node2D\n')

mock.module('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mockBase
      return mockBase
    },
    getAppPath: () => mockBase,
  },
}))

const {
  listProjects,
  createProject,
  deleteProject,
  getProjectPath,
  ensureProjectsDir,
} = await import('./project-manager')

const projectsDir = join(mockBase, 'projects')

beforeEach(() => {

  if (existsSync(projectsDir)) {
    rmSync(projectsDir, { recursive: true, force: true })
  }
  mkdirSync(projectsDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(projectsDir)) {
    rmSync(projectsDir, { recursive: true, force: true })
    mkdirSync(projectsDir, { recursive: true })
  }
})

process.on('exit', () => {
  try { rmSync(mockBase, { recursive: true, force: true }) } catch { /* noop */ }
})

describe('project-manager', () => {
  describe('ensureProjectsDir', () => {
    test('creates projects directory if it does not exist', () => {
      rmSync(projectsDir, { recursive: true, force: true })
      expect(existsSync(projectsDir)).toBe(false)

      ensureProjectsDir()

      expect(existsSync(projectsDir)).toBe(true)
    })

    test('does nothing if projects directory already exists', () => {
      expect(existsSync(projectsDir)).toBe(true)

      ensureProjectsDir()

      expect(existsSync(projectsDir)).toBe(true)
    })
  })

  describe('getProjectPath', () => {
    test('returns path within projects directory', () => {
      const result = getProjectPath('my-game')
      expect(result).toBe(join(projectsDir, 'my-game'))
    })

    test('sanitizes name by replacing special characters with underscores', () => {
      const result = getProjectPath('My Game! (v2)')
      expect(result).toBe(join(projectsDir, 'My_Game___v2_'))
    })

    test('preserves alphanumeric, dash, and underscore characters', () => {
      const result = getProjectPath('my-game_v2')
      expect(result).toBe(join(projectsDir, 'my-game_v2'))
    })
  })

  describe('createProject', () => {
    test('creates project with correct name and template', () => {
      const project = createProject('My Game', 'basic-2d')

      expect(project.name).toBe('My Game')
      expect(project.template).toBe('basic-2d')
      expect(project.path).toBe(join(projectsDir, 'My_Game'))
      expect(typeof project.createdAt).toBe('number')
      expect(typeof project.modifiedAt).toBe('number')
    })

    test('creates project directory on filesystem', () => {
      createProject('Test Project', 'basic-2d')

      const projectPath = join(projectsDir, 'Test_Project')
      expect(existsSync(projectPath)).toBe(true)
      expect(existsSync(join(projectPath, 'project.godot'))).toBe(true)
    })

    test('project.godot contains customized project name', () => {
      createProject('Custom Name', 'basic-2d')

      const content = readFileSync(join(projectsDir, 'Custom_Name', 'project.godot'), 'utf-8')
      expect(content).toContain('config/name="Custom Name"')
    })

    test('defaults template to basic-2d', () => {
      const project = createProject('Default Template')

      expect(project.template).toBe('basic-2d')
    })

    test('sanitizes project name for directory', () => {
      const project = createProject('My Game! (v2)', 'basic-2d')

      expect(project.path).toBe(join(projectsDir, 'My_Game___v2_'))
      expect(existsSync(join(projectsDir, 'My_Game___v2_'))).toBe(true)
    })

    test('throws when project directory already exists', () => {
      createProject('Duplicate', 'basic-2d')

      expect(() => createProject('Duplicate', 'basic-2d')).toThrow(
        'Project directory already exists: Duplicate'
      )
    })

    test('returns timestamps from filesystem stats', () => {
      const project = createProject('Timestamped', 'basic-2d')

      const stats = statSync(project.path)
      expect(project.createdAt).toBe(stats.birthtimeMs)
      expect(project.modifiedAt).toBe(stats.mtimeMs)
    })

    test('scaffolds template files into project directory', () => {
      createProject('With Files', 'basic-2d')

      const projectPath = join(projectsDir, 'With_Files')
      expect(existsSync(join(projectPath, 'scenes', 'Main.tscn'))).toBe(true)
      expect(existsSync(join(projectPath, 'scripts', 'main.gd'))).toBe(true)
    })
  })

  describe('listProjects', () => {
    test('returns empty array when no projects exist', () => {
      const projects = listProjects()
      expect(projects).toEqual([])
    })

    test('lists created projects', () => {
      createProject('Game One', 'basic-2d')
      createProject('Game Two', 'basic-2d')

      const projects = listProjects()
      expect(projects.length).toBe(2)

      const names = projects.map((p) => p.name)
      expect(names).toContain('Game One')
      expect(names).toContain('Game Two')
    })

    test('reads project name from project.godot', () => {
      createProject('Named Game', 'basic-2d')

      const projects = listProjects()
      const project = projects.find((p) => p.name === 'Named Game')
      expect(project).toBeDefined()
    })

    test('falls back to directory name when project.godot has no name', () => {
      const dirName = 'manual-project'
      const projectPath = join(projectsDir, dirName)
      mkdirSync(projectPath, { recursive: true })
      writeFileSync(join(projectPath, 'project.godot'), 'config_version=5\n')

      const projects = listProjects()
      const project = projects.find((p) => p.path === projectPath)
      expect(project).toBeDefined()
      expect(project!.name).toBe(dirName)
    })

    test('skips directories without project.godot', () => {
      mkdirSync(join(projectsDir, 'not-a-project'), { recursive: true })

      const projects = listProjects()
      expect(projects.length).toBe(0)
    })

    test('sets template to "unknown"', () => {
      createProject('Template Test', 'basic-2d')

      const projects = listProjects()
      expect(projects[0].template).toBe('unknown')
    })

    test('returns projects sorted by modifiedAt descending', () => {
      createProject('First', 'basic-2d')
      createProject('Second', 'basic-2d')

      const secondPath = join(projectsDir, 'Second', 'project.godot')
      const content = readFileSync(secondPath, 'utf-8')
      writeFileSync(secondPath, content)

      const projects = listProjects()
      expect(projects.length).toBe(2)
      expect(projects[0].modifiedAt).toBeGreaterThanOrEqual(projects[1].modifiedAt)
    })

    test('includes createdAt and modifiedAt timestamps', () => {
      createProject('Timed', 'basic-2d')

      const projects = listProjects()
      expect(typeof projects[0].createdAt).toBe('number')
      expect(typeof projects[0].modifiedAt).toBe('number')
      expect(projects[0].createdAt).toBeGreaterThan(0)
      expect(projects[0].modifiedAt).toBeGreaterThan(0)
    })
  })

  describe('deleteProject', () => {
    test('deletes an existing project and returns true', () => {
      const project = createProject('To Delete', 'basic-2d')

      const result = deleteProject(project.path)

      expect(result).toBe(true)
      expect(existsSync(project.path)).toBe(false)
    })

    test('returns false for non-existent project path', () => {
      const fakePath = join(projectsDir, 'nonexistent')

      const result = deleteProject(fakePath)

      expect(result).toBe(false)
    })

    test('returns false when path is outside projects directory (security check)', () => {
      const outsidePath = '/tmp/some-other-dir'

      const result = deleteProject(outsidePath)

      expect(result).toBe(false)
    })

    test('removes project from listProjects after deletion', () => {
      const project = createProject('Removable', 'basic-2d')
      expect(listProjects().length).toBe(1)

      deleteProject(project.path)

      expect(listProjects().length).toBe(0)
    })

    test('deletes project directory recursively', () => {
      const project = createProject('Deep Project', 'basic-2d')
      expect(existsSync(join(project.path, 'scenes'))).toBe(true)

      deleteProject(project.path)

      expect(existsSync(project.path)).toBe(false)
    })
  })

  describe('integration: create → list → delete lifecycle', () => {
    test('full CRUD lifecycle works end to end', () => {
      const project = createProject('Lifecycle Game', 'basic-2d')
      expect(project.name).toBe('Lifecycle Game')

      let projects = listProjects()
      expect(projects.length).toBe(1)
      expect(projects[0].name).toBe('Lifecycle Game')
      expect(projects[0].path).toBe(project.path)

      const deleted = deleteProject(project.path)
      expect(deleted).toBe(true)

      projects = listProjects()
      expect(projects.length).toBe(0)
    })

    test('multiple projects can coexist and be independently deleted', () => {
      const p1 = createProject('Game A', 'basic-2d')
      const p2 = createProject('Game B', 'basic-2d')
      const p3 = createProject('Game C', 'basic-2d')

      expect(listProjects().length).toBe(3)

      deleteProject(p2.path)

      const remaining = listProjects()
      expect(remaining.length).toBe(2)
      const names = remaining.map((p) => p.name)
      expect(names).toContain('Game A')
      expect(names).toContain('Game C')
      expect(names).not.toContain('Game B')
    })
  })
})
