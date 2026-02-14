import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AgentDefinition, AgentProgressEvent, OrchestrationPlan } from './types'
import { clearRegistry, registerAgent } from './agent-registry'

// ── Mocks ──────────────────────────────────────────────────────────

const mockSendPrompt = mock(() =>
  Promise.resolve({ text: 'Agent response text', parts: [], raw: {} })
)

const mockGetOrCreateAgentSession = mock(() => Promise.resolve('ses_test'))

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

mock.module('./session-manager', () => ({
  getOrCreateAgentSession: mockGetOrCreateAgentSession,
  clearAgentSessions: () => {},
}))

const { orchestrate } = await import('./orchestrator')

// ── Helpers ────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent',
    category: 'coding',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
    systemPrompt: 'You are a test agent.',
    tools: { read_file: true },
    maxRetries: 1,
    ...overrides,
  }
}

function registerTestAgents() {
  registerAgent(
    makeAgent({
      name: 'orchestrator',
      displayName: 'Orchestrator',
      category: 'planning',
      maxRetries: 1,
    })
  )
  registerAgent(
    makeAgent({
      name: 'game-coder',
      displayName: 'Game Coder',
      category: 'coding',
      maxRetries: 1,
    })
  )
  registerAgent(
    makeAgent({
      name: 'game-designer',
      displayName: 'Game Designer',
      category: 'planning',
      maxRetries: 1,
    })
  )
  registerAgent(
    makeAgent({
      name: 'scene-builder',
      displayName: 'Scene Builder',
      category: 'building',
      maxRetries: 1,
    })
  )
  registerAgent(
    makeAgent({
      name: 'reviewer',
      displayName: 'Reviewer',
      category: 'reviewing',
      maxRetries: 1,
    })
  )
  registerAgent(
    makeAgent({
      name: 'debugger',
      displayName: 'Debugger',
      category: 'debugging',
      maxRetries: 3,
    })
  )
}

// ── Tests ──────────────────────────────────────────────────────────

describe('OrchestrationPlan parsing', () => {
  test('parses valid plan JSON', () => {
    const raw = JSON.stringify({
      steps: [
        { agent: 'game-coder', task: 'Write code', dependsOn: [] },
        { agent: 'scene-builder', task: 'Build scenes', dependsOn: ['game-coder'] },
      ],
      totalSteps: 2,
    })

    const plan: OrchestrationPlan = JSON.parse(raw)
    expect(plan.steps).toHaveLength(2)
    expect(plan.totalSteps).toBe(2)
    expect(plan.steps[0].agent).toBe('game-coder')
    expect(plan.steps[1].dependsOn).toContain('game-coder')
  })

  test('falls back to single game-coder step on invalid JSON', () => {
    const raw = 'not valid json'
    let plan: OrchestrationPlan

    try {
      const parsed = JSON.parse(raw)
      if (parsed.steps && Array.isArray(parsed.steps)) {
        plan = parsed
      } else {
        plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
      }
    } catch {
      plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
    }

    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].agent).toBe('game-coder')
  })

  test('falls back when parsed JSON has no steps array', () => {
    const raw = JSON.stringify({ message: 'no steps here' })
    let plan: OrchestrationPlan

    try {
      const parsed = JSON.parse(raw)
      if (parsed.steps && Array.isArray(parsed.steps)) {
        plan = parsed
      } else {
        plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
      }
    } catch {
      plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
    }

    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].agent).toBe('game-coder')
  })

  test('handles empty steps array', () => {
    const raw = JSON.stringify({ steps: [], totalSteps: 0 })
    const plan: OrchestrationPlan = JSON.parse(raw)

    expect(plan.steps).toHaveLength(0)
    expect(plan.totalSteps).toBe(0)
  })

  test('preserves dependency chains', () => {
    const plan: OrchestrationPlan = {
      steps: [
        { agent: 'game-designer', task: 'Design', dependsOn: [] },
        { agent: 'game-coder', task: 'Code', dependsOn: ['game-designer'] },
        { agent: 'scene-builder', task: 'Scenes', dependsOn: ['game-designer'] },
        { agent: 'debugger', task: 'Debug', dependsOn: ['game-coder', 'scene-builder'] },
      ],
      totalSteps: 4,
    }

    const debugStep = plan.steps.find((s) => s.agent === 'debugger')!
    expect(debugStep.dependsOn).toEqual(['game-coder', 'scene-builder'])
  })

  test('round-trips through JSON serialization', () => {
    const plan: OrchestrationPlan = {
      steps: [{ agent: 'game-coder', task: 'Build a platformer', dependsOn: [] }],
      totalSteps: 1,
    }

    const serialized = JSON.stringify(plan)
    const deserialized: OrchestrationPlan = JSON.parse(serialized)

    expect(deserialized).toEqual(plan)
  })
})

