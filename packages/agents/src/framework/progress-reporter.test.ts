import { describe, expect, test } from 'bun:test'
import { createProgressReporter } from './progress-reporter'
import type { AgentProgressEvent } from './types'

describe('progress-reporter', () => {
  function collectEvents() {
    const events: AgentProgressEvent[] = []
    const reporter = createProgressReporter((e) => events.push(e))
    return { events, reporter }
  }

  describe('agentStart', () => {
    test('emits agent-start event with agent name', () => {
      const { events, reporter } = collectEvents()
      reporter.agentStart('game-coder')

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'agent-start', agent: 'game-coder', totalSteps: undefined })
    })

    test('emits agent-start event with totalSteps', () => {
      const { events, reporter } = collectEvents()
      reporter.agentStart('game-coder', 5)

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'agent-start', agent: 'game-coder', totalSteps: 5 })
    })
  })

  describe('stepStart', () => {
    test('emits step-start event', () => {
      const { events, reporter } = collectEvents()
      reporter.stepStart('debugger', 1, 'Analyzing errors')

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'step-start',
        agent: 'debugger',
        step: 1,
        message: 'Analyzing errors',
      })
    })
  })

  describe('stepEnd', () => {
    test('emits step-end event with all fields', () => {
      const { events, reporter } = collectEvents()
      reporter.stepEnd('game-coder', 'Done writing code', ['player.gd', 'enemy.gd'])

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'step-end',
        agent: 'game-coder',
        message: 'Done writing code',
        filesChanged: ['player.gd', 'enemy.gd'],
      })
    })

    test('emits step-end event with optional fields omitted', () => {
      const { events, reporter } = collectEvents()
      reporter.stepEnd('game-coder')

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'step-end',
        agent: 'game-coder',
        message: undefined,
        filesChanged: undefined,
      })
    })
  })

  describe('fileChanged', () => {
    test('emits file-changed event with file list', () => {
      const { events, reporter } = collectEvents()
      reporter.fileChanged(['main.tscn', 'player.gd'])

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'file-changed',
        filesChanged: ['main.tscn', 'player.gd'],
      })
    })

    test('emits file-changed event with empty list', () => {
      const { events, reporter } = collectEvents()
      reporter.fileChanged([])

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'file-changed', filesChanged: [] })
    })
  })

  describe('complete', () => {
    test('emits complete event', () => {
      const { events, reporter } = collectEvents()
      reporter.complete()

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'complete' })
    })
  })

  describe('error', () => {
    test('emits error event with message', () => {
      const { events, reporter } = collectEvents()
      reporter.error('Something went wrong')

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'error', message: 'Something went wrong' })
    })
  })

  test('collects multiple events in order', () => {
    const { events, reporter } = collectEvents()
    reporter.agentStart('coder', 3)
    reporter.stepStart('coder', 1, 'Step 1')
    reporter.stepEnd('coder', 'Step 1 done')
    reporter.fileChanged(['file.gd'])
    reporter.complete()

    expect(events).toHaveLength(5)
    expect(events.map((e) => e.type)).toEqual([
      'agent-start',
      'step-start',
      'step-end',
      'file-changed',
      'complete',
    ])
  })
})
