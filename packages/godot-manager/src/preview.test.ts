import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'events'
import type { PreviewState } from './preview'

function createMockChildProcess() {
  const emitter = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  return Object.assign(emitter, {
    pid: 12345,
    stdout,
    stderr,
    stdin: null,
    killed: false,
    kill(signal?: string) {
      ;(this as unknown as { killed: boolean }).killed = true
      emitter.emit('close', signal === 'SIGKILL' ? -9 : 0)
    },
  })
}

mock.module('./detect.js', () => ({
  detectGodot: () => ({
    found: true,
    path: '/usr/bin/godot',
    version: { major: 4, minor: 6, patch: 0, label: 'stable', build: '', hash: '', raw: '4.6' },
    compatible: true,
    source: 'path' as const,
  }),
  getArchitecture: () => ({ platform: process.platform, arch: process.arch, archLabel: 'x86_64' }),
  clearQuarantine: () => true,
}))

let latestMockChild: ReturnType<typeof createMockChildProcess> | null = null

mock.module('./cli.js', () => ({
  spawnGodotPreview: () => {
    latestMockChild = createMockChildProcess()
    return latestMockChild
  },
  spawnGodotEditor: () => createMockChildProcess(),
  checkOnly: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
  runHeadless: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
  exportProject: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
  getVersion: async () => ({ exitCode: 0, stdout: '4.6', stderr: '', timedOut: false }),
}))

const { createPreviewManager } = await import('./preview')

