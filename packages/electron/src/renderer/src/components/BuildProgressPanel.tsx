import React, { useState } from 'react'
import type {
  BuildProgressState,
  BuildPlatform,
  BuildStatus,
  PlatformProgress,
  BuildLogEntry,
} from '../hooks/useBuildProgress'
import {
  formatBuildDuration,
  formatPlatformLabel,
  getStatusIcon,
} from '../hooks/useBuildProgress'

const PLATFORM_ICONS: Record<BuildPlatform, string> = {
  web: '\uD83C\uDF10',
  windows: '\uD83E\uDE9F',
  linux: '\uD83D\uDC27',
  macos: '\uD83C\uDF4E',
}

const STATUS_COLORS: Record<BuildStatus, string> = {
  pending: '#6b7280',
  queued: '#6b7280',
  building: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  skipped: '#9ca3af',
}

interface BuildProgressPanelProps {
  state: BuildProgressState
  onCancel?: () => void
  onReset?: () => void
  onRetry?: () => void
}

function ProgressBar({ percent }: { percent: number }) {
  const clampedPercent = Math.max(0, Math.min(100, percent))
  return (
    <div className="build-progress__bar">
      <div
        className="build-progress__bar-fill"
        style={{ width: `${clampedPercent}%` }}
      />
      <span className="build-progress__bar-text">{clampedPercent}%</span>
    </div>
  )
}

function PlatformRow({ progress }: { progress: PlatformProgress }) {
  const icon = PLATFORM_ICONS[progress.platform]
  const statusIcon = getStatusIcon(progress.status)
  const statusColor = STATUS_COLORS[progress.status]
  const label = formatPlatformLabel(progress.platform)
  const duration = progress.duration > 0 ? formatBuildDuration(progress.duration) : null

  return (
    <div className={`build-progress__platform ${progress.status === 'building' ? 'build-progress__platform--active' : ''}`}>
      <span className="build-progress__platform-icon">{icon}</span>
      <div className="build-progress__platform-info">
        <span className="build-progress__platform-name">{label}</span>
        <span className="build-progress__platform-message">{progress.message}</span>
      </div>
      <div className="build-progress__platform-status">
        {duration && <span className="build-progress__platform-duration">{duration}</span>}
        <span style={{ color: statusColor }}>{statusIcon}</span>
      </div>
    </div>
  )
}

function LogPanel({ logs, maxLines = 50 }: { logs: BuildLogEntry[]; maxLines?: number }) {
  const visibleLogs = logs.slice(-maxLines)
  const levelColors: Record<string, string> = {
    info: '#d1d5db',
    error: '#ef4444',
    warn: '#f59e0b',
    success: '#22c55e',
  }

  return (
    <div className="build-progress__logs">
      {visibleLogs.map((log, i) => (
        <div key={i} className="build-progress__log-entry" style={{ color: levelColors[log.level] ?? '#d1d5db' }}>
          {log.platform && <span className="build-progress__log-platform">[{log.platform}]</span>}
          <span className="build-progress__log-message">{log.message}</span>
        </div>
      ))}
    </div>
  )
}

export const BuildProgressPanel: React.FC<BuildProgressPanelProps> = ({
  state,
  onCancel,
  onReset,
  onRetry,
}) => {
  const [showLogs, setShowLogs] = useState(false)

  const isIdle = !state.isBuilding && state.platforms.length === 0
  const isComplete = !state.isBuilding && state.platforms.length > 0

  if (isIdle) {
    return (
      <div className="build-progress">
        <div className="build-progress__empty">No build in progress</div>
      </div>
    )
  }

  const headerText = state.isBuilding
    ? `Building... ${state.succeededCount + state.failedCount}/${state.totalCount}`
    : state.overallStatus === 'succeeded'
      ? 'Build Succeeded'
      : state.overallStatus === 'cancelled'
        ? 'Build Cancelled'
        : 'Build Failed'

  const headerIcon = state.isBuilding ? '\u2699\uFE0F' : getStatusIcon(state.overallStatus)

  return (
    <div className="build-progress">
      <div className="build-progress__header">
        <span className="build-progress__header-icon">{headerIcon}</span>
        <span className="build-progress__header-text">{headerText}</span>
        {state.totalDuration > 0 && (
          <span className="build-progress__header-duration">{formatBuildDuration(state.totalDuration)}</span>
        )}
      </div>

      {state.isBuilding && <ProgressBar percent={state.progressPercent} />}

      {isComplete && (
        <div className="build-progress__summary">
          {state.succeededCount > 0 && <span className="build-progress__summary-item build-progress__summary-item--success">{state.succeededCount} succeeded</span>}
          {state.failedCount > 0 && <span className="build-progress__summary-item build-progress__summary-item--fail">{state.failedCount} failed</span>}
          {countSkipped(state.platforms) > 0 && <span className="build-progress__summary-item build-progress__summary-item--skip">{countSkipped(state.platforms)} skipped</span>}
        </div>
      )}

      <div className="build-progress__platforms">
        {state.platforms.map((p) => (
          <PlatformRow key={p.platform} progress={p} />
        ))}
      </div>

      <div className="build-progress__actions">
        {state.isBuilding && onCancel && (
          <button className="build-progress__btn build-progress__btn--cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        {isComplete && onRetry && state.failedCount > 0 && (
          <button className="build-progress__btn build-progress__btn--retry" onClick={onRetry}>
            Retry Failed
          </button>
        )}
        {isComplete && onReset && (
          <button className="build-progress__btn build-progress__btn--reset" onClick={onReset}>
            Dismiss
          </button>
        )}
        <button
          className="build-progress__btn build-progress__btn--logs"
          onClick={() => setShowLogs(!showLogs)}
        >
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
      </div>

      {showLogs && state.logs.length > 0 && <LogPanel logs={state.logs} />}
    </div>
  )
}

function countSkipped(platforms: PlatformProgress[]): number {
  return platforms.filter((p) => p.status === 'skipped').length
}
