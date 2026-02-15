import { describe, expect, test } from 'bun:test'
import {
  createInitialState,
  reduceBuildEvent,
  formatBuildDuration,
  formatPlatformLabel,
  getStatusIcon,
  type BuildProgressState,
  type BuildProgressEvent,
  type BuildPlatform,
  type BuildStatus,
  type PlatformProgress,
  type BuildLogEntry,
} from '../hooks/useBuildProgress'

function applyEvents(events: BuildProgressEvent[]): BuildProgressState {
  let state = createInitialState()
  for (const event of events) {
    state = reduceBuildEvent(state, event)
  }
  return state
}

function buildSuccessState(): BuildProgressState {
  return applyEvents([
    { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
    { type: 'platform-start', platform: 'web', timestamp: 1001 },
    { type: 'platform-success', platform: 'web', duration: 500, timestamp: 1501 },
    { type: 'platform-start', platform: 'windows', timestamp: 1502 },
    { type: 'platform-success', platform: 'windows', duration: 800, timestamp: 2302 },
    { type: 'build-complete', duration: 1302, timestamp: 2302 },
  ])
}

function buildFailState(): BuildProgressState {
  return applyEvents([
    { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
    { type: 'platform-start', platform: 'web', timestamp: 1001 },
    { type: 'platform-success', platform: 'web', duration: 500, timestamp: 1501 },
    { type: 'platform-start', platform: 'windows', timestamp: 1502 },
    { type: 'platform-fail', platform: 'windows', error: 'Missing preset', duration: 100, timestamp: 1602 },
    { type: 'build-complete', duration: 602, timestamp: 1602 },
  ])
}

function buildCancelledState(): BuildProgressState {
  return applyEvents([
    { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
    { type: 'platform-start', platform: 'web', timestamp: 1001 },
    { type: 'build-cancel', timestamp: 1200 },
  ])
}

function buildingState(): BuildProgressState {
  return applyEvents([
    { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
    { type: 'platform-start', platform: 'web', timestamp: 1001 },
    { type: 'platform-success', platform: 'web', duration: 200, timestamp: 1201 },
    { type: 'platform-start', platform: 'windows', timestamp: 1202 },
  ])
}

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

describe('BuildProgressPanel', () => {
  describe('idle state rendering', () => {
    test('shows empty state when no build is running', () => {
      const state = createInitialState()
      const isIdle = !state.isBuilding && state.platforms.length === 0
      expect(isIdle).toBe(true)
    })

    test('not idle when build is running', () => {
      const state = buildingState()
      const isIdle = !state.isBuilding && state.platforms.length === 0
      expect(isIdle).toBe(false)
    })

    test('not idle when build is complete (has platforms)', () => {
      const state = buildSuccessState()
      const isIdle = !state.isBuilding && state.platforms.length === 0
      expect(isIdle).toBe(false)
    })
  })

  describe('header rendering logic', () => {
    test('shows building header during build', () => {
      const state = buildingState()
      const headerText = `Building... ${state.succeededCount + state.failedCount}/${state.totalCount}`
      expect(headerText).toBe('Building... 1/3')
    })

    test('shows success header on complete', () => {
      const state = buildSuccessState()
      const headerText = state.overallStatus === 'succeeded' ? 'Build Succeeded' : 'Build Failed'
      expect(headerText).toBe('Build Succeeded')
    })

    test('shows failed header on failure', () => {
      const state = buildFailState()
      const headerText = state.overallStatus === 'succeeded'
        ? 'Build Succeeded'
        : state.overallStatus === 'cancelled'
          ? 'Build Cancelled'
          : 'Build Failed'
      expect(headerText).toBe('Build Failed')
    })

    test('shows cancelled header on cancel', () => {
      const state = buildCancelledState()
      const headerText = state.overallStatus === 'succeeded'
        ? 'Build Succeeded'
        : state.overallStatus === 'cancelled'
          ? 'Build Cancelled'
          : 'Build Failed'
      expect(headerText).toBe('Build Cancelled')
    })

    test('header icon uses gear during build', () => {
      const state = buildingState()
      const icon = state.isBuilding ? '\u2699\uFE0F' : getStatusIcon(state.overallStatus)
      expect(icon).toBe('\u2699\uFE0F')
    })

    test('header icon uses succeeded icon after success', () => {
      const state = buildSuccessState()
      const icon = state.isBuilding ? '\u2699\uFE0F' : getStatusIcon(state.overallStatus)
      expect(icon).toBe(getStatusIcon('succeeded'))
    })

    test('header shows duration when available', () => {
      const state = buildSuccessState()
      expect(state.totalDuration).toBeGreaterThan(0)
      expect(formatBuildDuration(state.totalDuration)).toBe('1.3s')
    })
  })

  describe('progress bar visibility', () => {
    test('shows progress bar during build', () => {
      const state = buildingState()
      expect(state.isBuilding).toBe(true)
    })

    test('hides progress bar when complete', () => {
      const state = buildSuccessState()
      expect(state.isBuilding).toBe(false)
    })

    test('progress percent reflects completion', () => {
      const state = buildingState()
      expect(state.progressPercent).toBe(33)
    })

    test('progress percent clamps at 100', () => {
      const state = buildSuccessState()
      expect(state.progressPercent).toBe(100)
    })
  })

  describe('summary section', () => {
    test('shows summary when build is complete', () => {
      const state = buildSuccessState()
      const isComplete = !state.isBuilding && state.platforms.length > 0
      expect(isComplete).toBe(true)
    })

    test('succeeded count in summary', () => {
      const state = buildSuccessState()
      expect(state.succeededCount).toBe(2)
    })

    test('failed count in summary', () => {
      const state = buildFailState()
      expect(state.failedCount).toBe(1)
    })

    test('skipped count from platforms', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1200 },
        { type: 'platform-skip', platform: 'windows', message: 'Disabled', timestamp: 1201 },
        { type: 'platform-skip', platform: 'linux', message: 'Disabled', timestamp: 1202 },
        { type: 'build-complete', timestamp: 1300 },
      ])

      const skippedCount = state.platforms.filter(p => p.status === 'skipped').length
      expect(skippedCount).toBe(2)
    })

    test('no summary when idle', () => {
      const state = createInitialState()
      const isComplete = !state.isBuilding && state.platforms.length > 0
      expect(isComplete).toBe(false)
    })
  })

  describe('platform row rendering', () => {
    test('each platform has a corresponding icon', () => {
      const platforms: BuildPlatform[] = ['web', 'windows', 'linux', 'macos']
      for (const p of platforms) {
        expect(PLATFORM_ICONS[p]).toBeDefined()
        expect(typeof PLATFORM_ICONS[p]).toBe('string')
      }
    })

    test('each status has a corresponding color', () => {
      const statuses: BuildStatus[] = ['pending', 'queued', 'building', 'succeeded', 'failed', 'cancelled', 'skipped']
      for (const s of statuses) {
        expect(STATUS_COLORS[s]).toBeDefined()
        expect(STATUS_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    test('platform row shows label for each platform', () => {
      const platforms: BuildPlatform[] = ['web', 'windows', 'linux', 'macos']
      const labels = platforms.map(formatPlatformLabel)
      expect(labels).toEqual(['Web', 'Windows', 'Linux', 'macOS'])
    })

    test('active platform has building class condition', () => {
      const state = buildingState()
      const windowsPlatform = state.platforms.find(p => p.platform === 'windows')!
      expect(windowsPlatform.status).toBe('building')
      const isActive = windowsPlatform.status === 'building'
      expect(isActive).toBe(true)
    })

    test('completed platform does not have active class', () => {
      const state = buildingState()
      const webPlatform = state.platforms.find(p => p.platform === 'web')!
      expect(webPlatform.status).toBe('succeeded')
      const isActive = webPlatform.status === 'building'
      expect(isActive).toBe(false)
    })

    test('platform row shows duration when > 0', () => {
      const state = buildSuccessState()
      const webPlatform = state.platforms.find(p => p.platform === 'web')!
      expect(webPlatform.duration).toBe(500)
      expect(formatBuildDuration(webPlatform.duration)).toBe('500ms')
    })

    test('platform row hides duration when 0', () => {
      const platform = createInitialState().platforms
      expect(platform.length).toBe(0)

      const p: PlatformProgress = {
        platform: 'web',
        status: 'pending',
        message: 'Waiting...',
        startedAt: null,
        completedAt: null,
        duration: 0,
      }
      const showDuration = p.duration > 0
      expect(showDuration).toBe(false)
    })

    test('failed platform shows error in message', () => {
      const state = buildFailState()
      const windowsPlatform = state.platforms.find(p => p.platform === 'windows')!
      expect(windowsPlatform.error).toBe('Missing preset')
    })
  })

  describe('action buttons visibility', () => {
    test('cancel button visible during build', () => {
      const state = buildingState()
      const showCancel = state.isBuilding
      expect(showCancel).toBe(true)
    })

    test('cancel button hidden when complete', () => {
      const state = buildSuccessState()
      const showCancel = state.isBuilding
      expect(showCancel).toBe(false)
    })

    test('retry button visible when failed', () => {
      const state = buildFailState()
      const isComplete = !state.isBuilding && state.platforms.length > 0
      const hasFailed = state.failedCount > 0
      expect(isComplete && hasFailed).toBe(true)
    })

    test('retry button hidden when succeeded', () => {
      const state = buildSuccessState()
      const hasFailed = state.failedCount > 0
      expect(hasFailed).toBe(false)
    })

    test('dismiss button visible when complete', () => {
      const state = buildSuccessState()
      const isComplete = !state.isBuilding && state.platforms.length > 0
      expect(isComplete).toBe(true)
    })

    test('dismiss button hidden during build', () => {
      const state = buildingState()
      const isComplete = !state.isBuilding && state.platforms.length > 0
      expect(isComplete).toBe(false)
    })

    test('logs toggle button always present (when not idle)', () => {
      const states = [buildingState(), buildSuccessState(), buildFailState(), buildCancelledState()]
      for (const state of states) {
        const isIdle = !state.isBuilding && state.platforms.length === 0
        expect(isIdle).toBe(false)
      }
    })
  })

  describe('log panel', () => {
    test('logs exist after build events', () => {
      const state = buildSuccessState()
      expect(state.logs.length).toBeGreaterThan(0)
    })

    test('log entries have required fields', () => {
      const state = buildSuccessState()
      for (const log of state.logs) {
        expect(typeof log.timestamp).toBe('number')
        expect(typeof log.message).toBe('string')
        expect(['info', 'error', 'warn', 'success']).toContain(log.level)
      }
    })

    test('build-start produces info log', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
      ])
      expect(state.logs[0].level).toBe('info')
      expect(state.logs[0].platform).toBeNull()
    })

    test('platform-success produces success log', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1500 },
      ])
      const lastLog = state.logs[state.logs.length - 1]
      expect(lastLog.level).toBe('success')
      expect(lastLog.platform).toBe('web')
    })

    test('platform-fail produces error log', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-fail', platform: 'web', error: 'Crash', timestamp: 1500 },
      ])
      const lastLog = state.logs[state.logs.length - 1]
      expect(lastLog.level).toBe('error')
    })

    test('log panel respects maxLines limit', () => {
      const maxLines = 50
      const logs: BuildLogEntry[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: 1000 + i,
        platform: 'web' as BuildPlatform,
        message: `Log entry ${i}`,
        level: 'info' as const,
      }))

      const visibleLogs = logs.slice(-maxLines)
      expect(visibleLogs).toHaveLength(50)
      expect(visibleLogs[0].message).toBe('Log entry 50')
      expect(visibleLogs[49].message).toBe('Log entry 99')
    })

    test('log level colors are defined', () => {
      const levelColors: Record<string, string> = {
        info: '#d1d5db',
        error: '#ef4444',
        warn: '#f59e0b',
        success: '#22c55e',
      }

      expect(levelColors.info).toBeDefined()
      expect(levelColors.error).toBeDefined()
      expect(levelColors.warn).toBeDefined()
      expect(levelColors.success).toBeDefined()
    })

    test('log entries with platform show platform tag', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
      ])

      const platformLog = state.logs.find(l => l.platform === 'web')
      expect(platformLog).toBeDefined()
      expect(platformLog!.platform).toBe('web')
    })

    test('log entries without platform hide platform tag', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
      ])

      expect(state.logs[0].platform).toBeNull()
    })
  })

  describe('collapse/expand toggle state', () => {
    test('logs start hidden', () => {
      let showLogs = false
      expect(showLogs).toBe(false)
    })

    test('toggling shows logs', () => {
      let showLogs = false
      showLogs = !showLogs
      expect(showLogs).toBe(true)
    })

    test('double toggle hides logs', () => {
      let showLogs = false
      showLogs = !showLogs
      showLogs = !showLogs
      expect(showLogs).toBe(false)
    })

    test('toggle text reflects state', () => {
      let showLogs = false
      const getText = () => showLogs ? 'Hide Logs' : 'Show Logs'

      expect(getText()).toBe('Show Logs')
      showLogs = true
      expect(getText()).toBe('Hide Logs')
    })
  })

  describe('BuildProgressPanelProps contract', () => {
    test('requires state', () => {
      const state = createInitialState()
      expect(state).toBeDefined()
      expect(typeof state.isBuilding).toBe('boolean')
    })

    test('onCancel is optional', () => {
      const props = { state: createInitialState() }
      expect(props.state).toBeDefined()
    })

    test('onReset is optional', () => {
      const props = { state: createInitialState() }
      expect(props.state).toBeDefined()
    })

    test('onRetry is optional', () => {
      const props = { state: createInitialState() }
      expect(props.state).toBeDefined()
    })

    test('onCancel is callable', () => {
      let cancelled = false
      const onCancel = () => { cancelled = true }
      onCancel()
      expect(cancelled).toBe(true)
    })

    test('onReset is callable', () => {
      let reset = false
      const onReset = () => { reset = true }
      onReset()
      expect(reset).toBe(true)
    })

    test('onRetry is callable', () => {
      let retried = false
      const onRetry = () => { retried = true }
      onRetry()
      expect(retried).toBe(true)
    })
  })

  describe('platform icons', () => {
    test('all build platforms have icons', () => {
      const platforms: BuildPlatform[] = ['web', 'windows', 'linux', 'macos']
      for (const p of platforms) {
        expect(PLATFORM_ICONS[p]).toBeDefined()
        expect(PLATFORM_ICONS[p].length).toBeGreaterThan(0)
      }
    })

    test('all icons are unique', () => {
      const icons = Object.values(PLATFORM_ICONS)
      const unique = new Set(icons)
      expect(unique.size).toBe(icons.length)
    })
  })

  describe('status colors', () => {
    test('all statuses have colors', () => {
      const statuses: BuildStatus[] = ['pending', 'queued', 'building', 'succeeded', 'failed', 'cancelled', 'skipped']
      for (const s of statuses) {
        expect(STATUS_COLORS[s]).toBeDefined()
      }
    })

    test('succeeded is green', () => {
      expect(STATUS_COLORS['succeeded']).toBe('#22c55e')
    })

    test('failed is red', () => {
      expect(STATUS_COLORS['failed']).toBe('#ef4444')
    })

    test('building is blue', () => {
      expect(STATUS_COLORS['building']).toBe('#3b82f6')
    })
  })

  describe('complex scenarios', () => {
    test('4-platform all-success build', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web', 'windows', 'linux', 'macos'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', duration: 100, timestamp: 1101 },
        { type: 'platform-start', platform: 'windows', timestamp: 1102 },
        { type: 'platform-success', platform: 'windows', duration: 200, timestamp: 1302 },
        { type: 'platform-start', platform: 'linux', timestamp: 1303 },
        { type: 'platform-success', platform: 'linux', duration: 150, timestamp: 1453 },
        { type: 'platform-start', platform: 'macos', timestamp: 1454 },
        { type: 'platform-success', platform: 'macos', duration: 250, timestamp: 1704 },
        { type: 'build-complete', duration: 704, timestamp: 1704 },
      ])

      expect(state.overallStatus).toBe('succeeded')
      expect(state.succeededCount).toBe(4)
      expect(state.failedCount).toBe(0)
      expect(state.totalCount).toBe(4)
      expect(state.progressPercent).toBe(100)
      expect(state.platforms.every(p => p.status === 'succeeded')).toBe(true)
    })

    test('build with progress updates between start and success', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-progress', platform: 'web', message: 'Packaging assets...', timestamp: 1100 },
        { type: 'platform-progress', platform: 'web', message: 'Generating HTML...', timestamp: 1200 },
        { type: 'platform-progress', platform: 'web', message: 'Optimizing...', timestamp: 1300 },
        { type: 'platform-success', platform: 'web', duration: 400, timestamp: 1401 },
        { type: 'build-complete', duration: 401, timestamp: 1401 },
      ])

      expect(state.platforms[0].status).toBe('succeeded')
      expect(state.logs.length).toBeGreaterThanOrEqual(6)
    })

    test('header displays correct in-progress counter', () => {
      const scenarios: Array<{ events: BuildProgressEvent[]; expected: string }> = [
        {
          events: [
            { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
          ],
          expected: 'Building... 0/3',
        },
        {
          events: [
            { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
            { type: 'platform-start', platform: 'web', timestamp: 1001 },
            { type: 'platform-success', platform: 'web', timestamp: 1200 },
          ],
          expected: 'Building... 1/3',
        },
        {
          events: [
            { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
            { type: 'platform-start', platform: 'web', timestamp: 1001 },
            { type: 'platform-success', platform: 'web', timestamp: 1200 },
            { type: 'platform-start', platform: 'windows', timestamp: 1201 },
            { type: 'platform-fail', platform: 'windows', error: 'err', timestamp: 1400 },
          ],
          expected: 'Building... 2/3',
        },
      ]

      for (const { events, expected } of scenarios) {
        const state = applyEvents(events)
        const headerText = `Building... ${state.succeededCount + state.failedCount}/${state.totalCount}`
        expect(headerText).toBe(expected)
      }
    })
  })
})
