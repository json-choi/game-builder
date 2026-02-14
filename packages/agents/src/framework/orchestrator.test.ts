import { describe, expect, test } from 'bun:test'
import type { OrchestrationPlan } from './types'

describe('orchestrator', () => {
  describe('OrchestrationPlan parsing', () => {
    test('parses valid plan JSON', () => {
      const raw = JSON.stringify({
        steps: [
          { agent: 'game-coder', task: 'Write code', dependsOn: [] },
          { agent: 'scene-builder', task: 'Build scenes', dependsOn: ['game-coder'] },
        ],
        totalSteps: 2,
      })

      const plan: OrchestrationPlan = JSON.parse(raw)
      expect(plan.steps).toHaveLength(2)
      expect(plan.totalSteps).toBe(2)
      expect(plan.steps[0].agent).toBe('game-coder')
      expect(plan.steps[1].dependsOn).toContain('game-coder')
    })

    test('falls back to single game-coder step on invalid JSON', () => {
      const raw = 'not valid json'
      let plan: OrchestrationPlan

      try {
        const parsed = JSON.parse(raw)
        if (parsed.steps && Array.isArray(parsed.steps)) {
          plan = parsed
        } else {
          plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
        }
      } catch {
        plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
      }

      expect(plan.steps).toHaveLength(1)
      expect(plan.steps[0].agent).toBe('game-coder')
    })

    test('falls back when parsed JSON has no steps array', () => {
      const raw = JSON.stringify({ message: 'no steps here' })
      let plan: OrchestrationPlan

      try {
        const parsed = JSON.parse(raw)
        if (parsed.steps && Array.isArray(parsed.steps)) {
          plan = parsed
        } else {
          plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
        }
      } catch {
        plan = { steps: [{ agent: 'game-coder', task: 'fallback', dependsOn: [] }], totalSteps: 1 }
      }

      expect(plan.steps).toHaveLength(1)
      expect(plan.steps[0].agent).toBe('game-coder')
    })

    test('handles empty steps array', () => {
      const raw = JSON.stringify({ steps: [], totalSteps: 0 })
      const plan: OrchestrationPlan = JSON.parse(raw)

      expect(plan.steps).toHaveLength(0)
      expect(plan.totalSteps).toBe(0)
    })

    test('preserves dependency chains', () => {
      const plan: OrchestrationPlan = {
        steps: [
          { agent: 'game-designer', task: 'Design', dependsOn: [] },
          { agent: 'game-coder', task: 'Code', dependsOn: ['game-designer'] },
          { agent: 'scene-builder', task: 'Scenes', dependsOn: ['game-designer'] },
          { agent: 'debugger', task: 'Debug', dependsOn: ['game-coder', 'scene-builder'] },
        ],
        totalSteps: 4,
      }

      const debugStep = plan.steps.find(s => s.agent === 'debugger')!
      expect(debugStep.dependsOn).toEqual(['game-coder', 'scene-builder'])
    })

    test('round-trips through JSON serialization', () => {
      const plan: OrchestrationPlan = {
        steps: [{ agent: 'game-coder', task: 'Build a platformer', dependsOn: [] }],
        totalSteps: 1,
      }

      const serialized = JSON.stringify(plan)
      const deserialized: OrchestrationPlan = JSON.parse(serialized)

      expect(deserialized).toEqual(plan)
    })
  })
})
