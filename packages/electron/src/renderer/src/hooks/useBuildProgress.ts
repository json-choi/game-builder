import { useState, useCallback, useRef } from 'react'

// ─── Types (mirrors build-pipeline.ts types for UI layer) ────────────────

export type BuildPlatform = 'web' | 'windows' | 'linux' | 'macos'

export type BuildStatus =
  | 'pending'
  | 'queued'
  | 'building'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface PlatformProgress {
  platform: BuildPlatform
  status: BuildStatus
  message: string
  startedAt: number | null
  completedAt: number | null
  duration: number
  error?: string
}

export interface BuildProgressState {
  /** Whether a build is currently running */
  isBuilding: boolean
  /** Overall build status */
  overallStatus: BuildStatus
  /** Per-platform progress entries */
  platforms: PlatformProgress[]
  /** Currently building platform */
  currentPlatform: BuildPlatform | null
  /** Build start timestamp */
  startedAt: number | null
  /** Build completion timestamp */
  completedAt: number | null
  /** Total elapsed duration in ms */
  totalDuration: number
  /** Count of succeeded platforms */
  succeededCount: number
  /** Count of failed platforms */
  failedCount: number
  /** Count of total platforms in the build */
  totalCount: number
  /** Overall progress percentage (0-100) */
  progressPercent: number
  /** Build log messages */
  logs: BuildLogEntry[]
}

export interface BuildLogEntry {
  timestamp: number
  platform: BuildPlatform | null
  message: string
  level: 'info' | 'error' | 'warn' | 'success'
}

// ─── Build Progress API (injected, mirrors IPC bridge) ─────────────────

export interface BuildProgressAPI {
  /** Subscribe to build progress events. Returns cleanup function. */
  onBuildProgress?: (callback: (event: BuildProgressEvent) => void) => (() => void) | undefined
}

export type BuildProgressEventType =
  | 'build-start'
  | 'platform-start'
  | 'platform-progress'
  | 'platform-success'
  | 'platform-fail'
  | 'platform-skip'
  | 'build-complete'
  | 'build-cancel'
  | 'build-error'

export interface BuildProgressEvent {
  type: BuildProgressEventType
  platform?: BuildPlatform
  platforms?: BuildPlatform[]
  message?: string
  error?: string
  timestamp?: number
  duration?: number
}

// ─── Pure functions (exported for testing) ─────────────────────────────

export function createInitialState(): BuildProgressState {
  return {
    isBuilding: false,
    overallStatus: 'pending',
    platforms: [],
    currentPlatform: null,
    startedAt: null,
    completedAt: null,
    totalDuration: 0,
    succeededCount: 0,
    failedCount: 0,
    totalCount: 0,
    progressPercent: 0,
    logs: [],
  }
}

export function createPlatformProgress(platform: BuildPlatform): PlatformProgress {
  return {
    platform,
    status: 'pending',
    message: `Waiting to build ${platform}...`,
    startedAt: null,
    completedAt: null,
    duration: 0,
  }
}

export function calculateProgressPercent(platforms: PlatformProgress[]): number {
  if (platforms.length === 0) return 0
  const completed = platforms.filter(
    (p) => p.status === 'succeeded' || p.status === 'failed' || p.status === 'skipped' || p.status === 'cancelled'
  ).length
  return Math.round((completed / platforms.length) * 100)
}

export function countByStatus(
  platforms: PlatformProgress[],
  status: BuildStatus
): number {
  return platforms.filter((p) => p.status === status).length
}

export function deriveOverallStatus(platforms: PlatformProgress[]): BuildStatus {
  if (platforms.length === 0) return 'pending'

  const statuses = platforms.map((p) => p.status)

  if (statuses.some((s) => s === 'building')) return 'building'
  if (statuses.every((s) => s === 'pending')) return 'pending'
  if (statuses.every((s) => s === 'succeeded' || s === 'skipped')) return 'succeeded'
  if (statuses.some((s) => s === 'cancelled')) return 'cancelled'
  if (statuses.some((s) => s === 'failed')) return 'failed'
  if (statuses.every((s) => s === 'succeeded' || s === 'failed' || s === 'skipped' || s === 'cancelled')) {
    return statuses.some((s) => s === 'failed') ? 'failed' : 'succeeded'
  }

  return 'building'
}

