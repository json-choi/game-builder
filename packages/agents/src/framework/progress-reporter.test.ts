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

  test('each method invokes callback exactly once', () => {
    let callCount = 0
    const reporter = createProgressReporter(() => { callCount++ })

    reporter.agentStart('a')
    expect(callCount).toBe(1)

    reporter.stepStart('a', 1, 'msg')
    expect(callCount).toBe(2)

    reporter.stepEnd('a')
    expect(callCount).toBe(3)

    reporter.fileChanged([])
    expect(callCount).toBe(4)

    reporter.complete()
    expect(callCount).toBe(5)

    reporter.error('err')
    expect(callCount).toBe(6)
  })

  test('multiple reporters from createProgressReporter are independent', () => {
    const events1: AgentProgressEvent[] = []
    const events2: AgentProgressEvent[] = []
    const reporter1 = createProgressReporter((e) => events1.push(e))
    const reporter2 = createProgressReporter((e) => events2.push(e))

    reporter1.agentStart('agent-a', 2)
    reporter2.agentStart('agent-b', 3)
    reporter1.complete()

    expect(events1).toHaveLength(2)
    expect(events2).toHaveLength(1)
    expect(events1[0].agent).toBe('agent-a')
    expect(events2[0].agent).toBe('agent-b')
  })

  test('full lifecycle: start → steps → error flow', () => {
    const { events, reporter } = collectEvents()
    reporter.agentStart('debugger', 2)
    reporter.stepStart('debugger', 1, 'Analyzing')
    reporter.stepEnd('debugger', 'Found issues', ['main.gd'])
    reporter.stepStart('debugger', 2, 'Fixing')
    reporter.error('Could not fix: syntax error')

    expect(events).toHaveLength(5)
    expect(events.map((e) => e.type)).toEqual([
      'agent-start',
      'step-start',
      'step-end',
      'step-start',
      'error',
    ])
    expect(events[4].message).toBe('Could not fix: syntax error')
  })

  test('full lifecycle: multi-agent orchestration flow', () => {
    const { events, reporter } = collectEvents()

    // Orchestrator plans
    reporter.agentStart('orchestrator', 3)
    reporter.stepStart('orchestrator', 1, 'Creating plan')
    reporter.stepEnd('orchestrator', 'Plan ready')

    // Designer executes
    reporter.stepStart('designer', 2, 'Designing game')
    reporter.stepEnd('designer', 'Design complete')

    // Coder executes
    reporter.stepStart('coder', 3, 'Writing code')
    reporter.fileChanged(['player.gd', 'enemy.gd'])
    reporter.stepEnd('coder', 'Code written', ['main.tscn'])

    reporter.complete()

    expect(events).toHaveLength(9)

    const stepStarts = events.filter((e) => e.type === 'step-start')
    expect(stepStarts.map((e) => e.agent)).toEqual(['orchestrator', 'designer', 'coder'])

    const fileEvents = events.filter((e) => e.type === 'file-changed')
    expect(fileEvents).toHaveLength(1)
    expect(fileEvents[0].filesChanged).toEqual(['player.gd', 'enemy.gd'])
  })

  describe('agentStart', () => {
    test('totalSteps defaults to undefined when 0 is passed', () => {
      const { events, reporter } = collectEvents()
      reporter.agentStart('agent', 0)
      expect(events[0]).toEqual({ type: 'agent-start', agent: 'agent', totalSteps: 0 })
    })
  })

  describe('stepStart', () => {
    test('preserves step number 0', () => {
      const { events, reporter } = collectEvents()
      reporter.stepStart('agent', 0, 'Step zero')
      expect(events[0].step).toBe(0)
    })

    test('preserves empty message string', () => {
      const { events, reporter } = collectEvents()
      reporter.stepStart('agent', 1, '')
      expect(events[0].message).toBe('')
    })
  })

  describe('error', () => {
    test('preserves empty error message', () => {
      const { events, reporter } = collectEvents()
      reporter.error('')
      expect(events[0]).toEqual({ type: 'error', message: '' })
    })
  })
})
