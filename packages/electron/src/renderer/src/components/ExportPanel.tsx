import React, { useEffect } from 'react'
import type { ExportPreset, ExportResult } from '../hooks/useExport'
import { toRelativePath } from '../utils/pathUtils'

const PLATFORM_ICONS: Record<ExportPreset['platform'], string> = {
  windows: '\uD83E\uDE9F',
  macos: '\uD83C\uDF4E',
  linux: '\uD83D\uDC27',
  web: '\uD83C\uDF10',
  android: '\uD83E\uDD16',
  ios: '\uD83D\uDCF1',
}

const PLATFORM_LABELS: Record<ExportPreset['platform'], string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  web: 'Web',
  android: 'Android',
  ios: 'iOS',
}

interface ExportPanelProps {
  projectPath: string | null
  presets: ExportPreset[]
  exporting: boolean
  exportResult: ExportResult | null
  error: string | null
  templatesInstalled: boolean
  onLoadPresets: () => void
  onExport: (preset: string) => void
  onCreateDefaults: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  projectPath,
  presets,
  exporting,
  exportResult,
  error,
  templatesInstalled,
  onLoadPresets,
  onExport,
  onCreateDefaults,
}) => {
  useEffect(() => {
    if (projectPath) {
      onLoadPresets()
    }
  }, [projectPath, onLoadPresets])

  if (!projectPath) {
    return (
      <div className="export-panel">
        <div className="export-panel__empty">No project open</div>
      </div>
    )
  }

  return (
    <div className="export-panel">
      <div className="export-panel__header">
        <span className="export-panel__title">Export Project</span>
        <button className="export-panel__refresh-btn" onClick={onLoadPresets}>
          Refresh
        </button>
      </div>

      {!templatesInstalled && (
        <div className="export-panel__warning">
          Export templates not installed. Download them from Godot Editor &gt; Editor &gt; Manage Export Templates.
        </div>
      )}

      {error && (
        <div className="export-panel__error">{error}</div>
      )}

      {exportResult && (
        <div className={`export-panel__result ${exportResult.success ? 'export-panel__result--success' : 'export-panel__result--failure'}`}>
          <span>{exportResult.success ? 'Export successful' : 'Export failed'}</span>
          <span className="export-panel__result-detail">
            {exportResult.success
              ? `${toRelativePath(exportResult.outputPath, projectPath!)} (${formatDuration(exportResult.duration)})`
              : exportResult.error}
          </span>
        </div>
      )}

      {presets.length === 0 ? (
        <div className="export-panel__no-presets">
          <p>No export presets found.</p>
          <button className="export-panel__create-btn" onClick={onCreateDefaults}>
            Create Default Presets
          </button>
        </div>
      ) : (
        <div className="export-panel__presets">
          {presets.map((preset) => (
            <div key={preset.name} className="export-panel__preset-card">
              <div className="export-panel__preset-icon">
                {PLATFORM_ICONS[preset.platform]}
              </div>
              <div className="export-panel__preset-info">
                <span className="export-panel__preset-name">{preset.name}</span>
                <span className="export-panel__preset-platform">
                  {PLATFORM_LABELS[preset.platform]}
                </span>
                {preset.exportPath && (
                  <span className="export-panel__preset-path">{toRelativePath(preset.exportPath, projectPath!)}</span>
                )}
              </div>
              <button
                className="export-panel__export-btn"
                onClick={() => onExport(preset.name)}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
