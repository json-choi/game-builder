import { useState, useCallback } from 'react'

export interface ExportPreset {
  name: string
  platform: 'windows' | 'macos' | 'linux' | 'web' | 'android' | 'ios'
  runnable: boolean
  exportPath: string
}

export interface ExportResult {
  success: boolean
  outputPath: string
  error?: string
  duration: number
}

export interface ExportAPI {
  getPresets: (projectPath: string) => Promise<ExportPreset[]>
  runExport: (projectPath: string, preset: string) => Promise<ExportResult>
  createDefaults: (projectPath: string) => Promise<void>
}

const noopExportAPI: ExportAPI = {
  getPresets: async () => [],
  runExport: async () => ({ success: false, outputPath: '', error: 'Export API not available', duration: 0 }),
  createDefaults: async () => {},
}

export function useExport(projectPath: string | null, api: ExportAPI = noopExportAPI) {
  const [presets, setPresets] = useState<ExportPreset[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPresets = useCallback(async () => {
    if (!projectPath) return
    try {
      setError(null)
      const result = await api.getPresets(projectPath)
      setPresets(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectPath, api])

  const runExport = useCallback(async (preset: string) => {
    if (!projectPath) return
    setExporting(true)
    setExportResult(null)
    setError(null)

    try {
      const result = await api.runExport(projectPath, preset)
      setExportResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }, [projectPath, api])

  const createDefaults = useCallback(async () => {
    if (!projectPath) return
    try {
      setError(null)
      await api.createDefaults(projectPath)
      await loadPresets()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectPath, api, loadPresets])

  return { presets, exporting, exportResult, error, loadPresets, runExport, createDefaults }
}
