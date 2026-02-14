import React, { useState } from 'react'
import { useProgress } from '../hooks/useProgress'

const AGENT_COLORS: Record<string, string> = {
  orchestrator: '#569cd6',
  coder: '#dcdcaa',
  designer: '#c586c0',
  builder: '#4ec9b0',
  debugger: '#f48771',
  reviewer: '#d7ba7d'
}

export const ProgressPanel: React.FC = () => {
  const { progress, isActive } = useProgress()
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!isActive && progress.steps.length === 0) return null

  const toggleCollapse = () => setIsCollapsed(!isCollapsed)

  return (
    <div className="progress-panel">
      <div className="progress-panel__header" onClick={toggleCollapse}>
        <span>
          {isActive ? 'Generating...' : 'Completed'} 
          {progress.totalSteps > 0 && ` (${progress.currentStep}/${progress.totalSteps})`}
        </span>
        <span>{isCollapsed ? '▼' : '▲'}</span>
      </div>

      {!isCollapsed && (
        <div className="progress-panel__steps">
          {progress.steps.map((step, index) => {
            const isCurrent = step.status === 'running'
            const agentColor = AGENT_COLORS[step.agent] || '#ccc'
            
            return (
              <div 
                key={index} 
                className={`progress-step ${isCurrent ? 'progress-step--running' : ''}`}
              >
                <div className="progress-step__badge" style={{ backgroundColor: agentColor }}>
                  {step.agent}
                </div>
                <div className="progress-step__message">
                  {step.message}
                  {step.filesChanged.length > 0 && (
                    <div className="progress-step__files">
                      {step.filesChanged.map((file, i) => (
                        <span key={i} className="progress-file-pill">{file}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="progress-step__status">
                  {step.status === 'running' && '⏳'}
                  {step.status === 'done' && '✅'}
                  {step.status === 'error' && '❌'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
