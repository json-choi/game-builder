import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_debug_123', title: 'Debugger' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: [
      '```gdscript',
      '# filename: scripts/player.gd',
      'extends CharacterBody2D',
      '',
      '@export var speed: float = 300.0',
      '',
      'func _physics_process(delta: float) -> void:',
      '    velocity = Vector2.ZERO',
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

mock.module('../opencode/client', () => ({
  createSession: mockCreateSession,
  sendPrompt: mockSendPrompt,
  setDirectory: () => {},
  getDirectory: () => '',
  getClient: () => ({}),
  resetClient: () => {},
  listSessions: async () => [],
  deleteSession: async () => {},
  sendPromptAsync: async () => {},
  listAgents: async () => [],
  respondToPermission: async () => {},
  replyToQuestion: async () => {},
  rejectQuestion: async () => {},
  subscribeEvents: async () => ({ error: null }),
}))

mock.module('../opencode/config', () => ({
  OPENCODE_PORT: 4096,
  OPENCODE_BASE_URL: 'http://localhost:4096',
  OPENCODE_HEALTH_URL: 'http://localhost:4096/global/health',
  OPENCODE_CONFIG_DIR: '/tmp/mock-opencode-config',
  OPENCODE_CONFIG_PATH: '/tmp/mock-opencode-config/opencode.json',
  ensureConfig: () => ({ $schema: 'https://opencode.ai/config.json', provider: {} }),
  readConfig: () => null,
  getDefaultModel: mockGetDefaultModel,
}))

const { DebuggerAgent } = await import('./agent')

function resetMocks() {
  mockCreateSession.mockClear()
  mockSendPrompt.mockClear()
  mockGetDefaultModel.mockClear()

  mockCreateSession.mockImplementation(() =>
    Promise.resolve({ id: 'ses_debug_123', title: 'Debugger' })
  )
  mockSendPrompt.mockImplementation(() =>
    Promise.resolve({
      text: [
        '```gdscript',
        '# filename: scripts/player.gd',
        'extends CharacterBody2D',
        '',
        '@export var speed: float = 300.0',
        '',
        'func _physics_process(delta: float) -> void:',
        '    velocity = Vector2.ZERO',
        '    move_and_slide()',
        '```',
      ].join('\n'),
      parts: [],
      raw: {},
    })
  )
  mockGetDefaultModel.mockImplementation(() => ({
    providerID: 'openrouter',
    modelID: 'anthropic/claude-sonnet-4.5',
  }))
}

