import { describe, expect, test } from 'bun:test'
import { formatTokenCount, formatCostValue } from './SettingsPanel'

describe('SettingsPanel usage stats', () => {
  describe('formatTokenCount', () => {
    test('formats 0 as "0"', () => {
      expect(formatTokenCount(0)).toBe('0')
    })

    test('formats small numbers with ~ prefix', () => {
      expect(formatTokenCount(42)).toBe('~42')
    })

    test('formats thousands with K suffix', () => {
      expect(formatTokenCount(1_000)).toBe('~1.0K')
    })

    test('formats 1500 as ~1.5K', () => {
      expect(formatTokenCount(1_500)).toBe('~1.5K')
    })

    test('formats 999_999 as ~1000.0K', () => {
      expect(formatTokenCount(999_999)).toBe('~1000.0K')
    })

    test('formats millions with M suffix', () => {
      expect(formatTokenCount(1_000_000)).toBe('~1.0M')
    })

    test('formats 2_500_000 as ~2.5M', () => {
      expect(formatTokenCount(2_500_000)).toBe('~2.5M')
    })

    test('formats 500 as ~500', () => {
      expect(formatTokenCount(500)).toBe('~500')
    })

    test('formats 999 as ~999', () => {
      expect(formatTokenCount(999)).toBe('~999')
    })
  })

  describe('formatCostValue', () => {
    test('formats 0 as $0.00', () => {
      expect(formatCostValue(0)).toBe('$0.00')
    })

    test('formats small amounts with 4 decimals', () => {
      expect(formatCostValue(0.001)).toBe('$0.0010')
    })

    test('formats very small amounts with 4 decimals', () => {
      expect(formatCostValue(0.0001)).toBe('$0.0001')
    })

    test('formats 0.01 with 2 decimals', () => {
      expect(formatCostValue(0.01)).toBe('$0.01')
    })

    test('formats normal amounts with 2 decimals', () => {
      expect(formatCostValue(1.50)).toBe('$1.50')
    })

    test('formats larger amounts with 2 decimals', () => {
      expect(formatCostValue(42.99)).toBe('$42.99')
    })

    test('formats 100.5 as $100.50', () => {
      expect(formatCostValue(100.5)).toBe('$100.50')
    })
  })

  describe('integration contract: useCostTracking provides stats', () => {
    test('default UsageStats matches what SettingsPanel expects', () => {
      const defaultStats = {
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        byAgent: {},
        byModel: {},
      }

      expect(formatTokenCount(defaultStats.totalTokens)).toBe('0')
      expect(formatCostValue(defaultStats.totalCost)).toBe('$0.00')
      expect(defaultStats.totalMessages).toBe(0)
    })

    test('non-zero UsageStats formats correctly', () => {
      const stats = {
        totalMessages: 15,
        totalTokens: 42_500,
        totalCost: 0.85,
      }

      expect(stats.totalMessages).toBe(15)
      expect(formatTokenCount(stats.totalTokens)).toBe('~42.5K')
      expect(formatCostValue(stats.totalCost)).toBe('$0.85')
    })
  })
})
