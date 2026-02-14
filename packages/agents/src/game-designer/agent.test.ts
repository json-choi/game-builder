import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_designer_123', title: 'Game Designer' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: '# Game Design Document\n\n## Game Overview\nTitle: Space Invaders Clone\n\n## Scene Structure\n- Main.tscn\n- Player.tscn',
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

const { GameDesignerAgent } = await import('./agent')

describe('GameDesignerAgent', () => {
  afterEach(() => {
    mockCreateSession.mockClear()
    mockSendPrompt.mockClear()
    mockGetDefaultModel.mockClear()

    mockCreateSession.mockImplementation(() =>
      Promise.resolve({ id: 'ses_designer_123', title: 'Game Designer' })
    )
    mockSendPrompt.mockImplementation(() =>
      Promise.resolve({
        text: '# Game Design Document\n\n## Game Overview\nTitle: Space Invaders Clone',
        parts: [],
        raw: {},
      })
    )
    mockGetDefaultModel.mockImplementation(() => ({
      providerID: 'openrouter',
      modelID: 'anthropic/claude-sonnet-4.5',
    }))
  })

  describe('design() - success cases', () => {
    test('returns success with design text', async () => {
      const agent = new GameDesignerAgent()
      const result = await agent.design('Create a space shooter game', '/tmp/test-project')

      expect(result.success).toBe(true)
      expect(result.design).toContain('Game Design Document')
      expect(result.design).toContain('Space Invaders Clone')
    })

    test('creates a session on first call', async () => {
      const agent = new GameDesignerAgent()
      await agent.design('Create a platformer', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Game Designer')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new GameDesignerAgent()
      await agent.design('Create a platformer', '/tmp/test-project')
      await agent.design('Add enemies to the game', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt, project path, and user request', async () => {
      const agent = new GameDesignerAgent()
      await agent.design('Create a puzzle game', '/tmp/my-project')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_designer_123')
      expect(args.text).toContain('You are the Game Designer Agent')
      expect(args.text).toContain('Project path: /tmp/my-project')
      expect(args.text).toContain('User Request: Create a puzzle game')
    })

    test('uses default model from config', async () => {
      const agent = new GameDesignerAgent()
      await agent.design('Create a game', '/tmp/test-project')

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
      const agent = new GameDesignerAgent()
      await agent.design('Create a game', '/tmp/test-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const sysPromptEnd = text.indexOf('---')
      expect(sysPromptEnd).toBeGreaterThan(0)

      const afterSeparator = text.slice(sysPromptEnd + 3)
      expect(afterSeparator).toContain('Project path:')
      expect(afterSeparator).toContain('User Request:')
    })
  })

  describe('design() - failure cases', () => {
    test('returns empty design when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new GameDesignerAgent()
      const result = await agent.design('Create a game', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.design).toBe('')
    })

    test('returns empty design when response text is empty string', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new GameDesignerAgent()
      const result = await agent.design('Create a game', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.design).toBe('')
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new GameDesignerAgent()
      await expect(
        agent.design('Create a game', '/tmp/test-project')
      ).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new GameDesignerAgent()
      await expect(
        agent.design('Create a game', '/tmp/test-project')
      ).rejects.toThrow('API timeout')
    })
  })

  describe('design() - session management', () => {
    test('creates new session after fresh instantiation', async () => {
      const agent1 = new GameDesignerAgent()
      await agent1.design('Game 1', '/tmp/p1')

      const agent2 = new GameDesignerAgent()
      await agent2.design('Game 2', '/tmp/p2')

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again if first design call set it', async () => {
      const agent = new GameDesignerAgent()

      await agent.design('First request', '/tmp/project')
      await agent.design('Second request', '/tmp/project')
      await agent.design('Third request', '/tmp/project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_designer_123')
      }
    })
  })

  describe('design() - DesignResult interface', () => {
    test('result has correct shape with design and success fields', async () => {
      const agent = new GameDesignerAgent()
      const result = await agent.design('Create a game', '/tmp/test')

      expect(result).toHaveProperty('design')
      expect(result).toHaveProperty('success')
      expect(typeof result.design).toBe('string')
      expect(typeof result.success).toBe('boolean')
    })

    test('success is true when response has text content', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: 'Any non-empty response', parts: [], raw: {} })
      )

      const agent = new GameDesignerAgent()
      const result = await agent.design('Create a game', '/tmp/test')

      expect(result.success).toBe(true)
      expect(result.design).toBe('Any non-empty response')
    })
  })
})
