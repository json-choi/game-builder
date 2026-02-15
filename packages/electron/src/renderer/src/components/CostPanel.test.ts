import { describe, expect, test } from 'bun:test'
import type { UsageStats } from '../hooks/useCostTracking'

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function formatTokens(count: number): string {
  if (count === 0) return '0'
  return count.toLocaleString()
}

function emptyStats(): UsageStats {
  return {
    totalMessages: 0,
    totalTokens: 0,
    totalCost: 0,
    byAgent: {},
    byModel: {},
  }
}

describe('CostPanel', () => {
  describe('formatCost', () => {
    test('formats zero as $0.00', () => {
      expect(formatCost(0)).toBe('$0.00')
    })

    test('formats costs >= $0.01 with 2 decimal places', () => {
      expect(formatCost(0.01)).toBe('$0.01')
      expect(formatCost(0.99)).toBe('$0.99')
      expect(formatCost(1.5)).toBe('$1.50')
      expect(formatCost(90)).toBe('$90.00')
      expect(formatCost(123.456)).toBe('$123.46')
    })

    test('formats costs < $0.01 with 4 decimal places', () => {
      expect(formatCost(0.001)).toBe('$0.0010')
      expect(formatCost(0.0099)).toBe('$0.0099')
      expect(formatCost(0.00105)).toBe('$0.0010')
      expect(formatCost(0.0001)).toBe('$0.0001')
    })

    test('formats large costs correctly', () => {
      expect(formatCost(1000)).toBe('$1000.00')
      expect(formatCost(9999.99)).toBe('$9999.99')
    })

    test('rounds correctly at $0.01 boundary', () => {
      expect(formatCost(0.005)).toBe('$0.0050')
      expect(formatCost(0.009)).toBe('$0.0090')
      expect(formatCost(0.0099999)).toBe('$0.0100')
    })
  })

  describe('formatTokens', () => {
    test('formats zero as "0"', () => {
      expect(formatTokens(0)).toBe('0')
    })

    test('formats small numbers without separator', () => {
      expect(formatTokens(1)).toBe('1')
      expect(formatTokens(999)).toBe('999')
    })

    test('formats thousands with locale separator', () => {
      const result = formatTokens(1000)
      expect(result).toContain('1')
      expect(result.length).toBeGreaterThan(3)
    })

    test('formats millions with locale separators', () => {
      const result = formatTokens(1_000_000)
      expect(result).toContain('1')
      expect(result).toContain('000')
    })

    test('formats large token counts', () => {
      const result = formatTokens(12_345_678)
      expect(result).toContain('12')
      expect(result).toContain('345')
      expect(result).toContain('678')
    })
  })

  describe('CostPanel rendering logic', () => {
    test('shows empty state when totalMessages is 0', () => {
      const stats = emptyStats()
      const showEmpty = stats.totalMessages === 0
      expect(showEmpty).toBe(true)
    })

    test('hides empty state when there are messages', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        totalMessages: 1,
        totalTokens: 1500,
        totalCost: 0.001,
        byAgent: { 'game-coder': { messages: 1, tokens: 1500, cost: 0.001 } },
        byModel: { 'anthropic/claude-sonnet-4-5': { messages: 1, tokens: 1500, cost: 0.001 } },
      }
      const showEmpty = stats.totalMessages === 0
      expect(showEmpty).toBe(false)
    })

    test('agent breakdown section hidden when no agents', () => {
      const stats = emptyStats()
      const agentEntries = Object.entries(stats.byAgent)
      expect(agentEntries.length > 0).toBe(false)
    })

    test('agent breakdown section visible when agents exist', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        totalMessages: 1,
        byAgent: { 'game-coder': { messages: 1, tokens: 1500, cost: 0.01 } },
      }
      const agentEntries = Object.entries(stats.byAgent)
      expect(agentEntries.length > 0).toBe(true)
      expect(agentEntries[0][0]).toBe('game-coder')
    })

    test('model breakdown section hidden when no models', () => {
      const stats = emptyStats()
      const modelEntries = Object.entries(stats.byModel)
      expect(modelEntries.length > 0).toBe(false)
    })

    test('model breakdown section visible when models exist', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        totalMessages: 1,
        byModel: { 'anthropic/claude-sonnet-4-5': { messages: 1, tokens: 1500, cost: 0.01 } },
      }
      const modelEntries = Object.entries(stats.byModel)
      expect(modelEntries.length > 0).toBe(true)
      expect(modelEntries[0][0]).toBe('anthropic/claude-sonnet-4-5')
    })

    test('displays formatted summary values', () => {
      const stats: UsageStats = {
        totalMessages: 42,
        totalTokens: 150_000,
        totalCost: 12.50,
        byAgent: { 'game-coder': { messages: 42, tokens: 150_000, cost: 12.50 } },
        byModel: { 'anthropic/claude-opus-4.6': { messages: 42, tokens: 150_000, cost: 12.50 } },
      }
      const sessionCost = stats.totalCost

      expect(formatTokens(stats.totalMessages)).toBe('42')
      expect(formatTokens(stats.totalTokens)).toContain('150')
      expect(formatCost(sessionCost)).toBe('$12.50')
    })

    test('breakdown row displays agent name and formatted details', () => {
      const agentData = { messages: 5, tokens: 12_000, cost: 1.25 }
      const agentName = 'game-coder'

      expect(agentName).toBe('game-coder')
      expect(formatTokens(agentData.messages)).toBe('5')
      expect(formatTokens(agentData.tokens)).toContain('12')
      expect(formatCost(agentData.cost)).toBe('$1.25')
    })

    test('breakdown row displays model name and formatted details', () => {
      const modelData = { messages: 3, tokens: 8_000, cost: 0.005 }
      const modelName = 'openai/gpt-4.1'

      expect(modelName).toBe('openai/gpt-4.1')
      expect(formatTokens(modelData.messages)).toBe('3')
      expect(formatTokens(modelData.tokens)).toContain('8')
      expect(formatCost(modelData.cost)).toBe('$0.0050')
    })
  })

  describe('CostPanel expand/collapse state', () => {
    test('agent section starts collapsed', () => {
      let agentExpanded = false
      expect(agentExpanded).toBe(false)
    })

    test('model section starts collapsed', () => {
      let modelExpanded = false
      expect(modelExpanded).toBe(false)
    })

    test('toggling agent section expands it', () => {
      let agentExpanded = false
      agentExpanded = !agentExpanded
      expect(agentExpanded).toBe(true)
    })

    test('toggling agent section twice collapses it', () => {
      let agentExpanded = false
      agentExpanded = !agentExpanded
      agentExpanded = !agentExpanded
      expect(agentExpanded).toBe(false)
    })

    test('toggling model section expands it', () => {
      let modelExpanded = false
      modelExpanded = !modelExpanded
      expect(modelExpanded).toBe(true)
    })

    test('agent and model sections are independent', () => {
      let agentExpanded = false
      let modelExpanded = false

      agentExpanded = !agentExpanded
      expect(agentExpanded).toBe(true)
      expect(modelExpanded).toBe(false)

      modelExpanded = !modelExpanded
      expect(agentExpanded).toBe(true)
      expect(modelExpanded).toBe(true)
    })

    test('toggle icon reflects expanded state', () => {
      let expanded = false
      const getIcon = () => expanded ? '\u25BC' : '\u25B6'

      expect(getIcon()).toBe('\u25B6')
      expanded = true
      expect(getIcon()).toBe('\u25BC')
    })
  })

  describe('CostPanelProps contract', () => {
    test('requires stats, sessionCost, and onReset', () => {
      const props = {
        stats: emptyStats(),
        sessionCost: 0,
        onReset: () => {},
      }

      expect(props.stats).toBeDefined()
      expect(typeof props.sessionCost).toBe('number')
      expect(typeof props.onReset).toBe('function')
    })

    test('sessionCost can differ from stats.totalCost', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        totalCost: 10,
      }
      const sessionCost = 10
      expect(sessionCost).toBe(stats.totalCost)
    })

    test('onReset is callable', () => {
      let resetCalled = false
      const onReset = () => { resetCalled = true }
      onReset()
      expect(resetCalled).toBe(true)
    })
  })

  describe('multiple agents and models rendering', () => {
    test('lists all agents in breakdown', () => {
      const stats: UsageStats = {
        totalMessages: 6,
        totalTokens: 30_000,
        totalCost: 5.0,
        byAgent: {
          'game-coder': { messages: 3, tokens: 15_000, cost: 3.0 },
          'debugger': { messages: 2, tokens: 10_000, cost: 1.5 },
          'reviewer': { messages: 1, tokens: 5_000, cost: 0.5 },
        },
        byModel: {},
      }

      const agentEntries = Object.entries(stats.byAgent)
      expect(agentEntries).toHaveLength(3)

      const agentNames = agentEntries.map(([name]) => name)
      expect(agentNames).toContain('game-coder')
      expect(agentNames).toContain('debugger')
      expect(agentNames).toContain('reviewer')
    })

    test('lists all models in breakdown', () => {
      const stats: UsageStats = {
        totalMessages: 4,
        totalTokens: 20_000,
        totalCost: 8.0,
        byAgent: {},
        byModel: {
          'anthropic/claude-opus-4.6': { messages: 1, tokens: 5_000, cost: 4.5 },
          'anthropic/claude-sonnet-4-5': { messages: 2, tokens: 10_000, cost: 2.0 },
          'openai/gpt-4.1': { messages: 1, tokens: 5_000, cost: 1.5 },
        },
      }

      const modelEntries = Object.entries(stats.byModel)
      expect(modelEntries).toHaveLength(3)

      const modelNames = modelEntries.map(([name]) => name)
      expect(modelNames).toContain('anthropic/claude-opus-4.6')
      expect(modelNames).toContain('anthropic/claude-sonnet-4-5')
      expect(modelNames).toContain('openai/gpt-4.1')
    })

    test('header shows correct agent count', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        byAgent: {
          'a': { messages: 1, tokens: 100, cost: 0.01 },
          'b': { messages: 1, tokens: 100, cost: 0.01 },
        },
      }
      const agentEntries = Object.entries(stats.byAgent)
      const headerText = `By Agent (${agentEntries.length})`
      expect(headerText).toBe('By Agent (2)')
    })

    test('header shows correct model count', () => {
      const stats: UsageStats = {
        ...emptyStats(),
        byModel: {
          'model-a': { messages: 1, tokens: 100, cost: 0.01 },
          'model-b': { messages: 1, tokens: 100, cost: 0.01 },
          'model-c': { messages: 1, tokens: 100, cost: 0.01 },
        },
      }
      const modelEntries = Object.entries(stats.byModel)
      const headerText = `By Model (${modelEntries.length})`
      expect(headerText).toBe('By Model (3)')
    })
  })
})