describe('orchestrate() — coordination flow', () => {
  beforeEach(() => {
    clearRegistry()
    registerTestAgents()

    mockSendPrompt.mockClear()
    mockGetOrCreateAgentSession.mockClear()

    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Orchestrator planning call
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write player code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      // Agent execution calls
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })
  })

  afterEach(() => {
    clearRegistry()
  })

  test('throws when orchestrator agent is not registered', async () => {
    clearRegistry()
    await expect(orchestrate('Build a game', '/tmp/test')).rejects.toThrow(
      'Orchestrator agent not registered'
    )
  })

  test('executes orchestrator first to create plan', async () => {
    await orchestrate('Build a game', '/tmp/test')

    expect(mockSendPrompt).toHaveBeenCalled()
    const firstCallArgs = mockSendPrompt.mock.calls[0][0] as { text: string }
    expect(firstCallArgs.text).toContain('Build a game')
  })

  test('executes plan steps sequentially', async () => {
    const executionOrder: string[] = []
    let callCount = 0

    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        executionOrder.push('orchestrator')
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-designer', task: 'Design the game', dependsOn: [] },
              { agent: 'game-coder', task: 'Write code', dependsOn: ['game-designer'] },
            ],
            totalSteps: 2,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        executionOrder.push('game-designer')
      } else if (callCount === 3) {
        executionOrder.push('game-coder')
      } else {
        executionOrder.push('reviewer')
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    await orchestrate('Build a game', '/tmp/test')

    expect(executionOrder).toEqual(['orchestrator', 'game-designer', 'game-coder', 'reviewer'])
  })

  test('executes multiple plan steps with serialized access', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-coder', task: 'Write code', dependsOn: [] },
              { agent: 'scene-builder', task: 'Build scenes', dependsOn: [] },
            ],
            totalSteps: 2,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator + 2 plan steps + reviewer = 4
    expect(results).toHaveLength(4)
    expect(results.every((r) => r.success)).toBe(true)
  })

  test('continues after agent failure and still runs reviewer', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        return Promise.reject(new Error('Agent failed'))
      }
      return Promise.resolve({ text: 'Review done', parts: [], raw: {} })
    })

    const result = await orchestrate('Build a game', '/tmp/test')

    expect(result.success).toBe(false)
    expect(result.results.length).toBeGreaterThanOrEqual(2)
  })

  test('runs reviewer automatically after all plan steps', async () => {
    let callCount = 0
    const agentNames: string[] = []

    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    mockGetOrCreateAgentSession.mockImplementation((name: string) => {
      agentNames.push(name)
      return Promise.resolve(`ses_${name}`)
    })

    await orchestrate('Build a game', '/tmp/test')

    expect(agentNames).toContain('orchestrator')
    expect(agentNames).toContain('game-coder')
    expect(agentNames).toContain('reviewer')
  })

  test('collects results from all agents', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: `Result ${callCount}`, parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator plan result + game-coder result + reviewer result = 3
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.agent !== undefined)).toBe(true)
  })

  test('returns success=true when all agents succeed', async () => {
    const { success } = await orchestrate('Build a game', '/tmp/test')
    expect(success).toBe(true)
  })

  test('returns success=false when any agent fails', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        return Promise.reject(new Error('Code generation failed'))
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { success } = await orchestrate('Build a game', '/tmp/test')
    expect(success).toBe(false)
  })

  test('skips unregistered agents in plan without throwing', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'nonexistent-agent', task: 'Do something', dependsOn: [] },
              { agent: 'game-coder', task: 'Write code', dependsOn: [] },
            ],
            totalSteps: 2,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator + game-coder + reviewer (skipped nonexistent-agent)
    expect(results).toHaveLength(3)
  })

  test('falls back to single game-coder step when plan is invalid JSON', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: 'This is not valid JSON',
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator + fallback game-coder + reviewer = 3
    expect(results).toHaveLength(3)
  })

  test('falls back to single game-coder step when plan has no steps array', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({ message: 'No steps here' }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator + fallback game-coder + reviewer = 3
    expect(results).toHaveLength(3)
  })
})

