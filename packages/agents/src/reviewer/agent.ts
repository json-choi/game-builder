import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { REVIEWER_SYSTEM_PROMPT } from './system-prompt'

export interface ReviewResult {
  summary: 'PASS' | 'PASS_WITH_NOTES' | 'NEEDS_FIXES' | 'UNKNOWN'
  review: string
  success: boolean
}

export class ReviewerAgent {
  private sessionId: string | null = null

  async review(projectPath: string, context?: string): Promise<ReviewResult> {
    if (!this.sessionId) {
      const session = await createSession('Reviewer')
      this.sessionId = session.id
    }

    const fullPrompt = [
      REVIEWER_SYSTEM_PROMPT,
      '---',
      `Project path: ${projectPath}`,
      context ? `Additional context:\n${context}` : '',
      '',
      'Review all generated files in the project for quality and best practices.',
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    const raw = response.text || ''
    let summary: ReviewResult['summary'] = 'UNKNOWN'

    if (raw.includes('PASS_WITH_NOTES')) {
      summary = 'PASS_WITH_NOTES'
    } else if (raw.includes('NEEDS_FIXES')) {
      summary = 'NEEDS_FIXES'
    } else if (raw.includes('PASS')) {
      summary = 'PASS'
    }

    return {
      summary,
      review: raw,
      success: summary !== 'NEEDS_FIXES',
    }
  }
}
