import { describe, expect, mock, test } from 'bun:test'

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

    test('getState returns a snapshot (not a reference)', () => {
      const mgr = createPreviewManager()
      const s1 = mgr.getState()
      const s2 = mgr.getState()
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
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
  })
})
