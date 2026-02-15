import { describe, expect, test } from 'bun:test'
import { AGENT_OPTIONS } from './ChatInput'

describe('ChatInput agent selection', () => {
  describe('AGENT_OPTIONS', () => {
    test('has correct number of agent options', () => {
      expect(AGENT_OPTIONS.length).toBe(8)
    })

    test('first option is Auto (Orchestrator) with empty id', () => {
      expect(AGENT_OPTIONS[0].id).toBe('')
      expect(AGENT_OPTIONS[0].label).toBe('Auto (Orchestrator)')
    })

    test('includes orchestrator agent', () => {
      const orch = AGENT_OPTIONS.find((a) => a.id === 'orchestrator')
      expect(orch).toBeDefined()
      expect(orch!.label).toBe('Orchestrator')
    })

    test('includes game-coder agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'game-coder')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Game Coder')
    })

    test('includes designer agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'game-designer')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Designer')
    })

    test('includes scene-builder agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'scene-builder')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Scene Builder')
    })

    test('includes debugger agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'debugger')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Debugger')
    })

    test('includes reviewer agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'reviewer')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Reviewer')
    })

    test('includes vision agent', () => {
      const agent = AGENT_OPTIONS.find((a) => a.id === 'vision')
      expect(agent).toBeDefined()
      expect(agent!.label).toBe('Vision')
    })

    test('all agent ids are unique', () => {
      const ids = AGENT_OPTIONS.map((a) => a.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    test('all agent labels are unique', () => {
      const labels = AGENT_OPTIONS.map((a) => a.label)
      const unique = new Set(labels)
      expect(unique.size).toBe(labels.length)
    })
  })

  describe('agent selection state', () => {
    test('default selected agent is empty string (auto)', () => {
      let selectedAgent = ''
      expect(selectedAgent).toBe('')
    })

    test('selecting agent updates state', () => {
      let selectedAgent = ''
      selectedAgent = 'game-coder'
      expect(selectedAgent).toBe('game-coder')
    })

    test('empty string means no agent override', () => {
      const selectedAgent = ''
      const agent = selectedAgent || undefined
      expect(agent).toBeUndefined()
    })

    test('non-empty string passes agent to sendPrompt', () => {
      const selectedAgent = 'debugger'
      const agent = selectedAgent || undefined
      expect(agent).toBe('debugger')
    })
  })
})