describe('preview', () => {
  describe('createPreviewManager', () => {
    test('creates a manager with all required methods', () => {
      const mgr = createPreviewManager()
      expect(typeof mgr.start).toBe('function')
      expect(typeof mgr.stop).toBe('function')
      expect(typeof mgr.getState).toBe('function')
      expect(typeof mgr.onStateChanged).toBe('function')
      expect(typeof mgr.onOutput).toBe('function')
    })

    test('initial state is idle', () => {
      const mgr = createPreviewManager()
      const state = mgr.getState()
      expect(state.status).toBe('idle')
      expect(state.error).toBeNull()
      expect(state.output).toEqual([])
    })

    test('initial state has null pid', () => {
      const mgr = createPreviewManager()
      expect(mgr.getState().pid).toBeNull()
    })

    test('getState returns a snapshot (not a reference)', () => {
      const mgr = createPreviewManager()
      const s1 = mgr.getState()
      const s2 = mgr.getState()
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
    })

    test('getState output array is a copy', () => {
      const mgr = createPreviewManager()
      const s1 = mgr.getState()
      s1.output.push('mutated')
      expect(mgr.getState().output).toEqual([])
    })

    test('onStateChanged returns unsubscribe function', () => {
      const mgr = createPreviewManager()
      const unsub = mgr.onStateChanged(() => {})
      expect(typeof unsub).toBe('function')
    })

    test('onOutput returns unsubscribe function', () => {
      const mgr = createPreviewManager()
      const unsub = mgr.onOutput(() => {})
      expect(typeof unsub).toBe('function')
    })

    test('stop does nothing when idle', () => {
      const mgr = createPreviewManager()
      mgr.stop()
      expect(mgr.getState().status).toBe('idle')
    })

    test('multiple stops when idle do not change state', () => {
      const mgr = createPreviewManager()
      mgr.stop()
      mgr.stop()
      mgr.stop()
      expect(mgr.getState().status).toBe('idle')
    })

    test('onStateChanged listener fires on start', () => {
      const mgr = createPreviewManager()
      const states: PreviewState[] = []
      mgr.onStateChanged((s) => states.push({ ...s, output: [...s.output] }))

      mgr.start('/tmp/test-project')

      expect(states.length).toBeGreaterThan(0)
      expect(states[0].status).toBe('starting')
    })

    test('start transitions to starting then running on stdout data', () => {
      const mgr = createPreviewManager()
      const states: PreviewState[] = []
      mgr.onStateChanged((s) => states.push({ ...s, output: [...s.output] }))

      mgr.start('/tmp/test-project')

      expect(latestMockChild).not.toBeNull()
      latestMockChild!.stdout.emit('data', Buffer.from('Godot Engine v4.6\n'))

      const statuses = states.map((s) => s.status)
      expect(statuses).toContain('starting')
      expect(statuses).toContain('running')
    })

    test('start sets pid from child process', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')

      const state = mgr.getState()
      expect(state.pid).toBe(12345)
    })

    test('stdout data is captured in output', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')

      latestMockChild!.stdout.emit('data', Buffer.from('line one\nline two\n'))

      const state = mgr.getState()
      expect(state.output).toContain('line one')
      expect(state.output).toContain('line two')
    })

    test('stderr data is captured in output', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')

      latestMockChild!.stderr.emit('data', Buffer.from('error message\n'))

      const state = mgr.getState()
      expect(state.output).toContain('error message')
    })

    test('onOutput listener receives each line', () => {
      const mgr = createPreviewManager()
      const lines: string[] = []
      mgr.onOutput((line) => lines.push(line))

      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('hello\nworld\n'))

      expect(lines).toContain('hello')
      expect(lines).toContain('world')
    })

    test('stop transitions to stopping then idle on close', () => {
      const mgr = createPreviewManager()
      const states: PreviewState[] = []
      mgr.onStateChanged((s) => states.push({ ...s, output: [...s.output] }))

      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('running\n'))

      mgr.stop()

      const statuses = states.map((s) => s.status)
      expect(statuses).toContain('stopping')
      expect(mgr.getState().status).toBe('idle')
    })

    test('close with non-zero code sets error when not stopping', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('running\n'))

      latestMockChild!.emit('close', 1)

      const state = mgr.getState()
      expect(state.status).toBe('error')
      expect(state.error).toContain('exited with code 1')
    })

    test('close with code 0 transitions to idle', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('running\n'))

      latestMockChild!.emit('close', 0)

      expect(mgr.getState().status).toBe('idle')
    })

    test('error event transitions to error status', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')

      latestMockChild!.emit('error', new Error('spawn failed'))

      const state = mgr.getState()
      expect(state.status).toBe('error')
      expect(state.error).toContain('spawn failed')
    })

    test('double start is ignored when already starting', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')

      const firstChild = latestMockChild
      mgr.start('/tmp/test-project')

      expect(latestMockChild).toBe(firstChild)
    })

    test('double start is ignored when already running', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('running\n'))
      expect(mgr.getState().status).toBe('running')

      const firstChild = latestMockChild
      mgr.start('/tmp/test-project')

      expect(latestMockChild).toBe(firstChild)
    })

    test('unsubscribe prevents further listener calls', () => {
      const mgr = createPreviewManager()
      let callCount = 0
      const unsub = mgr.onStateChanged(() => {
        callCount++
      })

      unsub()

      mgr.start('/tmp/test-project')
      expect(callCount).toBe(0)
    })

    test('onOutput unsubscribe prevents further calls', () => {
      const mgr = createPreviewManager()
      let callCount = 0
      const unsub = mgr.onOutput(() => {
        callCount++
      })

      unsub()

      mgr.start('/tmp/test-project')
      latestMockChild!.stdout.emit('data', Buffer.from('test\n'))
      expect(callCount).toBe(0)
    })

    test('multiple listeners can be registered', () => {
      const mgr = createPreviewManager()
      const calls1: PreviewState[] = []
      const calls2: PreviewState[] = []

      mgr.onStateChanged((s) => calls1.push({ ...s, output: [...s.output] }))
      mgr.onStateChanged((s) => calls2.push({ ...s, output: [...s.output] }))

      mgr.start('/tmp/test-project')

      expect(calls1.length).toBe(calls2.length)
      expect(calls1.length).toBeGreaterThan(0)
    })

    test('pid is null after close', () => {
      const mgr = createPreviewManager()
      mgr.start('/tmp/test-project')
      expect(mgr.getState().pid).toBe(12345)

      latestMockChild!.emit('close', 0)

      expect(mgr.getState().pid).toBeNull()
    })

    test('state has all PreviewState interface fields', () => {
      const mgr = createPreviewManager()
      const state = mgr.getState()
      expect(state).toHaveProperty('status')
      expect(state).toHaveProperty('pid')
      expect(state).toHaveProperty('error')
      expect(state).toHaveProperty('output')
      expect(Array.isArray(state.output)).toBe(true)
    })
  })
})
