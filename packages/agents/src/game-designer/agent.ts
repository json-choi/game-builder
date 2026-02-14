import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { GAME_DESIGNER_SYSTEM_PROMPT } from './system-prompt'

export interface DesignResult {
  design: string
  success: boolean
}

export class GameDesignerAgent {
  private sessionId: string | null = null

  async design(request: string, projectPath: string): Promise<DesignResult> {
    if (!this.sessionId) {
      const session = await createSession('Game Designer')
      this.sessionId = session.id
    }

    const fullPrompt = [
      GAME_DESIGNER_SYSTEM_PROMPT,
      '---',
      `Project path: ${projectPath}`,
      `User Request: ${request}`,
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    return {
      design: response.text || '',
      success: !!response.text,
    }
  }
}
