import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { AgentDefinition, AgentExecutionContext, AgentProgressEvent } from './types'

const mockGetOrCreateAgentSession = mock(() => Promise.resolve('ses_test'))
const mockSendPrompt = mock(() =>
  Promise.resolve({ text: 'Agent response text', parts: [], raw: {} })
)

mock.module('@opencode-ai/sdk', () => ({
  createOpencodeClient: () => ({}),
}))

mock.module('./session-manager', () => ({
  getOrCreateAgentSession: mockGetOrCreateAgentSession,
  clearAgentSessions: () => {},
}))

mock.module('../opencode/client', () => ({
  sendPrompt: mockSendPrompt,
  setDirectory: () => {},
  getDirectory: () => '',
  getClient: () => ({}),
  resetClient: () => {},
  createSession: async () => ({ id: 'ses_test', title: '' }),
  listSessions: async () => [],
  deleteSession: async () => {},
  sendPromptAsync: async () => {},
  listAgents: async () => [],
  respondToPermission: async () => {},
  replyToQuestion: async () => {},
  rejectQuestion: async () => {},
  subscribeEvents: async () => ({ error: null }),
}))

const { executeAgent } = await import('./agent-executor')

function makeDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent',
    category: 'coding',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
    systemPrompt: 'You are a test agent.',
    tools: { read_file: true },
    maxRetries: 3,
    ...overrides,
  }
}

function makeContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    projectPath: '/tmp/test-project',
    sessionId: 'ctx-session',
    ...overrides,
  }
}

describe('agent-executor', () => {
  afterEach(() => {
    mockGetOrCreateAgentSession.mockClear()
    mockSendPrompt.mockClear()
    mockGetOrCreateAgentSession.mockImplementation(() => Promise.resolve('ses_test'))
    mockSendPrompt.mockImplementation(() =>
      Promise.resolve({ text: 'Agent response text', parts: [], raw: {} })
    )
  })

  describe('executeAgent (success)', () => {
    test('returns successful result with response text', async () => {
      const result = await executeAgent(makeDefinition(), 'Write player code', makeContext())

      expect(result.success).toBe(true)
      expect(result.agent).toBe('test-agent')
      expect(result.output).toBe('Agent response text')
      expect(result.filesChanged).toEqual([])
      expect(result.errors).toEqual([])
    })

    test('calls getOrCreateAgentSession with agent name', async () => {
      await executeAgent(makeDefinition({ name: 'my-agent' }), 'prompt', makeContext())
      expect(mockGetOrCreateAgentSession).toHaveBeenCalledWith('my-agent')
    })

    test('sends prompt with system prompt prepended', async () => {
      const def = makeDefinition({ systemPrompt: 'SYSTEM' })
      await executeAgent(def, 'USER PROMPT', makeContext())

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const callArgs = mockSendPrompt.mock.calls[0][0] as Record<string, unknown>
      expect(callArgs.sessionId).toBe('ses_test')
      expect(callArgs.text).toBe('SYSTEM\n\n---\n\nUSER PROMPT')
      expect(callArgs.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' })
    })

    test('fires agent-start progress event', async () => {
      const events: AgentProgressEvent[] = []
      const context = makeContext({ onProgress: (e) => events.push(e) })
      await executeAgent(makeDefinition({ name: 'coder', displayName: 'Coder' }), 'go', context)

      const startEvents = events.filter((e) => e.type === 'agent-start')
      expect(startEvents).toHaveLength(1)
      expect(startEvents[0].agent).toBe('coder')
      expect(startEvents[0].message).toBe('Coder starting...')
    })

    test('fires step-end progress event on success', async () => {
      const events: AgentProgressEvent[] = []
      const context = makeContext({ onProgress: (e) => events.push(e) })
      await executeAgent(makeDefinition({ name: 'coder', displayName: 'Coder' }), 'go', context)

      const endEvents = events.filter((e) => e.type === 'step-end')
      expect(endEvents).toHaveLength(1)
      expect(endEvents[0].agent).toBe('coder')
      expect(endEvents[0].message).toBe('Coder completed')
    })

    test('handles null response text', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const result = await executeAgent(makeDefinition(), 'prompt', makeContext())
      expect(result.success).toBe(true)
      expect(result.output).toBe('')
    })
  })

  describe('executeAgent (failure)', () => {
    test('returns failure result when sendPrompt throws', async () => {
      mockSendPrompt.mockImplementation(() => Promise.reject(new Error('API timeout')))

      const result = await executeAgent(makeDefinition(), 'prompt', makeContext())

      expect(result.success).toBe(false)
      expect(result.agent).toBe('test-agent')
      expect(result.errors).toEqual(['API timeout'])
      expect(result.output).toBe('')
      expect(result.filesChanged).toEqual([])
    })

    test('returns failure result when getOrCreateAgentSession throws', async () => {
      mockGetOrCreateAgentSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const result = await executeAgent(makeDefinition(), 'prompt', makeContext())

      expect(result.success).toBe(false)
      expect(result.errors).toEqual(['Session creation failed'])
    })

    test('handles non-Error throws', async () => {
      mockSendPrompt.mockImplementation(() => Promise.reject('string error'))

      const result = await executeAgent(makeDefinition(), 'prompt', makeContext())

      expect(result.success).toBe(false)
      expect(result.errors).toEqual(['string error'])
    })

    test('fires error progress event on failure', async () => {
      mockSendPrompt.mockImplementation(() => Promise.reject(new Error('boom')))
      const events: AgentProgressEvent[] = []
      const context = makeContext({ onProgress: (e) => events.push(e) })

      await executeAgent(
        makeDefinition({ name: 'coder', displayName: 'Coder' }),
        'go',
        context,
      )

      const errorEvents = events.filter((e) => e.type === 'error')
      expect(errorEvents).toHaveLength(1)
      expect(errorEvents[0].agent).toBe('coder')
      expect(errorEvents[0].message).toBe('Coder failed: boom')
    })
  })

  test('works without onProgress callback', async () => {
    const context = makeContext({ onProgress: undefined })
    const result = await executeAgent(makeDefinition(), 'prompt', context)
    expect(result.success).toBe(true)
  })
})
