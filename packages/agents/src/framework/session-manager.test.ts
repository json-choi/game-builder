import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

describe('session-manager', () => {
  let sessions: Map<string, string>
  let createSessionCalls: string[]

  async function mockCreateSession(title: string) {
    createSessionCalls.push(title)
    return { id: `ses_mock_${createSessionCalls.length}`, title }
  }

  async function getOrCreateAgentSession(agentName: string): Promise<string> {
    const existing = sessions.get(agentName)
    if (existing) return existing

    const session = await mockCreateSession(`Agent: ${agentName}`)
    sessions.set(agentName, session.id)
    return session.id
  }

  function clearAgentSessions(): void {
    sessions.clear()
  }

  beforeEach(() => {
    sessions = new Map()
    createSessionCalls = []
  })

  afterEach(() => {
    sessions.clear()
  })

  describe('getOrCreateAgentSession', () => {
    test('creates a new session for unknown agent', async () => {
      const sessionId = await getOrCreateAgentSession('game-coder')

      expect(sessionId).toBe('ses_mock_1')
      expect(createSessionCalls).toHaveLength(1)
      expect(createSessionCalls[0]).toBe('Agent: game-coder')
    })

    test('returns cached session for same agent on second call', async () => {
      const first = await getOrCreateAgentSession('game-coder')
      const second = await getOrCreateAgentSession('game-coder')

      expect(first).toBe(second)
      expect(createSessionCalls).toHaveLength(1)
    })

    test('creates separate sessions for different agents', async () => {
      const a = await getOrCreateAgentSession('agent-a')
      const b = await getOrCreateAgentSession('agent-b')

      expect(a).not.toBe(b)
      expect(createSessionCalls).toHaveLength(2)
    })
  })

  describe('clearAgentSessions', () => {
    test('clears cached sessions so next call creates new ones', async () => {
      await getOrCreateAgentSession('game-coder')
      expect(createSessionCalls).toHaveLength(1)

      clearAgentSessions()
      await getOrCreateAgentSession('game-coder')
      expect(createSessionCalls).toHaveLength(2)
    })
  })
})
