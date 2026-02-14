import React, { useRef, useEffect } from 'react'
import { usePreview } from '../hooks/usePreview'

interface PreviewPanelProps {
  projectPath?: string | null
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ projectPath }) => {
  const { status, error, output, startPreview, stopPreview, clearOutput } = usePreview()
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  if (!projectPath) {
    return (
      <div className="preview-panel">
        <div className="preview-empty">No project open</div>
      </div>
    )
  }

  const isRunning = status === 'running' || status === 'starting'
  const showRun = status === 'idle' || status === 'error'
  const showStop = status === 'starting' || status === 'running' || status === 'stopping'

  const statusText =
    status === 'running'
      ? 'Running...'
      : status === 'starting'
        ? 'Starting...'
        : status === 'stopping'
          ? 'Stopping...'
          : status === 'error'
            ? `Error: ${error ?? 'Unknown error'}`
            : 'Idle'

  const statusClass =
    status === 'running' || status === 'starting'
      ? 'preview-status--running'
      : status === 'error'
        ? 'preview-status--error'
        : ''

  function isErrorLine(line: string): boolean {
    const lower = line.toLowerCase()
    return lower.includes('error') || lower.includes('fatal') || lower.includes('exception')
  }

  return (
    <div className="preview-panel">
      <div className="preview-controls">
        {showRun && (
          <button
            className="preview-btn preview-btn--run"
            onClick={() => startPreview(projectPath)}
            disabled={isRunning}
          >
            &#9654; Run
          </button>
        )}
        {showStop && (
          <button
            className="preview-btn preview-btn--stop"
            onClick={stopPreview}
            disabled={status === 'stopping'}
          >
            &#9632; Stop
          </button>
        )}
        <span className={`preview-status ${statusClass}`}>{statusText}</span>
        {output.length > 0 && (
          <button className="preview-btn preview-btn--secondary" onClick={clearOutput}>
            Clear
          </button>
        )}
      </div>
      <div className="preview-output" ref={outputRef}>
        {output.map((line, i) => (
          <div
            key={i}
            className={`preview-output__line ${isErrorLine(line) ? 'preview-output__line--error' : ''}`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