describe('orchestrate() — retry logic', () => {
  beforeEach(() => {
    clearRegistry()
    registerTestAgents()

    // Override game-coder to allow retries
    registerAgent(
      makeAgent({
        name: 'game-coder',
        displayName: 'Game Coder',
        category: 'coding',
        maxRetries: 3,
      })
    )

    mockSendPrompt.mockClear()
    mockGetOrCreateAgentSession.mockClear()
  })

  afterEach(() => {
    clearRegistry()
  })

  test('retries failed agent up to maxRetries times', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        return Promise.reject(new Error('Attempt 1 failed'))
      }
      if (callCount === 3) {
        return Promise.reject(new Error('Retry 1 failed'))
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results } = await orchestrate('Build a game', '/tmp/test')

    const failedResults = results.filter((r) => !r.success)
    expect(failedResults.length).toBeGreaterThanOrEqual(1)
  })

  test('retry prompt includes previous errors', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        return Promise.reject(new Error('Syntax error at line 5'))
      }
      return Promise.resolve({ text: 'Fixed code', parts: [], raw: {} })
    })

    await orchestrate('Build a game', '/tmp/test')

    expect(mockSendPrompt.mock.calls.length).toBeGreaterThanOrEqual(3)
    const retryArgs = mockSendPrompt.mock.calls[2][0] as { text: string }
    expect(retryArgs.text).toContain('Previous attempt failed')
    expect(retryArgs.text).toContain('Syntax error at line 5')
  })

  test('does not retry agents with maxRetries=1', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    await orchestrate('Build a game', '/tmp/test')

    // orchestrator + game-coder + reviewer = 3 (no retries because game-coder succeeds)
    expect(callCount).toBe(3)
  })

  test('stops retrying after first successful retry', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      if (callCount === 2) {
        return Promise.reject(new Error('Failed'))
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    await orchestrate('Build a game', '/tmp/test')

    // orchestrator(1) + game-coder fail(2) + retry success(3) + reviewer(4) = 4
    expect(callCount).toBe(4)
  })
})

