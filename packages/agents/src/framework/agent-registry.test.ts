import { afterEach, describe, expect, test } from 'bun:test'
import { clearRegistry, getAgent, listRegisteredAgents, registerAgent } from './agent-registry'
import type { AgentDefinition } from './types'

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent',
    category: 'coding',
    defaultModel: { providerID: 'openai', modelID: 'gpt-4' },
    systemPrompt: 'You are a test agent.',
    tools: { read_file: true },
    maxRetries: 3,
    ...overrides,
  }
}

describe('agent-registry', () => {
  afterEach(() => {
    clearRegistry()
  })

  describe('registerAgent', () => {
    test('registers an agent definition', () => {
      const agent = makeAgent()
      registerAgent(agent)
      expect(getAgent('test-agent')).toEqual(agent)
    })

    test('overwrites an existing agent with the same name', () => {
      const v1 = makeAgent({ description: 'version 1' })
      const v2 = makeAgent({ description: 'version 2' })
      registerAgent(v1)
      registerAgent(v2)
      expect(getAgent('test-agent')?.description).toBe('version 2')
    })

    test('registers multiple agents with different names', () => {
      registerAgent(makeAgent({ name: 'alpha' }))
      registerAgent(makeAgent({ name: 'beta' }))
      registerAgent(makeAgent({ name: 'gamma' }))
      expect(listRegisteredAgents()).toHaveLength(3)
    })
  })

  describe('getAgent', () => {
    test('returns undefined for unregistered agent', () => {
      expect(getAgent('nonexistent')).toBeUndefined()
    })

    test('returns the correct agent by name', () => {
      registerAgent(makeAgent({ name: 'a', displayName: 'Agent A' }))
      registerAgent(makeAgent({ name: 'b', displayName: 'Agent B' }))
      expect(getAgent('a')?.displayName).toBe('Agent A')
      expect(getAgent('b')?.displayName).toBe('Agent B')
    })
  })

  describe('listRegisteredAgents', () => {
    test('returns empty array when no agents registered', () => {
      expect(listRegisteredAgents()).toEqual([])
    })

    test('returns all registered agents', () => {
      registerAgent(makeAgent({ name: 'x' }))
      registerAgent(makeAgent({ name: 'y' }))
      const agents = listRegisteredAgents()
      expect(agents).toHaveLength(2)
      const names = agents.map((a) => a.name)
      expect(names).toContain('x')
      expect(names).toContain('y')
    })
  })

  describe('clearRegistry', () => {
    test('removes all registered agents', () => {
      registerAgent(makeAgent({ name: 'a' }))
      registerAgent(makeAgent({ name: 'b' }))
      expect(listRegisteredAgents()).toHaveLength(2)
      clearRegistry()
      expect(listRegisteredAgents()).toEqual([])
    })

    test('is safe to call on empty registry', () => {
      clearRegistry()
      expect(listRegisteredAgents()).toEqual([])
    })
  })
})
