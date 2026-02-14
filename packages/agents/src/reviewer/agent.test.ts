import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_reviewer_123', title: 'Reviewer' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: '### Summary\nPASS\n\n### Issues Found\nNone.\n\n### Recommendations\n- Consider adding more type annotations.',
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

const { ReviewerAgent } = await import('./agent')

function resetMocks() {
  mockCreateSession.mockClear()
  mockSendPrompt.mockClear()
  mockGetDefaultModel.mockClear()

  mockCreateSession.mockImplementation(() =>
    Promise.resolve({ id: 'ses_reviewer_123', title: 'Reviewer' })
  )
  mockSendPrompt.mockImplementation(() =>
    Promise.resolve({
      text: '### Summary\nPASS\n\n### Issues Found\nNone.\n\n### Recommendations\n- Consider adding more type annotations.',
      parts: [],
      raw: {},
    })
  )
  mockGetDefaultModel.mockImplementation(() => ({
    providerID: 'openrouter',
    modelID: 'anthropic/claude-sonnet-4.5',
  }))
}

describe('ReviewerAgent', () => {
  afterEach(() => {
    resetMocks()
  })

  describe('review() — success cases', () => {
    test('returns PASS summary when response contains PASS', async () => {
      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('PASS')
      expect(result.success).toBe(true)
      expect(result.review).toContain('PASS')
    })

    test('returns PASS_WITH_NOTES when response contains PASS_WITH_NOTES', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: '### Summary\nPASS_WITH_NOTES\n\n### Issues Found\n- **File**: scripts/player.gd\n- **Severity**: suggestion\n- **Issue**: Missing type annotation',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('PASS_WITH_NOTES')
      expect(result.success).toBe(true)
      expect(result.review).toContain('PASS_WITH_NOTES')
    })

    test('returns NEEDS_FIXES when response contains NEEDS_FIXES', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: '### Summary\nNEEDS_FIXES\n\n### Issues Found\n- **File**: scripts/player.gd\n- **Severity**: critical\n- **Issue**: Using yield instead of await',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('NEEDS_FIXES')
      expect(result.success).toBe(false)
    })

    test('creates a session on first call', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Reviewer')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/test-project')
      await agent.review('/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt and project path', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/my-project')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_reviewer_123')
      expect(args.text).toContain('You are the Reviewer Agent')
      expect(args.text).toContain('Project path: /tmp/my-project')
      expect(args.text).toContain(
        'Review all generated files in the project for quality and best practices.'
      )
    })

    test('includes additional context when provided', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/my-project', 'Focus on player movement code')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('Additional context:')
      expect(args.text).toContain('Focus on player movement code')
    })

    test('does not include context section when context is omitted', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/my-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).not.toContain('Additional context:')
    })

    test('uses default model from config', async () => {
      const agent = new ReviewerAgent()
      await agent.review('/tmp/test-project')

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
      const agent = new ReviewerAgent()
      await agent.review('/tmp/test-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const separatorIdx = text.indexOf('---')
      expect(separatorIdx).toBeGreaterThan(0)

      const afterSeparator = text.slice(separatorIdx + 3)
      expect(afterSeparator).toContain('Project path:')
    })

    test('review field contains full response text', async () => {
      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.review).toContain('### Summary')
      expect(result.review).toContain('### Issues Found')
      expect(result.review).toContain('### Recommendations')
    })
  })

  describe('review() — summary parsing priority', () => {
    test('PASS_WITH_NOTES takes priority over PASS when both present', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'Summary: PASS_WITH_NOTES\nThe code is good overall. PASS',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('PASS_WITH_NOTES')
      expect(result.success).toBe(true)
    })

    test('PASS_WITH_NOTES takes priority over NEEDS_FIXES when both present', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'PASS_WITH_NOTES but almost NEEDS_FIXES',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('PASS_WITH_NOTES')
    })

    test('returns UNKNOWN when no recognized summary keyword found', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'The code looks fine. No major issues detected.',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('UNKNOWN')
      expect(result.success).toBe(true)
    })
  })

  describe('review() — success field logic', () => {
    test('success is true for PASS', async () => {
      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('PASS')
      expect(result.success).toBe(true)
    })

    test('success is true for PASS_WITH_NOTES', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'PASS_WITH_NOTES',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.success).toBe(true)
    })

    test('success is false only for NEEDS_FIXES', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'NEEDS_FIXES',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.success).toBe(false)
    })

    test('success is true for UNKNOWN', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'No keywords here at all',
          parts: [],
          raw: {},
        })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('UNKNOWN')
      expect(result.success).toBe(true)
    })
  })

  describe('review() — failure cases', () => {
    test('returns UNKNOWN summary when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('UNKNOWN')
      expect(result.review).toBe('')
      expect(result.success).toBe(true)
    })

    test('returns UNKNOWN summary when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test-project')

      expect(result.summary).toBe('UNKNOWN')
      expect(result.review).toBe('')
      expect(result.success).toBe(true)
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new ReviewerAgent()
      await expect(
        agent.review('/tmp/test-project')
      ).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new ReviewerAgent()
      await expect(
        agent.review('/tmp/test-project')
      ).rejects.toThrow('API timeout')
    })
  })

  describe('review() — session management', () => {
    test('creates new session for each agent instance', async () => {
      const agent1 = new ReviewerAgent()
      await agent1.review('/tmp/p1')

      const agent2 = new ReviewerAgent()
      await agent2.review('/tmp/p2')

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again after first call', async () => {
      const agent = new ReviewerAgent()

      await agent.review('/tmp/project')
      await agent.review('/tmp/project')
      await agent.review('/tmp/project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_reviewer_123')
      }
    })
  })

  describe('review() — ReviewResult interface', () => {
    test('result has correct shape with summary, review, and success fields', async () => {
      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test')

      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('review')
      expect(result).toHaveProperty('success')
      expect(typeof result.summary).toBe('string')
      expect(typeof result.review).toBe('string')
      expect(typeof result.success).toBe('boolean')
    })

    test('summary is one of the valid enum values', async () => {
      const validSummaries = ['PASS', 'PASS_WITH_NOTES', 'NEEDS_FIXES', 'UNKNOWN']

      const agent = new ReviewerAgent()
      const result = await agent.review('/tmp/test')

      expect(validSummaries).toContain(result.summary)
    })
  })
})
