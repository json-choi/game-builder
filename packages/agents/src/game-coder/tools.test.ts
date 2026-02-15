import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockCheckOnly = mock((_projectPath: string, _scriptPath?: string) =>
  Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
)

const realGodotManager = await import(join(import.meta.dir, '..', '..', '..', 'godot-manager', 'src', 'index.ts'))
mock.module('@game-builder/godot-manager', () => ({
  ...realGodotManager,
  checkOnly: mockCheckOnly,
}))

const { createProjectTools } = await import('./tools')

let projectDir: string

describe('game-coder tools', () => {
  beforeEach(() => {
    projectDir = join(tmpdir(), `tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    mockCheckOnly.mockClear()
    mockCheckOnly.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
    )
  })

  test('createProjectTools returns 5 tools', () => {
    const tools = createProjectTools(projectDir)
    expect(tools).toHaveLength(5)

    const names = tools.map((t) => t.name)
    expect(names).toContain('write_file')
    expect(names).toContain('read_file')
    expect(names).toContain('list_files')
    expect(names).toContain('validate_project')
    expect(names).toContain('validate_script')
  })

  test('each tool has name, description, and execute', () => {
    const tools = createProjectTools(projectDir)
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(typeof tool.execute).toBe('function')
    }
  })

  describe('write_file', () => {
    test('writes content to a file', async () => {
      const tools = createProjectTools(projectDir)
      const writeTool = tools.find((t) => t.name === 'write_file')!

      const result = await writeTool.execute({ path: 'test.gd', content: 'extends Node' })
      expect(result).toEqual({ success: true, path: 'test.gd' })

      const content = readFileSync(join(projectDir, 'test.gd'), 'utf-8')
      expect(content).toBe('extends Node')
    })

    test('creates parent directories', async () => {
      const tools = createProjectTools(projectDir)
      const writeTool = tools.find((t) => t.name === 'write_file')!

      await writeTool.execute({ path: 'scenes/main/player.gd', content: 'extends CharacterBody2D' })
      expect(existsSync(join(projectDir, 'scenes', 'main', 'player.gd'))).toBe(true)
    })

    test('throws when path is missing', async () => {
      const tools = createProjectTools(projectDir)
      const writeTool = tools.find((t) => t.name === 'write_file')!

      await expect(writeTool.execute({ content: 'data' })).rejects.toThrow('requires "path"')
    })

    test('throws when content is missing', async () => {
      const tools = createProjectTools(projectDir)
      const writeTool = tools.find((t) => t.name === 'write_file')!

      await expect(writeTool.execute({ path: 'test.gd' })).rejects.toThrow('requires')
    })
  })

  describe('read_file', () => {
    test('reads existing file content', async () => {
      writeFileSync(join(projectDir, 'hello.gd'), 'extends Sprite2D')

      const tools = createProjectTools(projectDir)
      const readTool = tools.find((t) => t.name === 'read_file')!

      const result = (await readTool.execute({ path: 'hello.gd' })) as { success: boolean; content: string }
      expect(result.success).toBe(true)
      expect(result.content).toBe('extends Sprite2D')
    })

    test('returns error for non-existent file', async () => {
      const tools = createProjectTools(projectDir)
      const readTool = tools.find((t) => t.name === 'read_file')!

      const result = (await readTool.execute({ path: 'missing.gd' })) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    test('throws when path is missing', async () => {
      const tools = createProjectTools(projectDir)
      const readTool = tools.find((t) => t.name === 'read_file')!

      await expect(readTool.execute({})).rejects.toThrow('requires "path"')
    })
  })

  describe('list_files', () => {
    test('lists files recursively', async () => {
      mkdirSync(join(projectDir, 'scenes'), { recursive: true })
      writeFileSync(join(projectDir, 'project.godot'), '')
      writeFileSync(join(projectDir, 'scenes', 'main.tscn'), '')

      const tools = createProjectTools(projectDir)
      const listTool = tools.find((t) => t.name === 'list_files')!

      const result = (await listTool.execute({})) as { success: boolean; files: string[] }
      expect(result.success).toBe(true)
      expect(result.files).toContain('project.godot')
      expect(result.files).toContain('scenes/main.tscn')
    })

    test('excludes .godot, .import, and node_modules directories', async () => {
      mkdirSync(join(projectDir, '.godot'), { recursive: true })
      mkdirSync(join(projectDir, '.import'), { recursive: true })
      mkdirSync(join(projectDir, 'node_modules'), { recursive: true })
      writeFileSync(join(projectDir, '.godot', 'cache'), '')
      writeFileSync(join(projectDir, '.import', 'data'), '')
      writeFileSync(join(projectDir, 'node_modules', 'pkg'), '')
      writeFileSync(join(projectDir, 'main.gd'), '')

      const tools = createProjectTools(projectDir)
      const listTool = tools.find((t) => t.name === 'list_files')!

      const result = (await listTool.execute({})) as { success: boolean; files: string[] }
      expect(result.files).toContain('main.gd')
      expect(result.files.every((f: string) => !f.includes('.godot'))).toBe(true)
      expect(result.files.every((f: string) => !f.includes('.import'))).toBe(true)
      expect(result.files.every((f: string) => !f.includes('node_modules'))).toBe(true)
    })

    test('returns empty array for empty directory', async () => {
      const tools = createProjectTools(projectDir)
      const listTool = tools.find((t) => t.name === 'list_files')!

      const result = (await listTool.execute({})) as { success: boolean; files: string[] }
      expect(result.success).toBe(true)
      expect(result.files).toEqual([])
    })
  })

  describe('validate_project', () => {
    test('delegates to checkOnly with project path', async () => {
      const tools = createProjectTools(projectDir)
      const validateTool = tools.find((t) => t.name === 'validate_project')!

      const result = await validateTool.execute({})
      expect(result).toEqual({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
      expect(mockCheckOnly).toHaveBeenCalledWith(projectDir)
    })

    test('returns non-zero exit code on validation failure', async () => {
      mockCheckOnly.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Error on line 5', timedOut: false })
      )

      const tools = createProjectTools(projectDir)
      const validateTool = tools.find((t) => t.name === 'validate_project')!

      const result = (await validateTool.execute({})) as { exitCode: number; stderr: string }
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Error on line 5')
    })
  })

  describe('validate_script', () => {
    test('delegates to checkOnly with project and script path', async () => {
      const tools = createProjectTools(projectDir)
      const validateTool = tools.find((t) => t.name === 'validate_script')!

      await validateTool.execute({ path: 'player.gd' })
      expect(mockCheckOnly).toHaveBeenCalledWith(projectDir, 'player.gd')
    })

    test('throws when path is missing', async () => {
      const tools = createProjectTools(projectDir)
      const validateTool = tools.find((t) => t.name === 'validate_script')!

      await expect(validateTool.execute({})).rejects.toThrow('requires "path"')
    })
  })
})
