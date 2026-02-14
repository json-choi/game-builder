import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_orch_123', title: 'Orchestrator' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: JSON.stringify({
      steps: [
        { agent: 'game-designer', task: 'Design the game', dependsOn: [] },
        { agent: 'game-coder', task: 'Write player code', dependsOn: ['game-designer'] },
      ],
      totalSteps: 2,
    }),
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
}))

mock.module('../opencode/config', () => ({
  getDefaultModel: mockGetDefaultModel,
}))

const { OrchestratorAgent } = await import('./agent')

function resetMocks() {
  mockCreateSession.mockClear()
  mockSendPrompt.mockClear()
  mockGetDefaultModel.mockClear()

  mockCreateSession.mockImplementation(() =>
    Promise.resolve({ id: 'ses_orch_123', title: 'Orchestrator' })
  )
  mockSendPrompt.mockImplementation(() =>
    Promise.resolve({
      text: JSON.stringify({
        steps: [
          { agent: 'game-designer', task: 'Design the game', dependsOn: [] },
          { agent: 'game-coder', task: 'Write player code', dependsOn: ['game-designer'] },
        ],
        totalSteps: 2,
      }),
      parts: [],
      raw: {},
    })
  )
  mockGetDefaultModel.mockImplementation(() => ({
    providerID: 'openrouter',
    modelID: 'anthropic/claude-sonnet-4.5',
  }))
}

describe('OrchestratorAgent', () => {
  afterEach(() => {
    resetMocks()
  })

  describe('createPlan() — success cases', () => {
    test('returns a valid plan with steps from AI response', async () => {
      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a platformer game')

      expect(result.plan.steps).toHaveLength(2)
      expect(result.plan.totalSteps).toBe(2)
      expect(result.plan.steps[0].agent).toBe('game-designer')
      expect(result.plan.steps[1].agent).toBe('game-coder')
      expect(result.plan.steps[1].dependsOn).toContain('game-designer')
    })

    test('includes raw AI response in result', async () => {
      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result.raw).toBeDefined()
      expect(result.raw.length).toBeGreaterThan(0)
      expect(result.raw).toContain('game-designer')
    })

    test('creates a session on first call', async () => {
      const agent = new OrchestratorAgent()
      await agent.createPlan('Create a game')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Orchestrator')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new OrchestratorAgent()
      await agent.createPlan('First request')
      await agent.createPlan('Second request')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with orchestrator system prompt', async () => {
      const agent = new OrchestratorAgent()
      await agent.createPlan('Create a puzzle game')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_orch_123')
      expect(args.text).toContain('You are the Orchestrator Agent')
      expect(args.text).toContain('User Request: Create a puzzle game')
    })

    test('sends prompt with default model', async () => {
      const agent = new OrchestratorAgent()
      await agent.createPlan('Create a game')

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
      const agent = new OrchestratorAgent()
      await agent.createPlan('Create a game')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const separatorIdx = text.indexOf('---')
      expect(separatorIdx).toBeGreaterThan(0)

      const afterSeparator = text.slice(separatorIdx + 3)
      expect(afterSeparator).toContain('User Request:')
    })

    test('handles single-step plan', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Fix a bug', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Fix a bug')

      expect(result.plan.steps).toHaveLength(1)
      expect(result.plan.totalSteps).toBe(1)
      expect(result.plan.steps[0].agent).toBe('game-coder')
    })

    test('handles multi-step plan with complex dependencies', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-designer', task: 'Design', dependsOn: [] },
              { agent: 'scene-builder', task: 'Build scene', dependsOn: ['game-designer'] },
              { agent: 'game-coder', task: 'Code player', dependsOn: ['scene-builder'] },
              { agent: 'game-coder', task: 'Code enemy', dependsOn: ['scene-builder'] },
            ],
            totalSteps: 4,
          }),
          parts: [],
          raw: {},
        })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game with enemies')

      expect(result.plan.steps).toHaveLength(4)
      expect(result.plan.totalSteps).toBe(4)
      expect(result.plan.steps[2].dependsOn).toContain('scene-builder')
      expect(result.plan.steps[3].dependsOn).toContain('scene-builder')
    })
  })

  describe('createPlan() — fallback cases', () => {
    test('falls back to game-coder when response is invalid JSON', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'This is not JSON at all. Let me explain how to build a game...',
          parts: [],
          raw: {},
        })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result.plan.steps).toHaveLength(1)
      expect(result.plan.totalSteps).toBe(1)
      expect(result.plan.steps[0].agent).toBe('game-coder')
      expect(result.plan.steps[0].task).toBe('Create a game')
      expect(result.plan.steps[0].dependsOn).toEqual([])
    })

    test('falls back to game-coder when response JSON has no steps', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: JSON.stringify({ message: 'I understood your request.' }),
          parts: [],
          raw: {},
        })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result.plan.steps).toHaveLength(1)
      expect(result.plan.steps[0].agent).toBe('game-coder')
    })

    test('falls back to game-coder when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result.plan.steps).toHaveLength(1)
      expect(result.plan.steps[0].agent).toBe('game-coder')
      expect(result.raw).toBe('')
    })

    test('falls back to game-coder when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result.plan.steps).toHaveLength(1)
      expect(result.plan.steps[0].agent).toBe('game-coder')
    })

    test('fallback preserves the original user message as the task', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: 'Not JSON', parts: [], raw: {} })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Add jumping mechanic to player')

      expect(result.plan.steps[0].task).toBe('Add jumping mechanic to player')
    })

    test('fallback plan has empty dependsOn array', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: 'Not JSON', parts: [], raw: {} })
      )

      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Fix a bug')

      expect(result.plan.steps[0].dependsOn).toEqual([])
    })
  })

  describe('createPlan() — error propagation', () => {
    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new OrchestratorAgent()
      await expect(agent.createPlan('Create a game')).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new OrchestratorAgent()
      await expect(agent.createPlan('Create a game')).rejects.toThrow('API timeout')
    })
  })

  describe('createPlan() — session management', () => {
    test('creates new session for each agent instance', async () => {
      const agent1 = new OrchestratorAgent()
      await agent1.createPlan('Request 1')

      const agent2 = new OrchestratorAgent()
      await agent2.createPlan('Request 2')

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again after first createPlan call', async () => {
      const agent = new OrchestratorAgent()

      await agent.createPlan('First')
      await agent.createPlan('Second')
      await agent.createPlan('Third')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_orch_123')
      }
    })
  })

  describe('createPlan() — PlanResult interface', () => {
    test('result has correct shape with plan and raw fields', async () => {
      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      expect(result).toHaveProperty('plan')
      expect(result).toHaveProperty('raw')
      expect(typeof result.raw).toBe('string')
      expect(result.plan).toHaveProperty('steps')
      expect(result.plan).toHaveProperty('totalSteps')
      expect(Array.isArray(result.plan.steps)).toBe(true)
      expect(typeof result.plan.totalSteps).toBe('number')
    })

    test('each step has agent, task, and dependsOn fields', async () => {
      const agent = new OrchestratorAgent()
      const result = await agent.createPlan('Create a game')

      for (const step of result.plan.steps) {
        expect(step).toHaveProperty('agent')
        expect(step).toHaveProperty('task')
        expect(step).toHaveProperty('dependsOn')
        expect(typeof step.agent).toBe('string')
        expect(typeof step.task).toBe('string')
        expect(Array.isArray(step.dependsOn)).toBe(true)
      }
    })
  })
})
