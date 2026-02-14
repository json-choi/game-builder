import React, { useState } from 'react'
import type { UsageStats } from '../hooks/useCostTracking'

interface CostPanelProps {
  stats: UsageStats
  sessionCost: number
  onReset: () => void
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function formatTokens(count: number): string {
  if (count === 0) return '0'
  return count.toLocaleString()
}

export const CostPanel: React.FC<CostPanelProps> = ({ stats, sessionCost, onReset }) => {
  const [agentExpanded, setAgentExpanded] = useState(false)
  const [modelExpanded, setModelExpanded] = useState(false)

  const agentEntries = Object.entries(stats.byAgent)
  const modelEntries = Object.entries(stats.byModel)

  return (
    <div className="cost-panel">
      <div className="cost-panel__header">
        <span className="cost-panel__title">Usage &amp; Cost</span>
        <button className="cost-panel__reset-btn" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="cost-panel__summary">
        <div className="cost-panel__stat">
          <span className="cost-panel__stat-label">Messages</span>
          <span className="cost-panel__stat-value">{formatTokens(stats.totalMessages)}</span>
        </div>
        <div className="cost-panel__stat">
          <span className="cost-panel__stat-label">Tokens</span>
          <span className="cost-panel__stat-value">{formatTokens(stats.totalTokens)}</span>
        </div>
        <div className="cost-panel__stat cost-panel__stat--highlight">
          <span className="cost-panel__stat-label">Est. Cost</span>
          <span className="cost-panel__stat-value">{formatCost(sessionCost)}</span>
        </div>
      </div>

      {agentEntries.length > 0 && (
        <div className="cost-panel__section">
          <button
            className="cost-panel__section-toggle"
            onClick={() => setAgentExpanded(!agentExpanded)}
          >
            <span>{agentExpanded ? '\u25BC' : '\u25B6'} By Agent ({agentEntries.length})</span>
          </button>
          {agentExpanded && (
            <div className="cost-panel__breakdown">
              {agentEntries.map(([agent, data]) => (
                <div key={agent} className="cost-panel__breakdown-row">
                  <span className="cost-panel__breakdown-name">{agent}</span>
                  <span className="cost-panel__breakdown-detail">
                    {formatTokens(data.messages)} msgs &middot; {formatTokens(data.tokens)} tok &middot; {formatCost(data.cost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modelEntries.length > 0 && (
        <div className="cost-panel__section">
          <button
            className="cost-panel__section-toggle"
            onClick={() => setModelExpanded(!modelExpanded)}
          >
            <span>{modelExpanded ? '\u25BC' : '\u25B6'} By Model ({modelEntries.length})</span>
          </button>
          {modelExpanded && (
            <div className="cost-panel__breakdown">
              {modelEntries.map(([model, data]) => (
                <div key={model} className="cost-panel__breakdown-row">
                  <span className="cost-panel__breakdown-name">{model}</span>
                  <span className="cost-panel__breakdown-detail">
                    {formatTokens(data.messages)} msgs &middot; {formatTokens(data.tokens)} tok &middot; {formatCost(data.cost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stats.totalMessages === 0 && (
        <div className="cost-panel__empty">No usage data yet</div>
      )}
    </div>
  )
}
