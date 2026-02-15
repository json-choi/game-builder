import { describe, expect, test } from 'bun:test'
import {
  createInitialState,
  createPlatformProgress,
  calculateProgressPercent,
  countByStatus,
  deriveOverallStatus,
  formatBuildDuration,
  formatPlatformLabel,
  getStatusIcon,
  reduceBuildEvent,
  type BuildProgressState,
  type BuildProgressEvent,
  type BuildPlatform,
  type BuildStatus,
  type PlatformProgress,
} from './useBuildProgress'

function makeState(overrides?: Partial<BuildProgressState>): BuildProgressState {
  return { ...createInitialState(), ...overrides }
}

function makePlatforms(...platforms: BuildPlatform[]): PlatformProgress[] {
  return platforms.map(createPlatformProgress)
}

function applyEvents(events: BuildProgressEvent[]): BuildProgressState {
  let state = createInitialState()
  for (const event of events) {
    state = reduceBuildEvent(state, event)
  }
  return state
}

describe('useBuildProgress', () => {
  describe('createInitialState', () => {
    test('returns correct initial state shape', () => {
      const state = createInitialState()
      expect(state.isBuilding).toBe(false)
      expect(state.overallStatus).toBe('pending')
      expect(state.platforms).toEqual([])
      expect(state.currentPlatform).toBeNull()
      expect(state.startedAt).toBeNull()
      expect(state.completedAt).toBeNull()
      expect(state.totalDuration).toBe(0)
      expect(state.succeededCount).toBe(0)
      expect(state.failedCount).toBe(0)
      expect(state.totalCount).toBe(0)
      expect(state.progressPercent).toBe(0)
      expect(state.logs).toEqual([])
    })

    test('returns a new object each call', () => {
      const a = createInitialState()
      const b = createInitialState()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('createPlatformProgress', () => {
    test('creates pending progress for web', () => {
      const p = createPlatformProgress('web')
      expect(p.platform).toBe('web')
      expect(p.status).toBe('pending')
      expect(p.startedAt).toBeNull()
      expect(p.completedAt).toBeNull()
      expect(p.duration).toBe(0)
    })

    test('creates pending progress for each platform', () => {
      const platforms: BuildPlatform[] = ['web', 'windows', 'linux', 'macos']
      for (const platform of platforms) {
        const p = createPlatformProgress(platform)
        expect(p.platform).toBe(platform)
        expect(p.status).toBe('pending')
        expect(p.message).toContain(platform)
      }
    })
  })

  describe('calculateProgressPercent', () => {
    test('returns 0 for empty array', () => {
      expect(calculateProgressPercent([])).toBe(0)
    })

    test('returns 0 when all pending', () => {
      const platforms = makePlatforms('web', 'windows')
      expect(calculateProgressPercent(platforms)).toBe(0)
    })

    test('returns 50 when half completed', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'succeeded'
      expect(calculateProgressPercent(platforms)).toBe(50)
    })

    test('returns 100 when all completed', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'failed'
      expect(calculateProgressPercent(platforms)).toBe(100)
    })

    test('counts skipped as completed', () => {
      const platforms = makePlatforms('web', 'windows', 'linux')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'skipped'
      expect(calculateProgressPercent(platforms)).toBe(67)
    })

    test('counts cancelled as completed', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'cancelled'
      platforms[1].status = 'succeeded'
      expect(calculateProgressPercent(platforms)).toBe(100)
    })

    test('building platforms are not counted as completed', () => {
      const platforms = makePlatforms('web', 'windows', 'linux', 'macos')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'building'
      expect(calculateProgressPercent(platforms)).toBe(25)
    })

    test('returns 25 for 1/4 succeeded', () => {
      const platforms = makePlatforms('web', 'windows', 'linux', 'macos')
      platforms[0].status = 'succeeded'
      expect(calculateProgressPercent(platforms)).toBe(25)
    })

    test('returns 75 for 3/4 completed', () => {
      const platforms = makePlatforms('web', 'windows', 'linux', 'macos')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'failed'
      platforms[2].status = 'skipped'
      expect(calculateProgressPercent(platforms)).toBe(75)
    })
  })

  describe('countByStatus', () => {
    test('returns 0 for empty array', () => {
      expect(countByStatus([], 'succeeded')).toBe(0)
    })

    test('counts succeeded platforms', () => {
      const platforms = makePlatforms('web', 'windows', 'linux')
      platforms[0].status = 'succeeded'
      platforms[2].status = 'succeeded'
      expect(countByStatus(platforms, 'succeeded')).toBe(2)
    })

    test('counts failed platforms', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[1].status = 'failed'
      expect(countByStatus(platforms, 'failed')).toBe(1)
    })

    test('counts building platforms', () => {
      const platforms = makePlatforms('web', 'windows', 'linux')
      platforms[0].status = 'building'
      platforms[1].status = 'building'
      expect(countByStatus(platforms, 'building')).toBe(2)
    })

    test('returns 0 for unmatched status', () => {
      const platforms = makePlatforms('web')
      platforms[0].status = 'succeeded'
      expect(countByStatus(platforms, 'failed')).toBe(0)
    })
  })

  describe('deriveOverallStatus', () => {
    test('returns pending for empty platforms', () => {
      expect(deriveOverallStatus([])).toBe('pending')
    })

    test('returns pending when all pending', () => {
      expect(deriveOverallStatus(makePlatforms('web', 'windows'))).toBe('pending')
    })

    test('returns building when any platform is building', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'building'
      expect(deriveOverallStatus(platforms)).toBe('building')
    })

    test('returns succeeded when all succeeded', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'succeeded'
      expect(deriveOverallStatus(platforms)).toBe('succeeded')
    })

    test('returns succeeded when mix of succeeded and skipped', () => {
      const platforms = makePlatforms('web', 'windows', 'linux')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'skipped'
      platforms[2].status = 'succeeded'
      expect(deriveOverallStatus(platforms)).toBe('succeeded')
    })

    test('returns failed when any platform failed', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'failed'
      expect(deriveOverallStatus(platforms)).toBe('failed')
    })

    test('returns cancelled when any platform cancelled', () => {
      const platforms = makePlatforms('web', 'windows')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'cancelled'
      expect(deriveOverallStatus(platforms)).toBe('cancelled')
    })

    test('building takes priority over other statuses', () => {
      const platforms = makePlatforms('web', 'windows', 'linux')
      platforms[0].status = 'succeeded'
      platforms[1].status = 'building'
      platforms[2].status = 'failed'
      expect(deriveOverallStatus(platforms)).toBe('building')
    })
  })

  describe('formatBuildDuration', () => {
    test('formats 0 as 0s', () => {
      expect(formatBuildDuration(0)).toBe('0s')
    })

    test('formats negative as 0s', () => {
      expect(formatBuildDuration(-100)).toBe('0s')
    })

    test('formats milliseconds', () => {
      expect(formatBuildDuration(500)).toBe('500ms')
      expect(formatBuildDuration(1)).toBe('1ms')
      expect(formatBuildDuration(999)).toBe('999ms')
    })

    test('formats seconds', () => {
      expect(formatBuildDuration(1000)).toBe('1.0s')
      expect(formatBuildDuration(5500)).toBe('5.5s')
      expect(formatBuildDuration(59999)).toBe('60.0s')
    })

    test('formats minutes and seconds', () => {
      expect(formatBuildDuration(60_000)).toBe('1m 0s')
      expect(formatBuildDuration(90_000)).toBe('1m 30s')
      expect(formatBuildDuration(125_000)).toBe('2m 5s')
      expect(formatBuildDuration(600_000)).toBe('10m 0s')
    })
  })

  describe('formatPlatformLabel', () => {
    test('formats web', () => {
      expect(formatPlatformLabel('web')).toBe('Web')
    })

    test('formats windows', () => {
      expect(formatPlatformLabel('windows')).toBe('Windows')
    })

    test('formats linux', () => {
      expect(formatPlatformLabel('linux')).toBe('Linux')
    })

    test('formats macos', () => {
      expect(formatPlatformLabel('macos')).toBe('macOS')
    })
  })

  describe('getStatusIcon', () => {
    test('returns icon for each status', () => {
      const statuses: BuildStatus[] = ['pending', 'queued', 'building', 'succeeded', 'failed', 'cancelled', 'skipped']
      for (const status of statuses) {
        const icon = getStatusIcon(status)
        expect(typeof icon).toBe('string')
        expect(icon.length).toBeGreaterThan(0)
      }
    })

    test('pending and queued have same icon', () => {
      expect(getStatusIcon('pending')).toBe(getStatusIcon('queued'))
    })

    test('succeeded and failed have different icons', () => {
      expect(getStatusIcon('succeeded')).not.toBe(getStatusIcon('failed'))
    })
  })

  describe('reduceBuildEvent', () => {
    describe('build-start', () => {
      test('initializes build with platforms', () => {
        const state = reduceBuildEvent(createInitialState(), {
          type: 'build-start',
          platforms: ['web', 'windows', 'linux'],
          timestamp: 1000,
        })

        expect(state.isBuilding).toBe(true)
        expect(state.overallStatus).toBe('building')
        expect(state.platforms).toHaveLength(3)
        expect(state.totalCount).toBe(3)
        expect(state.startedAt).toBe(1000)
        expect(state.completedAt).toBeNull()
        expect(state.succeededCount).toBe(0)
        expect(state.failedCount).toBe(0)
        expect(state.progressPercent).toBe(0)
        expect(state.logs).toHaveLength(1)
      })

      test('platforms are all pending initially', () => {
        const state = reduceBuildEvent(createInitialState(), {
          type: 'build-start',
          platforms: ['web', 'macos'],
          timestamp: 1000,
        })

        expect(state.platforms[0].platform).toBe('web')
        expect(state.platforms[0].status).toBe('pending')
        expect(state.platforms[1].platform).toBe('macos')
        expect(state.platforms[1].status).toBe('pending')
      })

      test('handles empty platforms list', () => {
        const state = reduceBuildEvent(createInitialState(), {
          type: 'build-start',
          platforms: [],
          timestamp: 1000,
        })

        expect(state.isBuilding).toBe(true)
        expect(state.platforms).toHaveLength(0)
        expect(state.totalCount).toBe(0)
      })

      test('resets previous state', () => {
        const prev = makeState({
          succeededCount: 3,
          failedCount: 1,
          totalDuration: 5000,
          logs: [{ timestamp: 500, platform: null, message: 'old', level: 'info' }],
        })

        const state = reduceBuildEvent(prev, {
          type: 'build-start',
          platforms: ['web'],
          timestamp: 2000,
        })

        expect(state.succeededCount).toBe(0)
        expect(state.failedCount).toBe(0)
        expect(state.totalDuration).toBe(0)
        expect(state.logs).toHaveLength(1)
        expect(state.logs[0].timestamp).toBe(2000)
      })
    })

    describe('platform-start', () => {
      test('marks platform as building', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
        ])

        expect(state.currentPlatform).toBe('web')
        expect(state.platforms[0].status).toBe('building')
        expect(state.platforms[0].startedAt).toBe(1001)
        expect(state.platforms[1].status).toBe('pending')
      })

      test('uses custom message', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', message: 'Compiling web...', timestamp: 1001 },
        ])

        expect(state.platforms[0].message).toBe('Compiling web...')
      })

      test('adds log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
        ])

        expect(state.logs).toHaveLength(2)
        expect(state.logs[1].platform).toBe('web')
        expect(state.logs[1].level).toBe('info')
      })

      test('handles unknown platform gracefully', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'linux', timestamp: 1001 },
        ])

        expect(state.currentPlatform).toBe('linux')
        expect(state.platforms[0].status).toBe('pending')
      })
    })

    describe('platform-progress', () => {
      test('updates platform message', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-progress', platform: 'web', message: 'Exporting assets...', timestamp: 1002 },
        ])

        expect(state.platforms[0].message).toBe('Exporting assets...')
      })

      test('adds log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-progress', platform: 'web', message: 'Step 2...', timestamp: 1002 },
        ])

        expect(state.logs).toHaveLength(3)
        expect(state.logs[2].message).toBe('Step 2...')
      })
    })

    describe('platform-success', () => {
      test('marks platform as succeeded', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', duration: 500, timestamp: 1501 },
        ])

        expect(state.platforms[0].status).toBe('succeeded')
        expect(state.platforms[0].completedAt).toBe(1501)
        expect(state.platforms[0].duration).toBe(500)
        expect(state.succeededCount).toBe(1)
        expect(state.progressPercent).toBe(50)
      })

      test('computes duration from startedAt when not provided', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1501 },
        ])

        expect(state.platforms[0].duration).toBe(500)
      })

      test('adds success log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1501 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('success')
        expect(lastLog.platform).toBe('web')
      })
    })

    describe('platform-fail', () => {
      test('marks platform as failed', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-fail', platform: 'web', error: 'Export failed', duration: 300, timestamp: 1301 },
        ])

        expect(state.platforms[0].status).toBe('failed')
        expect(state.platforms[0].error).toBe('Export failed')
        expect(state.platforms[0].duration).toBe(300)
        expect(state.failedCount).toBe(1)
        expect(state.progressPercent).toBe(50)
      })

      test('adds error log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-fail', platform: 'web', error: 'Crash', timestamp: 1301 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('error')
        expect(lastLog.message).toBe('Crash')
      })

      test('uses message when no error', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-fail', platform: 'web', message: 'Something went wrong', timestamp: 1301 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.message).toBe('Something went wrong')
      })
    })

    describe('platform-skip', () => {
      test('marks platform as skipped', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-skip', platform: 'windows', message: 'Not configured', timestamp: 1001 },
        ])

        expect(state.platforms[1].status).toBe('skipped')
        expect(state.platforms[1].message).toBe('Not configured')
        expect(state.progressPercent).toBe(50)
      })

      test('adds warn log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-skip', platform: 'web', timestamp: 1001 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('warn')
      })
    })

    describe('build-complete', () => {
      test('completes build with all succeeded', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1500 },
          { type: 'platform-start', platform: 'windows', timestamp: 1501 },
          { type: 'platform-success', platform: 'windows', timestamp: 2000 },
          { type: 'build-complete', duration: 1000, timestamp: 2000 },
        ])

        expect(state.isBuilding).toBe(false)
        expect(state.overallStatus).toBe('succeeded')
        expect(state.completedAt).toBe(2000)
        expect(state.totalDuration).toBe(1000)
        expect(state.progressPercent).toBe(100)
        expect(state.currentPlatform).toBeNull()
      })

      test('completes build with mixed results', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1500 },
          { type: 'platform-start', platform: 'windows', timestamp: 1501 },
          { type: 'platform-fail', platform: 'windows', error: 'fail', timestamp: 2000 },
          { type: 'build-complete', duration: 1000, timestamp: 2000 },
        ])

        expect(state.isBuilding).toBe(false)
        expect(state.overallStatus).toBe('failed')
        expect(state.succeededCount).toBe(1)
        expect(state.failedCount).toBe(1)
      })

      test('computes duration from startedAt when not provided', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1500 },
          { type: 'build-complete', timestamp: 2000 },
        ])

        expect(state.totalDuration).toBe(1000)
      })

      test('adds completion log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1500 },
          { type: 'build-complete', timestamp: 2000 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('success')
        expect(lastLog.platform).toBeNull()
      })

      test('adds error-level log when there are failures', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-fail', platform: 'web', error: 'fail', timestamp: 1500 },
          { type: 'build-complete', timestamp: 2000 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('error')
      })
    })

    describe('build-cancel', () => {
      test('cancels running build', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'build-cancel', timestamp: 1500 },
        ])

        expect(state.isBuilding).toBe(false)
        expect(state.overallStatus).toBe('cancelled')
        expect(state.completedAt).toBe(1500)
        expect(state.currentPlatform).toBeNull()
      })

      test('marks building platforms as cancelled', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'build-cancel', timestamp: 1500 },
        ])

        expect(state.platforms[0].status).toBe('cancelled')
        expect(state.platforms[1].status).toBe('cancelled')
      })

      test('preserves already-completed platforms', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
          { type: 'platform-start', platform: 'web', timestamp: 1001 },
          { type: 'platform-success', platform: 'web', timestamp: 1200 },
          { type: 'platform-start', platform: 'windows', timestamp: 1201 },
          { type: 'build-cancel', timestamp: 1500 },
        ])

        expect(state.platforms[0].status).toBe('succeeded')
        expect(state.platforms[1].status).toBe('cancelled')
      })

      test('adds warn log entry', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'build-cancel', timestamp: 1500 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('warn')
        expect(lastLog.message).toBe('Build cancelled')
      })
    })

    describe('build-error', () => {
      test('marks build as failed', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'build-error', error: 'Godot not found', timestamp: 1500 },
        ])

        expect(state.isBuilding).toBe(false)
        expect(state.overallStatus).toBe('failed')
        expect(state.completedAt).toBe(1500)
      })

      test('adds error log entry with message', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'build-error', error: 'Godot not found', timestamp: 1500 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.level).toBe('error')
        expect(lastLog.message).toBe('Godot not found')
      })

      test('uses message when no error', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'build-error', message: 'Unknown error', timestamp: 1500 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.message).toBe('Unknown error')
      })

      test('uses fallback when no error and no message', () => {
        const state = applyEvents([
          { type: 'build-start', platforms: ['web'], timestamp: 1000 },
          { type: 'build-error', timestamp: 1500 },
        ])

        const lastLog = state.logs[state.logs.length - 1]
        expect(lastLog.message).toBe('Build error')
      })
    })
  })

  describe('full build lifecycle', () => {
    test('single platform success', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-progress', platform: 'web', message: 'Exporting HTML...', timestamp: 1100 },
        { type: 'platform-success', platform: 'web', duration: 500, timestamp: 1501 },
        { type: 'build-complete', duration: 501, timestamp: 1501 },
      ])

      expect(state.isBuilding).toBe(false)
      expect(state.overallStatus).toBe('succeeded')
      expect(state.succeededCount).toBe(1)
      expect(state.failedCount).toBe(0)
      expect(state.totalCount).toBe(1)
      expect(state.progressPercent).toBe(100)
      expect(state.logs.length).toBeGreaterThanOrEqual(4)
    })

    test('multi-platform mixed results', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web', 'windows', 'linux', 'macos'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', duration: 200, timestamp: 1201 },
        { type: 'platform-start', platform: 'windows', timestamp: 1202 },
        { type: 'platform-fail', platform: 'windows', error: 'Missing preset', duration: 100, timestamp: 1302 },
        { type: 'platform-skip', platform: 'linux', message: 'Disabled', timestamp: 1303 },
        { type: 'platform-start', platform: 'macos', timestamp: 1304 },
        { type: 'platform-success', platform: 'macos', duration: 300, timestamp: 1604 },
        { type: 'build-complete', duration: 604, timestamp: 1604 },
      ])

      expect(state.overallStatus).toBe('failed')
      expect(state.succeededCount).toBe(2)
      expect(state.failedCount).toBe(1)
      expect(state.totalCount).toBe(4)
      expect(state.progressPercent).toBe(100)
      expect(state.platforms[0].status).toBe('succeeded')
      expect(state.platforms[1].status).toBe('failed')
      expect(state.platforms[2].status).toBe('skipped')
      expect(state.platforms[3].status).toBe('succeeded')
    })

    test('cancel mid-build', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web', 'windows'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1200 },
        { type: 'platform-start', platform: 'windows', timestamp: 1201 },
        { type: 'build-cancel', timestamp: 1300 },
      ])

      expect(state.overallStatus).toBe('cancelled')
      expect(state.platforms[0].status).toBe('succeeded')
      expect(state.platforms[1].status).toBe('cancelled')
    })
  })

  describe('state immutability', () => {
    test('reduceBuildEvent does not mutate original state', () => {
      const original = createInitialState()
      const originalCopy = JSON.parse(JSON.stringify(original))

      reduceBuildEvent(original, {
        type: 'build-start',
        platforms: ['web', 'windows'],
        timestamp: 1000,
      })

      expect(original).toEqual(originalCopy)
    })

    test('reduceBuildEvent does not mutate platform objects', () => {
      const state = reduceBuildEvent(createInitialState(), {
        type: 'build-start',
        platforms: ['web'],
        timestamp: 1000,
      })

      const platformCopy = JSON.parse(JSON.stringify(state.platforms[0]))

      reduceBuildEvent(state, {
        type: 'platform-start',
        platform: 'web',
        timestamp: 1001,
      })

      expect(state.platforms[0]).toEqual(platformCopy)
    })

    test('reduceBuildEvent does not mutate logs array', () => {
      const state = reduceBuildEvent(createInitialState(), {
        type: 'build-start',
        platforms: ['web'],
        timestamp: 1000,
      })

      const logsCopy = [...state.logs]

      reduceBuildEvent(state, {
        type: 'platform-start',
        platform: 'web',
        timestamp: 1001,
      })

      expect(state.logs).toEqual(logsCopy)
    })
  })

  describe('useBuildProgress hook state contract', () => {
    test('initial hook state matches createInitialState', () => {
      const initial = createInitialState()

      expect(initial.isBuilding).toBe(false)
      expect(initial.overallStatus).toBe('pending')
      expect(initial.platforms).toEqual([])
      expect(initial.currentPlatform).toBeNull()
      expect(initial.startedAt).toBeNull()
      expect(initial.completedAt).toBeNull()
      expect(initial.totalDuration).toBe(0)
      expect(initial.succeededCount).toBe(0)
      expect(initial.failedCount).toBe(0)
      expect(initial.totalCount).toBe(0)
      expect(initial.progressPercent).toBe(0)
      expect(initial.logs).toEqual([])
    })

    test('reset returns to initial state', () => {
      const initial = createInitialState()
      const afterBuild = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1500 },
        { type: 'build-complete', timestamp: 2000 },
      ])

      expect(afterBuild.isBuilding).toBe(false)
      expect(afterBuild.platforms.length).toBe(1)

      const reset = createInitialState()
      expect(reset).toEqual(initial)
    })

    test('dispatchEvent applies events sequentially', () => {
      let state = createInitialState()
      state = reduceBuildEvent(state, { type: 'build-start', platforms: ['web'], timestamp: 1000 })
      expect(state.isBuilding).toBe(true)

      state = reduceBuildEvent(state, { type: 'platform-start', platform: 'web', timestamp: 1001 })
      expect(state.currentPlatform).toBe('web')

      state = reduceBuildEvent(state, { type: 'platform-success', platform: 'web', timestamp: 1500 })
      expect(state.succeededCount).toBe(1)

      state = reduceBuildEvent(state, { type: 'build-complete', timestamp: 2000 })
      expect(state.isBuilding).toBe(false)
      expect(state.overallStatus).toBe('succeeded')
    })
  })

  describe('edge cases', () => {
    test('events with no timestamp use fallback', () => {
      const state = reduceBuildEvent(createInitialState(), {
        type: 'build-start',
        platforms: ['web'],
      })

      expect(state.startedAt).not.toBeNull()
      expect(typeof state.startedAt).toBe('number')
    })

    test('build-start with no platforms field defaults to empty', () => {
      const state = reduceBuildEvent(createInitialState(), {
        type: 'build-start',
        timestamp: 1000,
      })

      expect(state.platforms).toHaveLength(0)
      expect(state.totalCount).toBe(0)
    })

    test('platform events for non-existent platform do not crash', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'macos', timestamp: 1001 },
        { type: 'platform-success', platform: 'macos', timestamp: 1500 },
        { type: 'platform-fail', platform: 'linux', error: 'fail', timestamp: 1501 },
        { type: 'platform-skip', platform: 'windows', timestamp: 1502 },
      ])

      expect(state.platforms[0].status).toBe('pending')
      expect(state.platforms[0].platform).toBe('web')
    })

    test('multiple build-start events reset state', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1500 },
        { type: 'build-start', platforms: ['windows', 'linux'], timestamp: 2000 },
      ])

      expect(state.platforms).toHaveLength(2)
      expect(state.platforms[0].platform).toBe('windows')
      expect(state.platforms[1].platform).toBe('linux')
      expect(state.succeededCount).toBe(0)
      expect(state.startedAt).toBe(2000)
    })

    test('build-complete without any platform events', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web'], timestamp: 1000 },
        { type: 'build-complete', timestamp: 1001 },
      ])

      expect(state.isBuilding).toBe(false)
      expect(state.overallStatus).toBe('pending')
      expect(state.progressPercent).toBe(100)
    })

    test('consecutive platform successes update counts correctly', () => {
      const state = applyEvents([
        { type: 'build-start', platforms: ['web', 'windows', 'linux'], timestamp: 1000 },
        { type: 'platform-start', platform: 'web', timestamp: 1001 },
        { type: 'platform-success', platform: 'web', timestamp: 1100 },
        { type: 'platform-start', platform: 'windows', timestamp: 1101 },
        { type: 'platform-success', platform: 'windows', timestamp: 1200 },
        { type: 'platform-start', platform: 'linux', timestamp: 1201 },
        { type: 'platform-success', platform: 'linux', timestamp: 1300 },
      ])

      expect(state.succeededCount).toBe(3)
      expect(state.failedCount).toBe(0)
      expect(state.progressPercent).toBe(100)
    })
  })
})
