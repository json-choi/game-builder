import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_test_123', title: 'Game Coder' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: [
      '```gdscript',
      '# filename: scripts/player.gd',
      'extends CharacterBody2D',
      '',
      'var speed: float = 300.0',
      '',
      'func _physics_process(delta: float) -> void:',
      '    move_and_slide()',
      '```',
    ].join('\n'),
    parts: [],
    raw: {},
  })
)

const mockGetDefaultModel = mock(() => ({
  providerID: 'openrouter',
  modelID: 'anthropic/claude-sonnet-4.5',
}))

const mockCheckOnly = mock((_projectPath: string, _scriptPath?: string) =>
  Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
)

mock.module('../opencode/client', () => ({
  createSession: mockCreateSession,
  sendPrompt: mockSendPrompt,
}))

mock.module('../opencode/config', () => ({
  getDefaultModel: mockGetDefaultModel,
}))

mock.module('@game-builder/godot-manager', () => ({
  checkOnly: mockCheckOnly,
}))

const { GameCoderAgent } = await import('./agent')

let projectDir: string

describe('GameCoderAgent', () => {
  beforeEach(() => {
    projectDir = join(tmpdir(), `agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(projectDir, { recursive: true })
    mockCreateSession.mockClear()
    mockSendPrompt.mockClear()
    mockGetDefaultModel.mockClear()
    mockCheckOnly.mockClear()

    mockCreateSession.mockImplementation(() =>
      Promise.resolve({ id: 'ses_test_123', title: 'Game Coder' })
    )
    mockSendPrompt.mockImplementation(() =>
      Promise.resolve({
        text: [
          '```gdscript',
          '# filename: scripts/player.gd',
          'extends CharacterBody2D',
          '',
          'var speed: float = 300.0',
          '',
          'func _physics_process(delta: float) -> void:',
          '    move_and_slide()',
          '```',
        ].join('\n'),
        parts: [],
        raw: {},
      })
    )
    mockCheckOnly.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
    )
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  describe('generate() — success case', () => {
    test('returns success with extracted files on first attempt', async () => {
      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('scripts/player.gd')
      expect(result.files[0].type).toBe('gdscript')
      expect(result.errors).toHaveLength(0)
    })

    test('creates session and sends prompt with correct parameters', async () => {
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Game Coder')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const promptArgs = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(promptArgs.sessionId).toBe('ses_test_123')
      expect(promptArgs.text).toContain('Create a player character')
      expect(promptArgs.model).toEqual({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.5',
      })
    })

    test('writes extracted files to disk', async () => {
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      const filePath = join(projectDir, 'scripts', 'player.gd')
      expect(existsSync(filePath)).toBe(true)

      const content = readFileSync(filePath, 'utf-8')
      expect(content).toContain('extends CharacterBody2D')
      expect(content).toContain('move_and_slide()')
    })

    test('calls validation after writing files', async () => {
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(mockCheckOnly).toHaveBeenCalledTimes(1)
      expect(mockCheckOnly).toHaveBeenCalledWith(projectDir)
    })

    test('uses custom model when provided', async () => {
      const agent = new GameCoderAgent()
      const customModel = { providerID: 'anthropic', modelID: 'claude-opus-4' }
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        model: customModel,
      })

      const promptArgs = mockSendPrompt.mock.calls[0][0] as {
        model: { providerID: string; modelID: string }
      }
      expect(promptArgs.model).toEqual(customModel)
      expect(mockGetDefaultModel).not.toHaveBeenCalled()
    })

    test('emits progress events in correct order', async () => {
      const events: Array<{ type: string }> = []
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        onProgress: (event) => events.push(event),
      })

      expect(events.map((e) => e.type)).toEqual([
        'generating',
        'extracting',
        'writing',
        'validating',
        'complete',
      ])
    })

    test('extracts multiple files from response', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '```',
            '',
            '```ini',
            '# filename: scenes/Player.tscn',
            '[gd_scene format=3]',
            '[node name="Player" type="CharacterBody2D"]',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player with scene',
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(2)
      expect(result.files[0].path).toBe('scripts/player.gd')
      expect(result.files[1].path).toBe('scenes/Player.tscn')
    })
  })

  describe('generate() — failure + retry case', () => {
    test('retries on validation failure and succeeds on second attempt', async () => {
      let callCount = 0
      mockCheckOnly.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            exitCode: 1,
            stdout: '',
            stderr: 'Parse Error: Expected ":" at line 5',
            timedOut: false,
          })
        }
        return Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
      })

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)

      const retryPromptArgs = mockSendPrompt.mock.calls[1][0] as { text: string }
      expect(retryPromptArgs.text).toContain('Validation Errors')
      expect(retryPromptArgs.text).toContain('Parse Error')
    })

    test('emits retrying event between failed and retry attempts', async () => {
      let callCount = 0
      mockCheckOnly.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            exitCode: 1,
            stdout: '',
            stderr: 'Error on line 3',
            timedOut: false,
          })
        }
        return Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', timedOut: false })
      })

      const events: Array<{ type: string }> = []
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        onProgress: (event) => events.push(event),
      })

      const types = events.map((e) => e.type)
      expect(types).toContain('retrying')
      expect(types.indexOf('retrying')).toBeGreaterThan(types.indexOf('validating'))
    })

    test('fails after maxRetries exhausted', async () => {
      mockCheckOnly.mockImplementation(() =>
        Promise.resolve({
          exitCode: 1,
          stdout: '',
          stderr: 'Persistent error',
          timedOut: false,
        })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        maxRetries: 2,
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain('Attempt 1')
      expect(result.errors[1]).toContain('Attempt 2')
      expect(result.files).toHaveLength(1)
    })

    test('emits error event when all retries exhausted', async () => {
      mockCheckOnly.mockImplementation(() =>
        Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Error', timedOut: false })
      )

      const events: Array<{ type: string }> = []
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        maxRetries: 1,
        onProgress: (event) => events.push(event),
      })

      const lastEvent = events[events.length - 1]
      expect(lastEvent.type).toBe('error')
    })

    test('retries with no response from AI', async () => {
      let callCount = 0
      mockSendPrompt.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ text: null, parts: [], raw: {} })
        }
        return Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends Node2D',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      })

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('No response from AI')
    })

    test('includes validation stderr in error messages', async () => {
      mockCheckOnly.mockImplementation(() =>
        Promise.resolve({
          exitCode: 1,
          stdout: 'stdout info',
          stderr: 'Specific GDScript error: invalid syntax at line 10',
          timedOut: false,
        })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a game',
        projectPath: projectDir,
        maxRetries: 1,
      })

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('Specific GDScript error')
    })

    test('falls back to stdout when stderr is empty', async () => {
      mockCheckOnly.mockImplementation(() =>
        Promise.resolve({
          exitCode: 1,
          stdout: 'Validation output message',
          stderr: '',
          timedOut: false,
        })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a game',
        projectPath: projectDir,
        maxRetries: 1,
      })

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('Validation output message')
    })
  })

  describe('generate() — file extraction failure case', () => {
    test('retries when no files extracted from response', async () => {
      let callCount = 0
      mockSendPrompt.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            text: 'Here is a plain text explanation with no code blocks at all.',
            parts: [],
            raw: {},
          })
        }
        return Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends Node2D',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      })

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('No files extracted')
    })

    test('sends corrective prompt when extraction fails', async () => {
      let callCount = 0
      mockSendPrompt.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            text: 'I would suggest using a CharacterBody2D node.',
            parts: [],
            raw: {},
          })
        }
        return Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      })

      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
      })

      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
      const retryPromptArgs = mockSendPrompt.mock.calls[1][0] as { text: string }
      expect(retryPromptArgs.text).toContain('did not contain any valid Godot files')
      expect(retryPromptArgs.text).toContain('Create a player character')
    })

    test('fails when extraction fails on all attempts', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'Just a text response with no code.',
          parts: [],
          raw: {},
        })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        maxRetries: 2,
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2)
      expect(result.files).toHaveLength(0)
      expect(result.errors).toHaveLength(2)
      expect(result.errors.every((e) => e.includes('No files extracted'))).toBe(true)
    })

    test('does not call validation when no files extracted', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'No code here.',
          parts: [],
          raw: {},
        })
      )

      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        maxRetries: 1,
      })

      expect(mockCheckOnly).not.toHaveBeenCalled()
    })

    test('does not call write when no files extracted', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'No code here.',
          parts: [],
          raw: {},
        })
      )

      const events: Array<{ type: string }> = []
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player character',
        projectPath: projectDir,
        maxRetries: 1,
        onProgress: (event) => events.push(event),
      })

      const types = events.map((e) => e.type)
      expect(types).not.toContain('writing')
      expect(types).not.toContain('validating')
    })
  })

  describe('generate() — defaults', () => {
    test('defaults to 3 maxRetries', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new GameCoderAgent()
      const result = await agent.generate({
        prompt: 'Create a player',
        projectPath: projectDir,
      })

      expect(result.attempts).toBe(3)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)
    })

    test('uses getDefaultModel when no model provided', async () => {
      const agent = new GameCoderAgent()
      await agent.generate({
        prompt: 'Create a player',
        projectPath: projectDir,
      })

      expect(mockGetDefaultModel).toHaveBeenCalledTimes(1)
    })
  })
})
