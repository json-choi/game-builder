import React, { useRef, useEffect } from 'react'
import { usePreview } from '../hooks/usePreview'
import { usePlatformUpload } from '../hooks/usePlatformUpload'

interface PreviewPanelProps {
  projectPath?: string | null
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ projectPath }) => {
  const { status, error, output, startPreview, stopPreview, clearOutput } = usePreview()
  const { status: uploadStatus, progress, gameUrl, upload, reset } = usePlatformUpload()
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

  const isUploading = uploadStatus === 'uploading'
  const canUpload = uploadStatus === 'idle' || uploadStatus === 'error'
  const uploadSuccess = uploadStatus === 'success'

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

      <div className="preview-upload">
        {canUpload && (
          <button
            className="preview-btn preview-btn--upload"
            onClick={() => upload(projectPath)}
            disabled={isUploading}
          >
            &#9650; 플랫폼에 업로드
          </button>
        )}
        {isUploading && (
          <div className="preview-upload__progress">
            <span className="preview-upload__spinner">&#9696;</span>
            <span>업로드 중...</span>
          </div>
        )}
        {uploadSuccess && gameUrl && (
          <div className="preview-upload__success">
            <span>&#10003; 업로드 완료: </span>
            <a href={gameUrl} target="_blank" rel="noopener noreferrer" className="preview-upload__link">
              {gameUrl}
            </a>
            <button className="preview-btn preview-btn--secondary" onClick={reset}>
              새 업로드
            </button>
          </div>
        )}
        {uploadStatus === 'error' && (
          <div className="preview-upload__error">
            <span>&#10007; 업로드 실패</span>
            <button className="preview-btn preview-btn--secondary" onClick={reset}>
              다시 시도
            </button>
          </div>
        )}
        {progress.length > 0 && isUploading && (
          <div className="preview-upload__log">
            {progress.slice(-5).map((line, i) => (
              <div key={i} className="preview-upload__log-line">
                {line}
              </div>
            ))}
          </div>
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
