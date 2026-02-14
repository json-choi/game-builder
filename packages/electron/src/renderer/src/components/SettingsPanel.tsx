/// <reference path="../types/global.d.ts" />
import React, { useEffect, useState } from 'react'

interface AgentConfig {
  name: string
  label: string
  modelId: string
}

const AGENT_DEFINITIONS: Array<{ name: string; label: string }> = [
  { name: 'orchestrator', label: 'Orchestrator' },
  { name: 'game-designer', label: 'Game Designer' },
  { name: 'scene-builder', label: 'Scene Builder' },
  { name: 'game-coder', label: 'Game Coder' },
  { name: 'debugger', label: 'Debugger' },
  { name: 'reviewer', label: 'Reviewer' }
]

const MASK = '••••••••••••••••'

interface KeyInputProps {
  providerId: string
  isConnected: boolean
  isRevealed: boolean
  userInput: string
  storedKey: string
  onInputChange: (providerId: string, value: string) => void
  onToggleReveal: (providerId: string) => void
}

const KeyInput: React.FC<KeyInputProps> = ({
  providerId, isConnected, isRevealed, userInput, storedKey,
  onInputChange, onToggleReveal
}) => {
  const showingStored = isRevealed && !userInput && !!storedKey
  const showingMask = isConnected && !userInput && !isRevealed

  let displayValue = userInput
  if (!userInput) {
    if (isRevealed && storedKey) displayValue = storedKey
    else if (isConnected && !isRevealed) displayValue = MASK
  }

  return (
    <div className="settings-input-wrapper">
      <input
        type="text"
        className={`settings-input${showingMask ? ' settings-input--masked' : ''}`}
        placeholder={isConnected ? '' : 'Enter API Key'}
        value={displayValue}
        onChange={(e) => onInputChange(providerId, e.target.value)}
        onFocus={() => {
          if (showingMask) onInputChange(providerId, '')
        }}
        readOnly={showingStored}
      />
      <button
        className="settings-icon-btn"
        onClick={() => onToggleReveal(providerId)}
      >
        {isRevealed ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export const SettingsPanel: React.FC = () => {
  const [providers, setProviders] = useState<ProviderPreset[]>([])
  const [authStatus, setAuthStatus] = useState<Record<string, boolean>>({})
  const [activeProvider, setActiveProvider] = useState<{ providerId: string | null; modelId: string | null }>({
    providerId: null,
    modelId: null
  })
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null)
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [storedKeys, setStoredKeys] = useState<Record<string, string>>({})
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({})
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(
    AGENT_DEFINITIONS.map((a) => ({ ...a, modelId: '' }))
  )

  const settingsApi = window.api.settings

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [fetchedProviders, fetchedAuth, fetchedActive, fetchedAgentConfigs] = await Promise.all([
        settingsApi.getProviders(),
        settingsApi.getAuthStatus(),
        settingsApi.getActiveProvider(),
        settingsApi.getAgentConfigs()
      ])

      setProviders(fetchedProviders)
      setAuthStatus(fetchedAuth)
      setActiveProvider(fetchedActive)

      if (fetchedAgentConfigs.length > 0) {
        setAgentConfigs((prev) =>
          prev.map((a) => {
            const saved = fetchedAgentConfigs.find((c: AgentModelConfig) => c.name === a.name)
            return saved ? { ...a, modelId: saved.modelId } : a
          })
        )
      }

      const newSelectedModels: Record<string, string> = {}
      fetchedProviders.forEach((p) => {
        if (fetchedActive.providerId === p.id && fetchedActive.modelId) {
          newSelectedModels[p.id] = fetchedActive.modelId
        } else if (p.models.length > 0) {
          newSelectedModels[p.id] = p.models[0].id
        }
      })
      
      setSelectedModels((prev) => ({ ...newSelectedModels, ...prev }))
    } catch (error) {
      console.error('Failed to load settings data:', error)
    }
  }

  const toggleExpand = (providerId: string) => {
    setExpandedProviderId(expandedProviderId === providerId ? null : providerId)
  }

  const handleKeyChange = (providerId: string, value: string) => {
    setInputKeys((prev) => ({ ...prev, [providerId]: value }))
  }

  const toggleShowKey = async (providerId: string) => {
    const isCurrentlyShown = showKey[providerId]
    if (!isCurrentlyShown && !inputKeys[providerId] && authStatus[providerId]) {
      try {
        const key = await settingsApi.getStoredKey(providerId)
        if (key) {
          setStoredKeys((prev) => ({ ...prev, [providerId]: key }))
        }
      } catch {}
    }
    if (isCurrentlyShown) {
      setStoredKeys((prev) => {
        const next = { ...prev }
        delete next[providerId]
        return next
      })
    }
    setShowKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }

  const handleSaveKey = async (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation()
    const key = inputKeys[providerId]
    if (!key?.trim()) return
    
    try {
      await settingsApi.setAuthKey(providerId, key.trim())
      setInputKeys((prev) => ({ ...prev, [providerId]: '' }))
      setStoredKeys((prev) => {
        const next = { ...prev }
        delete next[providerId]
        return next
      })
      setShowKey((prev) => ({ ...prev, [providerId]: false }))
      await loadData()
    } catch (err) {
      console.error('Failed to save API key:', err)
    }
  }

  const handleRemoveKey = async (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation()
    await settingsApi.removeAuth(providerId)
    setInputKeys((prev) => ({ ...prev, [providerId]: '' }))
    setStoredKeys((prev) => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    setShowKey((prev) => ({ ...prev, [providerId]: false }))
    await loadData()
  }

  const handleModelChange = (providerId: string, modelId: string) => {
    setSelectedModels((prev) => ({ ...prev, [providerId]: modelId }))
  }

  const handleSetActive = async (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation()
    const modelId = selectedModels[providerId]
    if (!modelId) return
    
    await settingsApi.setActiveProvider(providerId, modelId)
    await loadData()
  }

  const handleAgentModelChange = (agentName: string, modelId: string) => {
    setAgentConfigs((prev) => {
      const updated = prev.map((a) => (a.name === agentName ? { ...a, modelId } : a))
      settingsApi.setAgentConfigs(
        updated.map((a) => ({ name: a.name, modelId: a.modelId }))
      )
      return updated
    })
  }

  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ id: `${p.id}/${m.id}`, label: `${p.name} — ${m.name}` }))
  )

  return (
    <div className="settings-panel">
      <div className="settings-section-title">AI Providers</div>
      <div className="settings-provider-list">
        {providers.map((provider) => {
          const isConnected = authStatus[provider.id]
          const isActive = activeProvider.providerId === provider.id
          const isExpanded = expandedProviderId === provider.id
          const currentModelId = selectedModels[provider.id] || (provider.models[0]?.id)

          return (
            <div 
              key={provider.id} 
              className={`settings-provider-card ${isActive ? 'settings-provider-card--active' : ''}`}
              onClick={() => toggleExpand(provider.id)}
            >
              <div className="settings-provider-header">
                <div className="settings-provider-info">
                  <div className={`settings-status-dot ${isConnected ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`} />
                  <span className="settings-provider-name">{provider.name}</span>
                  {isActive && <span className="settings-active-badge">Active</span>}
                </div>
                <div className="settings-provider-arrow">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>

              {isExpanded && (
                <div className="settings-provider-details" onClick={(e) => e.stopPropagation()}>
                  <div className="settings-field-group">
                    <label>API Key</label>
                    <KeyInput
                      providerId={provider.id}
                      isConnected={isConnected}
                      isRevealed={!!showKey[provider.id]}
                      userInput={inputKeys[provider.id] || ''}
                      storedKey={storedKeys[provider.id] || ''}
                      onInputChange={handleKeyChange}
                      onToggleReveal={toggleShowKey}
                    />
                    <div className="settings-actions-row">
                      <button 
                        className="settings-btn settings-btn--primary"
                        onClick={(e) => handleSaveKey(e, provider.id)}
                        disabled={!inputKeys[provider.id]}
                      >
                        Save Key
                      </button>
                      {isConnected && (
                        <button 
                          className="settings-btn settings-btn--danger"
                          onClick={(e) => handleRemoveKey(e, provider.id)}
                        >
                          Remove Key
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="settings-field-group">
                    <label>Model</label>
                    <select 
                      className="settings-select"
                      value={currentModelId}
                      onChange={(e) => handleModelChange(provider.id, e.target.value)}
                    >
                      {provider.models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.thinking ? '(Thinking)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-actions-row">
                    <button 
                      className="settings-btn settings-btn--primary"
                      onClick={(e) => handleSetActive(e, provider.id)}
                      disabled={!isConnected}
                    >
                      Set Active
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="settings-divider" />

      <div className="settings-section-title">Agent Configuration</div>
      <div className="settings-agent-list">
        {agentConfigs.map((agent) => (
          <div key={agent.name} className="settings-agent-row">
            <span className="settings-agent-name">{agent.label}</span>
            <select
              className="settings-select settings-agent-select"
              value={agent.modelId}
              onChange={(e) => handleAgentModelChange(agent.name, e.target.value)}
            >
              <option value="">Default model</option>
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="settings-divider" />

      <div className="settings-section-title">Usage Stats</div>
      <div className="settings-usage-stats">
        <div className="settings-usage-row">
          <span className="settings-usage-label">Total messages</span>
          <span className="settings-usage-value">0</span>
        </div>
        <div className="settings-usage-row">
          <span className="settings-usage-label">Total tokens</span>
          <span className="settings-usage-value">~0</span>
        </div>
        <div className="settings-usage-row">
          <span className="settings-usage-label">Estimated cost</span>
          <span className="settings-usage-value">$0.00</span>
        </div>
      </div>
    </div>
  )
}