export function formatBuildDuration(ms: number): string {
  if (ms <= 0) return '0s'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

export function formatPlatformLabel(platform: BuildPlatform): string {
  const labels: Record<BuildPlatform, string> = {
    web: 'Web',
    windows: 'Windows',
    linux: 'Linux',
    macos: 'macOS',
  }
  return labels[platform]
}

export function getStatusIcon(status: BuildStatus): string {
  const icons: Record<BuildStatus, string> = {
    pending: '\u23F3',
    queued: '\u23F3',
    building: '\u2699\uFE0F',
    succeeded: '\u2705',
    failed: '\u274C',
    cancelled: '\u26D4',
    skipped: '\u23ED\uFE0F',
  }
  return icons[status]
}

export function reduceBuildEvent(
  state: BuildProgressState,
  event: BuildProgressEvent
): BuildProgressState {
  const now = event.timestamp ?? Date.now()
  const next = { ...state, platforms: state.platforms.map((p) => ({ ...p })), logs: [...state.logs] }

  switch (event.type) {
    case 'build-start': {
      const platformList = event.platforms ?? []
      next.isBuilding = true
      next.overallStatus = 'building'
      next.startedAt = now
      next.completedAt = null
      next.currentPlatform = null
      next.totalCount = platformList.length
      next.succeededCount = 0
      next.failedCount = 0
      next.totalDuration = 0
      next.progressPercent = 0
      next.platforms = platformList.map(createPlatformProgress)
      next.logs = [{
        timestamp: now,
        platform: null,
        message: `Build started for ${platformList.length} platform(s): ${platformList.join(', ')}`,
        level: 'info',
      }]
      break
    }

    case 'platform-start': {
      const platform = event.platform!
      next.currentPlatform = platform
      const idx = next.platforms.findIndex((p) => p.platform === platform)
      if (idx !== -1) {
        next.platforms[idx].status = 'building'
        next.platforms[idx].startedAt = now
        next.platforms[idx].message = event.message ?? `Building ${platform}...`
      }
      next.overallStatus = 'building'
      next.progressPercent = calculateProgressPercent(next.platforms)
      next.logs.push({
        timestamp: now,
        platform,
        message: event.message ?? `Building ${platform}...`,
        level: 'info',
      })
      break
    }

    case 'platform-progress': {
      const platform = event.platform!
      const idx = next.platforms.findIndex((p) => p.platform === platform)
      if (idx !== -1 && event.message) {
        next.platforms[idx].message = event.message
      }
      next.logs.push({
        timestamp: now,
        platform,
        message: event.message ?? `${platform} in progress...`,
        level: 'info',
      })
      break
    }

    case 'platform-success': {
      const platform = event.platform!
      const idx = next.platforms.findIndex((p) => p.platform === platform)
      if (idx !== -1) {
        next.platforms[idx].status = 'succeeded'
        next.platforms[idx].completedAt = now
        next.platforms[idx].duration = event.duration ?? (next.platforms[idx].startedAt ? now - next.platforms[idx].startedAt! : 0)
        next.platforms[idx].message = event.message ?? `${platform} build succeeded`
      }
      next.succeededCount = countByStatus(next.platforms, 'succeeded')
      next.progressPercent = calculateProgressPercent(next.platforms)
      next.logs.push({
        timestamp: now,
        platform,
        message: event.message ?? `${platform} build succeeded`,
        level: 'success',
      })
      break
    }

    case 'platform-fail': {
      const platform = event.platform!
      const idx = next.platforms.findIndex((p) => p.platform === platform)
      if (idx !== -1) {
        next.platforms[idx].status = 'failed'
        next.platforms[idx].completedAt = now
        next.platforms[idx].duration = event.duration ?? (next.platforms[idx].startedAt ? now - next.platforms[idx].startedAt! : 0)
        next.platforms[idx].message = event.message ?? `${platform} build failed`
        next.platforms[idx].error = event.error
      }
      next.failedCount = countByStatus(next.platforms, 'failed')
      next.progressPercent = calculateProgressPercent(next.platforms)
      next.logs.push({
        timestamp: now,
        platform,
        message: event.error ?? event.message ?? `${platform} build failed`,
        level: 'error',
      })
      break
    }

    case 'platform-skip': {
      const platform = event.platform!
      const idx = next.platforms.findIndex((p) => p.platform === platform)
      if (idx !== -1) {
        next.platforms[idx].status = 'skipped'
        next.platforms[idx].completedAt = now
        next.platforms[idx].message = event.message ?? `${platform} skipped`
      }
      next.progressPercent = calculateProgressPercent(next.platforms)
      next.logs.push({
        timestamp: now,
        platform,
        message: event.message ?? `${platform} skipped`,
        level: 'warn',
      })
      break
    }

    case 'build-complete': {
      next.isBuilding = false
      next.completedAt = now
      next.currentPlatform = null
      next.totalDuration = event.duration ?? (next.startedAt ? now - next.startedAt : 0)
      next.overallStatus = deriveOverallStatus(next.platforms)
      next.progressPercent = 100
      next.logs.push({
        timestamp: now,
        platform: null,
        message: event.message ?? `Build complete: ${next.succeededCount} succeeded, ${next.failedCount} failed`,
        level: next.failedCount > 0 ? 'error' : 'success',
      })
      break
    }

    case 'build-cancel': {
      next.isBuilding = false
      next.completedAt = now
      next.currentPlatform = null
      next.overallStatus = 'cancelled'
      next.totalDuration = next.startedAt ? now - next.startedAt : 0
      for (const p of next.platforms) {
        if (p.status === 'building' || p.status === 'pending') {
          p.status = 'cancelled'
          p.completedAt = now
          p.message = `${p.platform} cancelled`
        }
      }
      next.progressPercent = calculateProgressPercent(next.platforms)
      next.logs.push({
        timestamp: now,
        platform: null,
        message: 'Build cancelled',
        level: 'warn',
      })
      break
    }

    case 'build-error': {
      next.isBuilding = false
      next.completedAt = now
      next.currentPlatform = null
      next.overallStatus = 'failed'
      next.totalDuration = next.startedAt ? now - next.startedAt : 0
      next.logs.push({
        timestamp: now,
        platform: event.platform ?? null,
        message: event.error ?? event.message ?? 'Build error',
        level: 'error',
      })
      break
    }
  }

  return next
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useBuildProgress(api?: BuildProgressAPI) {
  const [state, setState] = useState<BuildProgressState>(createInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const handleEvent = useCallback((event: BuildProgressEvent) => {
    setState((prev) => reduceBuildEvent(prev, event))
  }, [])

  const reset = useCallback(() => {
    setState(createInitialState())
  }, [])

  const dispatchEvent = useCallback((event: BuildProgressEvent) => {
    handleEvent(event)
  }, [handleEvent])

  return {
    ...state,
    reset,
    dispatchEvent,
  }
}