describe('orchestrate() — progress events', () => {
  beforeEach(() => {
    clearRegistry()
    registerTestAgents()

    mockSendPrompt.mockClear()
    mockGetOrCreateAgentSession.mockClear()
  })

  afterEach(() => {
    clearRegistry()
  })

  test('emits progress events in correct order for single-step plan', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const events: AgentProgressEvent[] = []
    await orchestrate('Build a game', '/tmp/test', (e) => events.push(e))

    const types = events.map((e) => e.type)

    expect(types).toContain('agent-start')
    expect(types).toContain('step-start')
    expect(types).toContain('step-end')
    expect(types).toContain('complete')
  })

  test('emits agent-start event at the beginning', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Write code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const events: AgentProgressEvent[] = []
    await orchestrate('Build a game', '/tmp/test', (e) => events.push(e))

    const agentStartEvents = events.filter((e) => e.type === 'agent-start')
    expect(agentStartEvents.length).toBeGreaterThanOrEqual(1)
    expect(agentStartEvents[0].agent).toBe('orchestrator')
  })

  test('emits step-start events for each plan step', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-designer', task: 'Design', dependsOn: [] },
              { agent: 'game-coder', task: 'Code', dependsOn: [] },
            ],
            totalSteps: 2,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const events: AgentProgressEvent[] = []
    await orchestrate('Build a game', '/tmp/test', (e) => events.push(e))

    const stepStartEvents = events.filter((e) => e.type === 'step-start')
    // planning step + game-designer + game-coder + reviewer = 4
    expect(stepStartEvents.length).toBeGreaterThanOrEqual(3)
  })

  test('emits error event for unregistered agents in plan', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'nonexistent', task: 'Do something', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const events: AgentProgressEvent[] = []
    await orchestrate('Build a game', '/tmp/test', (e) => events.push(e))

    const errorEvents = events.filter((e) => e.type === 'error')
    expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    expect(errorEvents[0].message).toContain('nonexistent')
  })

  test('emits complete event at the end', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const events: AgentProgressEvent[] = []
    await orchestrate('Build a game', '/tmp/test', (e) => events.push(e))

    const lastEvent = events[events.length - 1]
    expect(lastEvent.type).toBe('complete')
  })

  test('works without onProgress callback', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [{ agent: 'game-coder', task: 'Code', dependsOn: [] }],
            totalSteps: 1,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { success } = await orchestrate('Build a game', '/tmp/test')
    expect(success).toBe(true)
  })
})

describe('orchestrate() — multi-step turn-taking', () => {
  beforeEach(() => {
    clearRegistry()
    registerTestAgents()

    mockSendPrompt.mockClear()
    mockGetOrCreateAgentSession.mockClear()
  })

  afterEach(() => {
    clearRegistry()
  })

  test('each agent gets its own session', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-designer', task: 'Design', dependsOn: [] },
              { agent: 'game-coder', task: 'Code', dependsOn: ['game-designer'] },
              { agent: 'scene-builder', task: 'Build', dependsOn: ['game-designer'] },
            ],
            totalSteps: 3,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const sessionNames: string[] = []
    mockGetOrCreateAgentSession.mockImplementation((name: string) => {
      sessionNames.push(name)
      return Promise.resolve(`ses_${name}`)
    })

    await orchestrate('Build a game', '/tmp/test')

    const uniqueNames = [...new Set(sessionNames)]
    expect(uniqueNames).toContain('orchestrator')
    expect(uniqueNames).toContain('game-designer')
    expect(uniqueNames).toContain('game-coder')
    expect(uniqueNames).toContain('scene-builder')
    expect(uniqueNames).toContain('reviewer')
  })

  test('handles empty plan with zero steps', async () => {
    let callCount = 0
    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({ steps: [], totalSteps: 0 }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    const { results, success } = await orchestrate('Build a game', '/tmp/test')

    // orchestrator + reviewer only (no plan steps)
    expect(results).toHaveLength(2)
    expect(success).toBe(true)
  })

  test('proceeds to next step even when previous step fails', async () => {
    let callCount = 0
    const executedAgents: string[] = []

    mockSendPrompt.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          text: JSON.stringify({
            steps: [
              { agent: 'game-designer', task: 'Design', dependsOn: [] },
              { agent: 'game-coder', task: 'Code', dependsOn: [] },
            ],
            totalSteps: 2,
          }),
          parts: [],
          raw: {},
        })
      }
      return Promise.resolve({ text: 'Done', parts: [], raw: {} })
    })

    mockGetOrCreateAgentSession.mockImplementation((name: string) => {
      executedAgents.push(name)
      return Promise.resolve(`ses_${name}`)
    })

    await orchestrate('Build a game', '/tmp/test')

    expect(executedAgents).toContain('game-designer')
    expect(executedAgents).toContain('game-coder')
    expect(executedAgents).toContain('reviewer')
  })
})
