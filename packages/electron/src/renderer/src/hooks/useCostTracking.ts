import { useState, useCallback, useRef } from 'react'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface AgentUsageEntry {
  agent: string
  model: string
  usage: TokenUsage
}

interface UsageBreakdown {
  messages: number
  tokens: number
  cost: number
}

export interface UsageStats {
  totalMessages: number
  totalTokens: number
  totalCost: number
  byAgent: Record<string, UsageBreakdown>
  byModel: Record<string, UsageBreakdown>
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-opus-4.6': { input: 15, output: 75 },
  'anthropic/claude-sonnet-4-5': { input: 3, output: 15 },
  'openai/gpt-5.2': { input: 2.5, output: 10 },
  'openai/gpt-4.1': { input: 2, output: 8 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10 },
}

function estimateCostForModel(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    return (usage.inputTokens / 1_000_000) * 5 + (usage.outputTokens / 1_000_000) * 15
  }
  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  )
}

function buildStats(
  entries: Array<AgentUsageEntry & { cost: number }>
): UsageStats {
  const byAgent: Record<string, UsageBreakdown> = {}
  const byModel: Record<string, UsageBreakdown> = {}
  let totalTokens = 0
  let totalCost = 0

  for (const entry of entries) {
    totalTokens += entry.usage.totalTokens
    totalCost += entry.cost

    if (!byAgent[entry.agent]) {
      byAgent[entry.agent] = { messages: 0, tokens: 0, cost: 0 }
    }
    byAgent[entry.agent].messages += 1
    byAgent[entry.agent].tokens += entry.usage.totalTokens
    byAgent[entry.agent].cost += entry.cost

    if (!byModel[entry.model]) {
      byModel[entry.model] = { messages: 0, tokens: 0, cost: 0 }
    }
    byModel[entry.model].messages += 1
    byModel[entry.model].tokens += entry.usage.totalTokens
    byModel[entry.model].cost += entry.cost
  }

  return {
    totalMessages: entries.length,
    totalTokens,
    totalCost,
    byAgent,
    byModel,
  }
}

export function useCostTracking() {
  const entriesRef = useRef<Array<AgentUsageEntry & { cost: number }>>([])
  const [stats, setStats] = useState<UsageStats>({
    totalMessages: 0,
    totalTokens: 0,
    totalCost: 0,
    byAgent: {},
    byModel: {},
  })

  const recordUsage = useCallback((entry: AgentUsageEntry) => {
    const cost = estimateCostForModel(entry.model, entry.usage)
    entriesRef.current.push({ ...entry, cost })
    setStats(buildStats(entriesRef.current))
  }, [])

  const sessionCost = stats.totalCost

  const resetStats = useCallback(() => {
    entriesRef.current = []
    setStats({
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      byAgent: {},
      byModel: {},
    })
  }, [])

  return { stats, sessionCost, resetStats, recordUsage }
}
