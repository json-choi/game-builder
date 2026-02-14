import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { ORCHESTRATOR_SYSTEM_PROMPT } from './system-prompt'
import type { OrchestrationPlan } from '../framework/types'

export interface PlanResult {
  plan: OrchestrationPlan
  raw: string
}

export class OrchestratorAgent {
  private sessionId: string | null = null

  async createPlan(userMessage: string): Promise<PlanResult> {
    if (!this.sessionId) {
      const session = await createSession('Orchestrator')
      this.sessionId = session.id
    }

    const fullPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT}\n\n---\n\nUser Request: ${userMessage}`
    const model = getDefaultModel()

    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    const raw = response.text || ''

    try {
      const parsed = JSON.parse(raw)
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return { plan: parsed as OrchestrationPlan, raw }
      }
    } catch {
      // Fallback: single game-coder step
    }

    return {
      plan: {
        steps: [{ agent: 'game-coder', task: userMessage, dependsOn: [] }],
        totalSteps: 1,
      },
      raw,
    }
  }
}
