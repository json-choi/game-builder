import { afterEach, describe, expect, test } from 'bun:test'
import { initializeAgents, AGENT_DEFINITIONS } from './agents-init'
import { clearRegistry, getAgent, listRegisteredAgents } from './framework/agent-registry'

describe('agents-init', () => {
  afterEach(() => {
    clearRegistry()
  })

  describe('AGENT_DEFINITIONS', () => {
    test('contains 6 agent definitions', () => {
      expect(AGENT_DEFINITIONS).toHaveLength(6)
    })

    test('each definition has all required fields', () => {
      for (const def of AGENT_DEFINITIONS) {
        expect(typeof def.name).toBe('string')
        expect(typeof def.displayName).toBe('string')
        expect(typeof def.description).toBe('string')
        expect(typeof def.category).toBe('string')
        expect(def.defaultModel).toHaveProperty('providerID')
        expect(def.defaultModel).toHaveProperty('modelID')
        expect(typeof def.systemPrompt).toBe('string')
        expect(def.systemPrompt.length).toBeGreaterThan(0)
        expect(typeof def.tools).toBe('object')
        expect(typeof def.maxRetries).toBe('number')
        expect(def.maxRetries).toBeGreaterThanOrEqual(1)
      }
    })

    test('contains all expected agent names', () => {
      const names = AGENT_DEFINITIONS.map((d) => d.name)
      expect(names).toContain('orchestrator')
      expect(names).toContain('game-designer')
      expect(names).toContain('game-coder')
      expect(names).toContain('scene-builder')
      expect(names).toContain('debugger')
      expect(names).toContain('reviewer')
    })

    test('each agent has a unique name', () => {
      const names = AGENT_DEFINITIONS.map((d) => d.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    test('categories are valid', () => {
      const validCategories = ['planning', 'coding', 'building', 'debugging', 'reviewing']
      for (const def of AGENT_DEFINITIONS) {
        expect(validCategories).toContain(def.category)
      }
    })

    test('orchestrator has planning category', () => {
      const orch = AGENT_DEFINITIONS.find((d) => d.name === 'orchestrator')!
      expect(orch.category).toBe('planning')
    })

    test('game-coder has coding category', () => {
      const coder = AGENT_DEFINITIONS.find((d) => d.name === 'game-coder')!
      expect(coder.category).toBe('coding')
    })

    test('scene-builder has building category', () => {
      const builder = AGENT_DEFINITIONS.find((d) => d.name === 'scene-builder')!
      expect(builder.category).toBe('building')
    })

    test('debugger has debugging category', () => {
      const dbg = AGENT_DEFINITIONS.find((d) => d.name === 'debugger')!
      expect(dbg.category).toBe('debugging')
    })

    test('reviewer has reviewing category', () => {
      const rev = AGENT_DEFINITIONS.find((d) => d.name === 'reviewer')!
      expect(rev.category).toBe('reviewing')
    })

    test('each agent has at least read_file tool', () => {
      for (const def of AGENT_DEFINITIONS) {
        expect(def.tools.read_file).toBe(true)
      }
    })

    test('orchestrator cannot write files', () => {
      const orch = AGENT_DEFINITIONS.find((d) => d.name === 'orchestrator')!
      expect(orch.tools.write_file).toBeUndefined()
    })

    test('reviewer cannot write files', () => {
      const rev = AGENT_DEFINITIONS.find((d) => d.name === 'reviewer')!
      expect(rev.tools.write_file).toBeUndefined()
    })

    test('game-coder can write files and validate', () => {
      const coder = AGENT_DEFINITIONS.find((d) => d.name === 'game-coder')!
      expect(coder.tools.write_file).toBe(true)
      expect(coder.tools.validate_project).toBe(true)
      expect(coder.tools.validate_script).toBe(true)
    })

    test('debugger can write files and validate', () => {
      const dbg = AGENT_DEFINITIONS.find((d) => d.name === 'debugger')!
      expect(dbg.tools.write_file).toBe(true)
      expect(dbg.tools.validate_project).toBe(true)
      expect(dbg.tools.validate_script).toBe(true)
    })
  })

  describe('initializeAgents', () => {
    test('registers all 6 agents to the registry', () => {
      initializeAgents()
      const agents = listRegisteredAgents()
      expect(agents).toHaveLength(6)
    })

    test('all agents are retrievable by name after initialization', () => {
      initializeAgents()

      expect(getAgent('orchestrator')).toBeDefined()
      expect(getAgent('game-designer')).toBeDefined()
      expect(getAgent('game-coder')).toBeDefined()
      expect(getAgent('scene-builder')).toBeDefined()
      expect(getAgent('debugger')).toBeDefined()
      expect(getAgent('reviewer')).toBeDefined()
    })

    test('registered agents match AGENT_DEFINITIONS', () => {
      initializeAgents()

      for (const def of AGENT_DEFINITIONS) {
        const registered = getAgent(def.name)
        expect(registered).toEqual(def)
      }
    })

    test('is idempotent (safe to call multiple times)', () => {
      initializeAgents()
      initializeAgents()

      const agents = listRegisteredAgents()
      expect(agents).toHaveLength(6)
    })
  })
})
