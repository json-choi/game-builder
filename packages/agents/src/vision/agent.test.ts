import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_vision_123', title: 'Vision' })
)

const SAMPLE_RESPONSE = `### Overview
A 2D platformer game screenshot showing a player character on a grassy platform with a sky background.

### Findings
- **Category**: screenshot-bug
- **Severity**: warning
- **Location**: bottom-right corner
- **Issue**: Player sprite clips through platform edge
- **Recommendation**: Adjust collision shape to match sprite bounds

- **Category**: ui-ux
- **Severity**: suggestion
- **Location**: top-left HUD area
- **Issue**: Score text is small and hard to read
- **Recommendation**: Increase font size to at least 24px and add a drop shadow

### Summary
- Critical: 0, Warning: 1, Suggestion: 1
- Top priorities: fix sprite clipping, improve HUD readability
- Overall quality assessment: GOOD`

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: SAMPLE_RESPONSE,
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

const { VisionAgent } = await import('./agent')

function resetMocks() {
  mockCreateSession.mockClear()
  mockSendPrompt.mockClear()
  mockGetDefaultModel.mockClear()

  mockCreateSession.mockImplementation(() =>
    Promise.resolve({ id: 'ses_vision_123', title: 'Vision' })
  )
  mockSendPrompt.mockImplementation(() =>
    Promise.resolve({
      text: SAMPLE_RESPONSE,
      parts: [],
      raw: {},
    })
  )
  mockGetDefaultModel.mockImplementation(() => ({
    providerID: 'openrouter',
    modelID: 'anthropic/claude-sonnet-4.5',
  }))
}

const sampleImage = {
  media_type: 'image/png' as const,
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
}

