export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface CostEntry {
  agent: string
  model: string
  usage: TokenUsage
  estimatedCost: number // in USD
  timestamp: number
}

export interface UsageStats {
  totalMessages: number
  totalTokens: number
  totalCost: number
  byAgent: Record<string, { messages: number; tokens: number; cost: number }>
  byModel: Record<string, { messages: number; tokens: number; cost: number }>
}

// Cost per 1M tokens (input/output) for common models
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-opus-4.6': { input: 15, output: 75 },
  'anthropic/claude-sonnet-4-5': { input: 3, output: 15 },
  'openai/gpt-5.2': { input: 2.5, output: 10 },
  'openai/gpt-4.1': { input: 2, output: 8 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10 },
}

export interface CostTracker {
  recordUsage(entry: Omit<CostEntry, 'estimatedCost' | 'timestamp'>): void
  getStats(): UsageStats
  getSessionCost(): number
  reset(): void
  getEntries(): CostEntry[]
}

export function estimateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    // Fallback: use a conservative default pricing
    return (usage.inputTokens / 1_000_000) * 5 + (usage.outputTokens / 1_000_000) * 15
  }
  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  )
}

export function createCostTracker(): CostTracker {
  const entries: CostEntry[] = []

  function recordUsage(entry: Omit<CostEntry, 'estimatedCost' | 'timestamp'>): void {
    const cost = estimateCost(entry.model, entry.usage)
    entries.push({
      ...entry,
      estimatedCost: cost,
      timestamp: Date.now(),
    })
  }

  function getStats(): UsageStats {
    const byAgent: Record<string, { messages: number; tokens: number; cost: number }> = {}
    const byModel: Record<string, { messages: number; tokens: number; cost: number }> = {}
    let totalTokens = 0
    let totalCost = 0

    for (const entry of entries) {
      totalTokens += entry.usage.totalTokens
      totalCost += entry.estimatedCost

      if (!byAgent[entry.agent]) {
        byAgent[entry.agent] = { messages: 0, tokens: 0, cost: 0 }
      }
      byAgent[entry.agent].messages += 1
      byAgent[entry.agent].tokens += entry.usage.totalTokens
      byAgent[entry.agent].cost += entry.estimatedCost

      if (!byModel[entry.model]) {
        byModel[entry.model] = { messages: 0, tokens: 0, cost: 0 }
      }
      byModel[entry.model].messages += 1
      byModel[entry.model].tokens += entry.usage.totalTokens
      byModel[entry.model].cost += entry.estimatedCost
    }

    return {
      totalMessages: entries.length,
      totalTokens,
      totalCost,
      byAgent,
      byModel,
    }
  }

  function getSessionCost(): number {
    let total = 0
    for (const entry of entries) {
      total += entry.estimatedCost
    }
    return total
  }

  function reset(): void {
    entries.length = 0
  }

  function getEntries(): CostEntry[] {
    return [...entries]
  }

  return { recordUsage, getStats, getSessionCost, reset, getEntries }
}
