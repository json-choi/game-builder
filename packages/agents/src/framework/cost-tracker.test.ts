import { afterEach, describe, expect, test } from 'bun:test'
import { createCostTracker, estimateCost, type TokenUsage } from './cost-tracker'

function makeUsage(input: number, output: number): TokenUsage {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output }
}

describe('cost-tracker', () => {
  describe('estimateCost', () => {
    test('calculates cost for known model (claude-opus)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCost('anthropic/claude-opus-4.6', usage)
      // input: 15 per 1M, output: 75 per 1M => 15 + 75 = 90
      expect(cost).toBe(90)
    })

    test('calculates cost for known model (claude-sonnet)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCost('anthropic/claude-sonnet-4-5', usage)
      // input: 3 per 1M, output: 15 per 1M => 3 + 15 = 18
      expect(cost).toBe(18)
    })

    test('calculates cost for known model (gpt-5.2)', () => {
      const usage = makeUsage(2_000_000, 500_000)
      const cost = estimateCost('openai/gpt-5.2', usage)
      // input: 2 * 2.5 = 5, output: 0.5 * 10 = 5 => 10
      expect(cost).toBe(10)
    })

    test('calculates cost for known model (gemini-2.5-pro)', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCost('google/gemini-2.5-pro', usage)
      // input: 1.25 per 1M, output: 10 per 1M => 1.25 + 10 = 11.25
      expect(cost).toBe(11.25)
    })

    test('uses fallback pricing for unknown model', () => {
      const usage = makeUsage(1_000_000, 1_000_000)
      const cost = estimateCost('unknown/model', usage)
      // fallback: input * 5 + output * 15 = 5 + 15 = 20
      expect(cost).toBe(20)
    })

    test('returns 0 for zero tokens', () => {
      const usage = makeUsage(0, 0)
      expect(estimateCost('anthropic/claude-opus-4.6', usage)).toBe(0)
    })

    test('handles fractional token counts', () => {
      const usage = makeUsage(500_000, 250_000)
      const cost = estimateCost('anthropic/claude-opus-4.6', usage)
      // input: 0.5 * 15 = 7.5, output: 0.25 * 75 = 18.75 => 26.25
      expect(cost).toBe(26.25)
    })
  })

  describe('createCostTracker', () => {
    let tracker: ReturnType<typeof createCostTracker>

    afterEach(() => {
      tracker?.reset()
    })

    test('starts with empty entries', () => {
      tracker = createCostTracker()
      expect(tracker.getEntries()).toEqual([])
    })

    test('starts with zero session cost', () => {
      tracker = createCostTracker()
      expect(tracker.getSessionCost()).toBe(0)
    })

    describe('recordUsage', () => {
      test('records a usage entry with auto-calculated cost and timestamp', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'game-coder',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(1000, 500),
        })

        const entries = tracker.getEntries()
        expect(entries).toHaveLength(1)
        expect(entries[0].agent).toBe('game-coder')
        expect(entries[0].model).toBe('anthropic/claude-sonnet-4-5')
        expect(entries[0].usage.inputTokens).toBe(1000)
        expect(entries[0].usage.outputTokens).toBe(500)
        expect(entries[0].estimatedCost).toBeGreaterThan(0)
        expect(entries[0].timestamp).toBeGreaterThan(0)
      })

      test('records multiple entries', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'game-coder',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(1000, 500),
        })
        tracker.recordUsage({
          agent: 'debugger',
          model: 'openai/gpt-4.1',
          usage: makeUsage(2000, 1000),
        })

        expect(tracker.getEntries()).toHaveLength(2)
      })
    })

    describe('getStats', () => {
      test('returns zeroed stats when no entries', () => {
        tracker = createCostTracker()
        const stats = tracker.getStats()
        expect(stats.totalMessages).toBe(0)
        expect(stats.totalTokens).toBe(0)
        expect(stats.totalCost).toBe(0)
        expect(stats.byAgent).toEqual({})
        expect(stats.byModel).toEqual({})
      })

      test('aggregates stats correctly across entries', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'game-coder',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(1000, 500),
        })
        tracker.recordUsage({
          agent: 'game-coder',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(2000, 1000),
        })
        tracker.recordUsage({
          agent: 'debugger',
          model: 'openai/gpt-4.1',
          usage: makeUsage(500, 200),
        })

        const stats = tracker.getStats()
        expect(stats.totalMessages).toBe(3)
        expect(stats.totalTokens).toBe(1500 + 3000 + 700)

        // byAgent
        expect(stats.byAgent['game-coder'].messages).toBe(2)
        expect(stats.byAgent['game-coder'].tokens).toBe(1500 + 3000)
        expect(stats.byAgent['debugger'].messages).toBe(1)
        expect(stats.byAgent['debugger'].tokens).toBe(700)

        // byModel
        expect(stats.byModel['anthropic/claude-sonnet-4-5'].messages).toBe(2)
        expect(stats.byModel['openai/gpt-4.1'].messages).toBe(1)
      })

      test('aggregates cost correctly', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'a',
          model: 'anthropic/claude-opus-4.6',
          usage: makeUsage(1_000_000, 1_000_000),
        })

        const stats = tracker.getStats()
        expect(stats.totalCost).toBe(90) // 15 + 75
        expect(stats.byAgent['a'].cost).toBe(90)
        expect(stats.byModel['anthropic/claude-opus-4.6'].cost).toBe(90)
      })
    })

    describe('getSessionCost', () => {
      test('sums up all entry costs', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'a',
          model: 'anthropic/claude-opus-4.6',
          usage: makeUsage(1_000_000, 0),
        })
        tracker.recordUsage({
          agent: 'b',
          model: 'anthropic/claude-opus-4.6',
          usage: makeUsage(0, 1_000_000),
        })

        // 15 + 75 = 90
        expect(tracker.getSessionCost()).toBe(90)
      })
    })

    describe('reset', () => {
      test('clears all entries', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'a',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(1000, 500),
        })
        expect(tracker.getEntries()).toHaveLength(1)

        tracker.reset()
        expect(tracker.getEntries()).toEqual([])
        expect(tracker.getSessionCost()).toBe(0)
        expect(tracker.getStats().totalMessages).toBe(0)
      })

      test('is safe to call on empty tracker', () => {
        tracker = createCostTracker()
        tracker.reset()
        expect(tracker.getEntries()).toEqual([])
      })
    })

    describe('getEntries', () => {
      test('returns a copy, not the internal array', () => {
        tracker = createCostTracker()
        tracker.recordUsage({
          agent: 'a',
          model: 'anthropic/claude-sonnet-4-5',
          usage: makeUsage(100, 50),
        })

        const entries1 = tracker.getEntries()
        const entries2 = tracker.getEntries()
        expect(entries1).not.toBe(entries2)
        expect(entries1).toEqual(entries2)
      })
    })
  })
})