describe('DebuggerAgent', () => {
  afterEach(() => {
    resetMocks()
  })

  describe('debug() — success cases', () => {
    test('returns success with extracted fixes', async () => {
      const agent = new DebuggerAgent()
      const result = await agent.debug(
        '[ERROR] scripts/player.gd:5 — Parse Error: Expected ":"',
        '/tmp/test-project'
      )

      expect(result.success).toBe(true)
      expect(result.fixes).toHaveLength(1)
      expect(result.fixes[0].path).toBe('scripts/player.gd')
      expect(result.fixes[0].type).toBe('gdscript')
      expect(result.fixes[0].content).toContain('extends CharacterBody2D')
    })

    test('creates a session on first call', async () => {
      const agent = new DebuggerAgent()
      await agent.debug('Some error', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Debugger')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new DebuggerAgent()
      await agent.debug('Error 1', '/tmp/test-project')
      await agent.debug('Error 2', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt, project path, and errors', async () => {
      const agent = new DebuggerAgent()
      const errors = '[ERROR] scripts/player.gd:15 — Parse Error: Expected "end of file"'
      await agent.debug(errors, '/tmp/my-project')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_debug_123')
      expect(args.text).toContain('You are the Debugger Agent')
      expect(args.text).toContain('Project path: /tmp/my-project')
      expect(args.text).toContain('Godot validation errors:')
      expect(args.text).toContain(errors)
    })

    test('uses default model from config', async () => {
      const agent = new DebuggerAgent()
      await agent.debug('Some error', '/tmp/test-project')

      expect(mockGetDefaultModel).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        model: { providerID: string; modelID: string }
      }
      expect(args.model).toEqual({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.5',
      })
    })

    test('prompt sections are separated by ---', async () => {
      const agent = new DebuggerAgent()
      await agent.debug('Some error', '/tmp/test-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const separatorIdx = text.indexOf('---')
      expect(separatorIdx).toBeGreaterThan(0)

      const afterSeparator = text.slice(separatorIdx + 3)
      expect(afterSeparator).toContain('Project path:')
      expect(afterSeparator).toContain('Godot validation errors:')
    })

    test('prompt contains instruction to fix all errors', async () => {
      const agent = new DebuggerAgent()
      await agent.debug('Some error', '/tmp/test-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('Fix ALL errors')
    })

    test('raw field contains full response text', async () => {
      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test-project')

      expect(result.raw).toContain('extends CharacterBody2D')
      expect(result.raw).toContain('scripts/player.gd')
    })

    test('extracts multiple fixed files from response', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '',
            'func _ready():',
            '    pass',
            '```',
            '',
            '```gdscript',
            '# filename: scripts/enemy.gd',
            'extends Area2D',
            '',
            'func _ready():',
            '    pass',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug(
        '[ERROR] scripts/player.gd:5\n[ERROR] scripts/enemy.gd:10',
        '/tmp/test-project'
      )

      expect(result.success).toBe(true)
      expect(result.fixes).toHaveLength(2)
      expect(result.fixes[0].path).toBe('scripts/player.gd')
      expect(result.fixes[1].path).toBe('scripts/enemy.gd')
    })

    test('extracts mixed file types (scripts and scenes)', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '```',
            '',
            '```tscn',
            '# filename: scenes/Main.tscn',
            '[gd_scene load_steps=2 format=3]',
            '[node name="Main" type="Node2D"]',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug(
        '[ERROR] scripts/player.gd:5\n[ERROR] scenes/Main.tscn — Invalid resource',
        '/tmp/test-project'
      )

      expect(result.success).toBe(true)
      expect(result.fixes).toHaveLength(2)
      expect(result.fixes[0].path).toBe('scripts/player.gd')
      expect(result.fixes[0].type).toBe('gdscript')
      expect(result.fixes[1].path).toBe('scenes/Main.tscn')
      expect(result.fixes[1].type).toBe('tscn')
    })
  })

  describe('debug() — failure cases', () => {
    test('returns failure when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.fixes).toHaveLength(0)
      expect(result.raw).toBe('')
    })

    test('returns failure when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.fixes).toHaveLength(0)
      expect(result.raw).toBe('')
    })

    test('returns failure when response has no extractable files', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'I analyzed the errors but cannot determine a fix. The error seems to be caused by a missing dependency.',
          parts: [],
          raw: {},
        })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.fixes).toHaveLength(0)
      expect(result.raw).toContain('cannot determine a fix')
    })

    test('returns failure when response contains non-Godot code blocks', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```javascript',
            'console.log("not godot")',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.fixes).toHaveLength(0)
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new DebuggerAgent()
      await expect(
        agent.debug('Some error', '/tmp/test-project')
      ).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new DebuggerAgent()
      await expect(
        agent.debug('Some error', '/tmp/test-project')
      ).rejects.toThrow('API timeout')
    })
  })

  describe('debug() — session management', () => {
    test('creates new session for each agent instance', async () => {
      const agent1 = new DebuggerAgent()
      await agent1.debug('Error 1', '/tmp/p1')

      const agent2 = new DebuggerAgent()
      await agent2.debug('Error 2', '/tmp/p2')

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again after first call', async () => {
      const agent = new DebuggerAgent()

      await agent.debug('First error', '/tmp/project')
      await agent.debug('Second error', '/tmp/project')
      await agent.debug('Third error', '/tmp/project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_debug_123')
      }
    })
  })

  describe('debug() — DebugResult interface', () => {
    test('result has correct shape with success, fixes, and raw fields', async () => {
      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test')

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('fixes')
      expect(result).toHaveProperty('raw')
      expect(typeof result.success).toBe('boolean')
      expect(Array.isArray(result.fixes)).toBe(true)
      expect(typeof result.raw).toBe('string')
    })

    test('each fix has path, content, and type fields', async () => {
      const agent = new DebuggerAgent()
      const result = await agent.debug('Some error', '/tmp/test')

      for (const fix of result.fixes) {
        expect(fix).toHaveProperty('path')
        expect(fix).toHaveProperty('content')
        expect(fix).toHaveProperty('type')
        expect(typeof fix.path).toBe('string')
        expect(typeof fix.content).toBe('string')
        expect(typeof fix.type).toBe('string')
      }
    })

    test('success is true only when fixes array is non-empty', async () => {
      const agent = new DebuggerAgent()

      const successResult = await agent.debug('Some error', '/tmp/test')
      expect(successResult.success).toBe(true)
      expect(successResult.fixes.length).toBeGreaterThan(0)

      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: 'No code here', parts: [], raw: {} })
      )
      const agent2 = new DebuggerAgent()
      const failResult = await agent2.debug('Some error', '/tmp/test')
      expect(failResult.success).toBe(false)
      expect(failResult.fixes).toHaveLength(0)
    })
  })
})