describe('VisionAgent', () => {
  afterEach(() => {
    resetMocks()
  })

  describe('analyze() — success cases', () => {
    test('returns GOOD quality for standard response', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      expect(result.quality).toBe('GOOD')
      expect(result.success).toBe(true)
    })

    test('extracts overview section', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      expect(result.overview).toContain('2D platformer')
    })

    test('parses findings from response', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      expect(result.findings).toHaveLength(2)
      expect(result.findings[0].category).toBe('screenshot-bug')
      expect(result.findings[0].severity).toBe('warning')
      expect(result.findings[0].location).toBe('bottom-right corner')
      expect(result.findings[0].issue).toContain('clips through')
      expect(result.findings[1].category).toBe('ui-ux')
      expect(result.findings[1].severity).toBe('suggestion')
    })

    test('raw field contains full response text', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      expect(result.raw).toContain('### Overview')
      expect(result.raw).toContain('### Findings')
      expect(result.raw).toContain('### Summary')
    })

    test('creates a session on first call', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Vision')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])
      await agent.analyze([sampleImage])

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt and image count', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage, sampleImage])

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        attachments: unknown[]
      }
      expect(args.sessionId).toBe('ses_vision_123')
      expect(args.text).toContain('Vision Agent')
      expect(args.text).toContain('2 attached images')
      expect(args.attachments).toHaveLength(2)
    })

    test('sends prompt with single image text', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('1 attached image.')
      expect(args.text).not.toContain('images.')
    })

    test('includes additional context when provided', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage], 'This is a pixel art platformer')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('Additional context:')
      expect(args.text).toContain('pixel art platformer')
    })

    test('does not include context section when context is omitted', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).not.toContain('Additional context:')
    })

    test('includes analysis type instruction for screenshot', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage], undefined, 'screenshot')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('game screenshot analysis')
    })

    test('includes analysis type instruction for ui-ux', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage], undefined, 'ui-ux')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('UI/UX feedback')
    })

    test('includes analysis type instruction for asset', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage], undefined, 'asset')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('asset quality review')
    })

    test('comprehensive analysis when no type specified', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('comprehensive analysis')
    })

    test('uses default model from config', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])

      expect(mockGetDefaultModel).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        model: { providerID: string; modelID: string }
      }
      expect(args.model).toEqual({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.5',
      })
    })

    test('passes attachments to sendPrompt', async () => {
      const agent = new VisionAgent()
      const images = [
        { media_type: 'image/png' as const, data: 'base64data1' },
        { media_type: 'image/jpeg' as const, data: 'base64data2' },
      ]
      await agent.analyze(images)

      const args = mockSendPrompt.mock.calls[0][0] as { attachments: typeof images }
      expect(args.attachments).toEqual(images)
    })
  })

  describe('analyze() — quality parsing', () => {
    test('returns EXCELLENT quality', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: '### Overview\nGreat game.\n\n### Findings\n\n### Summary\nOverall quality assessment: EXCELLENT',
          parts: [],
          raw: {},
        })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('EXCELLENT')
      expect(result.success).toBe(true)
    })

    test('returns NEEDS_WORK quality', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: '### Overview\nSeveral issues.\n\n### Findings\n\n### Summary\nOverall quality assessment: NEEDS_WORK',
          parts: [],
          raw: {},
        })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('NEEDS_WORK')
      expect(result.success).toBe(true)
    })

    test('returns POOR quality with success=false', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: '### Overview\nMajor issues.\n\n### Findings\n\n### Summary\nOverall quality assessment: POOR',
          parts: [],
          raw: {},
        })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('POOR')
      expect(result.success).toBe(false)
    })

    test('returns UNKNOWN quality when no keyword found', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'The image looks fine overall.',
          parts: [],
          raw: {},
        })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('UNKNOWN')
      expect(result.success).toBe(true)
    })
  })

  describe('analyze() — failure cases', () => {
    test('returns UNKNOWN quality when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('UNKNOWN')
      expect(result.raw).toBe('')
      expect(result.findings).toHaveLength(0)
      expect(result.success).toBe(true)
    })

    test('returns UNKNOWN quality when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(result.quality).toBe('UNKNOWN')
      expect(result.raw).toBe('')
      expect(result.success).toBe(true)
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new VisionAgent()
      await expect(agent.analyze([sampleImage])).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new VisionAgent()
      await expect(agent.analyze([sampleImage])).rejects.toThrow('API timeout')
    })
  })

  describe('analyze() — session management', () => {
    test('creates new session for each agent instance', async () => {
      const agent1 = new VisionAgent()
      await agent1.analyze([sampleImage])

      const agent2 = new VisionAgent()
      await agent2.analyze([sampleImage])

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again after first call', async () => {
      const agent = new VisionAgent()
      await agent.analyze([sampleImage])
      await agent.analyze([sampleImage])
      await agent.analyze([sampleImage])

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_vision_123')
      }
    })
  })

  describe('analyze() — VisionResult interface', () => {
    test('result has correct shape', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      expect(result).toHaveProperty('overview')
      expect(result).toHaveProperty('findings')
      expect(result).toHaveProperty('quality')
      expect(result).toHaveProperty('raw')
      expect(result).toHaveProperty('success')
      expect(typeof result.overview).toBe('string')
      expect(Array.isArray(result.findings)).toBe(true)
      expect(typeof result.quality).toBe('string')
      expect(typeof result.raw).toBe('string')
      expect(typeof result.success).toBe('boolean')
    })

    test('quality is one of the valid enum values', async () => {
      const validQualities = ['EXCELLENT', 'GOOD', 'NEEDS_WORK', 'POOR', 'UNKNOWN']
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])
      expect(validQualities).toContain(result.quality)
    })

    test('findings have correct shape', async () => {
      const agent = new VisionAgent()
      const result = await agent.analyze([sampleImage])

      for (const finding of result.findings) {
        expect(finding).toHaveProperty('category')
        expect(finding).toHaveProperty('severity')
        expect(finding).toHaveProperty('location')
        expect(finding).toHaveProperty('issue')
        expect(finding).toHaveProperty('recommendation')
      }
    })
  })
})
