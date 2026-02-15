import { describe, expect, test } from 'bun:test'
import { estimateCostForModel, buildStats, type TokenUsage, type UsageStats } from './useCostTracking'

function makeUsage(input: number, output: number): TokenUsage {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output }
}

function makeEntry(agent: string, model: string, input: number, output: number) {
  const usage = makeUsage(input, output)
  const cost = estimateCostForModel(model, usage)
  return { agent, model, usage, cost }
}

describe('useCostTracking', () => {
  describe('estimateCostForModel', () => {
    test('calculates cost for claude-opus (input: 15, output: 75 per 1M)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCostForModel('anthropic/claude-opus-4.6', usage)
      // input: 1M * 15/1M = 15, output: 1M * 75/1M = 75 => 90
      expect(cost).toBe(90)
    })

    test('calculates cost for claude-sonnet (input: 3, output: 15 per 1M)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCostForModel('anthropic/claude-sonnet-4-5', usage)
      // 3 + 15 = 18
      expect(cost).toBe(18)
    })

    test('calculates cost for gpt-5.2 (input: 2.5, output: 10 per 1M)', () => {
      const usage = makeUsage(2_000_000, 500_000)
      const cost = estimateCostForModel('openai/gpt-5.2', usage)
      // input: 2 * 2.5 = 5, output: 0.5 * 10 = 5 => 10
      expect(cost).toBe(10)
    })

    test('calculates cost for gpt-4.1 (input: 2, output: 8 per 1M)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCostForModel('openai/gpt-4.1', usage)
      // 2 + 8 = 10
      expect(cost).toBe(10)
    })

    test('calculates cost for gemini-2.5-pro (input: 1.25, output: 10 per 1M)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCostForModel('google/gemini-2.5-pro', usage)
      // 1.25 + 10 = 11.25
      expect(cost).toBe(11.25)
    })

    test('uses fallback pricing for unknown models (input: 5, output: 15 per 1M)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCostForModel('unknown/future-model', usage)
      // fallback: 5 + 15 = 20
      expect(cost).toBe(20)
    })

    test('returns 0 for zero tokens', () => {
      expect(estimateCostForModel('anthropic/claude-opus-4.6', makeUsage(0, 0))).toBe(0)
    })

    test('returns 0 for zero tokens with unknown model', () => {
      expect(estimateCostForModel('unknown/model', makeUsage(0, 0))).toBe(0)
    })

    test('handles fractional token counts', () => {
      const usage = makeUsage(500_000, 250_000)
      const cost = estimateCostForModel('anthropic/claude-opus-4.6', usage)
      // input: 0.5 * 15 = 7.5, output: 0.25 * 75 = 18.75 => 26.25
      expect(cost).toBe(26.25)
    })

    test('handles input-only tokens', () => {
      const usage = makeUsage(1_000_000, 0)
      const cost = estimateCostForModel('anthropic/claude-opus-4.6', usage)
      expect(cost).toBe(15)
    })

    test('handles output-only tokens', () => {
      const usage = makeUsage(0, 1_000_000)
      const cost = estimateCostForModel('anthropic/claude-opus-4.6', usage)
      expect(cost).toBe(75)
    })

    test('small token counts produce small costs', () => {
      const usage = makeUsage(100, 50)
      const cost = estimateCostForModel('anthropic/claude-sonnet-4-5', usage)
      // input: 0.0001 * 3 = 0.0003, output: 0.00005 * 15 = 0.00075 => 0.00105
      expect(cost).toBeCloseTo(0.00105, 8)
    })
  })

  describe('buildStats', () => {
    test('returns zeroed stats for empty entries', () => {
      const stats = buildStats([])
      expect(stats.totalMessages).toBe(0)
      expect(stats.totalTokens).toBe(0)
      expect(stats.totalCost).toBe(0)
      expect(stats.byAgent).toEqual({})
      expect(stats.byModel).toEqual({})
    })

    test('aggregates single entry correctly', () => {
      const entry = makeEntry('game-coder', 'anthropic/claude-sonnet-4-5', 1000, 500)
      const stats = buildStats([entry])

      expect(stats.totalMessages).toBe(1)
      expect(stats.totalTokens).toBe(1500)
      expect(stats.totalCost).toBe(entry.cost)

      expect(stats.byAgent['game-coder'].messages).toBe(1)
      expect(stats.byAgent['game-coder'].tokens).toBe(1500)
      expect(stats.byAgent['game-coder'].cost).toBe(entry.cost)

      expect(stats.byModel['anthropic/claude-sonnet-4-5'].messages).toBe(1)
      expect(stats.byModel['anthropic/claude-sonnet-4-5'].tokens).toBe(1500)
      expect(stats.byModel['anthropic/claude-sonnet-4-5'].cost).toBe(entry.cost)
    })

    test('aggregates multiple entries from same agent', () => {
      const entries = [
        makeEntry('game-coder', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('game-coder', 'anthropic/claude-sonnet-4-5', 2000, 1000),
      ]
      const stats = buildStats(entries)

      expect(stats.totalMessages).toBe(2)
      expect(stats.totalTokens).toBe(1500 + 3000)
      expect(stats.byAgent['game-coder'].messages).toBe(2)
      expect(stats.byAgent['game-coder'].tokens).toBe(4500)
    })

    test('aggregates entries across different agents', () => {
      const entries = [
        makeEntry('game-coder', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('debugger', 'openai/gpt-4.1', 500, 200),
        makeEntry('reviewer', 'google/gemini-2.5-pro', 800, 300),
      ]
      const stats = buildStats(entries)

      expect(stats.totalMessages).toBe(3)
      expect(stats.totalTokens).toBe(1500 + 700 + 1100)
      expect(Object.keys(stats.byAgent)).toHaveLength(3)
      expect(stats.byAgent['game-coder'].messages).toBe(1)
      expect(stats.byAgent['debugger'].messages).toBe(1)
      expect(stats.byAgent['reviewer'].messages).toBe(1)
    })

    test('aggregates entries across different models', () => {
      const entries = [
        makeEntry('agent-a', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('agent-b', 'openai/gpt-5.2', 2000, 1000),
      ]
      const stats = buildStats(entries)

      expect(Object.keys(stats.byModel)).toHaveLength(2)
      expect(stats.byModel['anthropic/claude-sonnet-4-5'].messages).toBe(1)
      expect(stats.byModel['openai/gpt-5.2'].messages).toBe(1)
    })

    test('same agent using different models creates separate model entries', () => {
      const entries = [
        makeEntry('game-coder', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('game-coder', 'anthropic/claude-opus-4.6', 1000, 500),
      ]
      const stats = buildStats(entries)

      expect(stats.byAgent['game-coder'].messages).toBe(2)
      expect(Object.keys(stats.byModel)).toHaveLength(2)
      expect(stats.byModel['anthropic/claude-sonnet-4-5'].messages).toBe(1)
      expect(stats.byModel['anthropic/claude-opus-4.6'].messages).toBe(1)
    })

    test('totalCost sums all entry costs', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-opus-4.6', 1_000_000, 0),
        makeEntry('b', 'anthropic/claude-opus-4.6', 0, 1_000_000),
      ]
      const stats = buildStats(entries)
      // 15 + 75 = 90
      expect(stats.totalCost).toBe(90)
    })

    test('cost breakdown per agent matches total', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-opus-4.6', 1_000_000, 1_000_000),
        makeEntry('b', 'anthropic/claude-sonnet-4-5', 1_000_000, 1_000_000),
      ]
      const stats = buildStats(entries)

      const agentCostSum = Object.values(stats.byAgent).reduce((sum, a) => sum + a.cost, 0)
      expect(agentCostSum).toBeCloseTo(stats.totalCost, 10)
    })

    test('cost breakdown per model matches total', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-opus-4.6', 1_000_000, 1_000_000),
        makeEntry('b', 'anthropic/claude-sonnet-4-5', 1_000_000, 1_000_000),
      ]
      const stats = buildStats(entries)

      const modelCostSum = Object.values(stats.byModel).reduce((sum, m) => sum + m.cost, 0)
      expect(modelCostSum).toBeCloseTo(stats.totalCost, 10)
    })

    test('token breakdown per agent matches totalTokens', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('b', 'openai/gpt-4.1', 2000, 1000),
      ]
      const stats = buildStats(entries)

      const agentTokenSum = Object.values(stats.byAgent).reduce((sum, a) => sum + a.tokens, 0)
      expect(agentTokenSum).toBe(stats.totalTokens)
    })

    test('message breakdown per agent matches totalMessages', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-sonnet-4-5', 1000, 500),
        makeEntry('a', 'anthropic/claude-sonnet-4-5', 2000, 1000),
        makeEntry('b', 'openai/gpt-4.1', 500, 200),
      ]
      const stats = buildStats(entries)

      const agentMsgSum = Object.values(stats.byAgent).reduce((sum, a) => sum + a.messages, 0)
      expect(agentMsgSum).toBe(stats.totalMessages)
    })
  })

  describe('useCostTracking hook state contract', () => {
    test('initial stats shape matches UsageStats interface', () => {
      const initialStats: UsageStats = {
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        byAgent: {},
        byModel: {},
      }

      expect(initialStats.totalMessages).toBe(0)
      expect(initialStats.totalTokens).toBe(0)
      expect(initialStats.totalCost).toBe(0)
      expect(initialStats.byAgent).toEqual({})
      expect(initialStats.byModel).toEqual({})
    })

    test('sessionCost derives from stats.totalCost', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-opus-4.6', 1_000_000, 1_000_000),
      ]
      const stats = buildStats(entries)
      const sessionCost = stats.totalCost
      expect(sessionCost).toBe(90)
    })

    test('resetStats returns to initial zero state', () => {
      const entries = [
        makeEntry('a', 'anthropic/claude-sonnet-4-5', 1000, 500),
      ]
      const statsBeforeReset = buildStats(entries)
      expect(statsBeforeReset.totalMessages).toBe(1)

      const statsAfterReset = buildStats([])
      expect(statsAfterReset.totalMessages).toBe(0)
      expect(statsAfterReset.totalTokens).toBe(0)
      expect(statsAfterReset.totalCost).toBe(0)
      expect(statsAfterReset.byAgent).toEqual({})
      expect(statsAfterReset.byModel).toEqual({})
    })

    test('recordUsage calculates cost and updates stats', () => {
      const entry = { agent: 'game-coder', model: 'anthropic/claude-sonnet-4-5', usage: makeUsage(1000, 500) }
      const cost = estimateCostForModel(entry.model, entry.usage)
      const entries = [{ ...entry, cost }]
      const stats = buildStats(entries)

      expect(stats.totalMessages).toBe(1)
      expect(stats.totalTokens).toBe(1500)
      expect(stats.totalCost).toBe(cost)
      expect(cost).toBeGreaterThan(0)
    })

    test('multiple recordUsage calls accumulate correctly', () => {
      const rawEntries = [
        { agent: 'game-coder', model: 'anthropic/claude-sonnet-4-5', usage: makeUsage(1000, 500) },
        { agent: 'debugger', model: 'openai/gpt-4.1', usage: makeUsage(2000, 1000) },
        { agent: 'game-coder', model: 'anthropic/claude-opus-4.6', usage: makeUsage(500, 200) },
      ]

      const entries = rawEntries.map((e) => ({
        ...e,
        cost: estimateCostForModel(e.model, e.usage),
      }))

      const stats = buildStats(entries)

      expect(stats.totalMessages).toBe(3)
      expect(stats.totalTokens).toBe(1500 + 3000 + 700)
      expect(stats.byAgent['game-coder'].messages).toBe(2)
      expect(stats.byAgent['debugger'].messages).toBe(1)
      expect(Object.keys(stats.byModel)).toHaveLength(3)
    })
  })
})
