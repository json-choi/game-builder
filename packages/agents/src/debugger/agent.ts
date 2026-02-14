import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { DEBUGGER_SYSTEM_PROMPT } from './system-prompt'
import { extractFiles, type ExtractedFile } from '../game-coder/code-extractor'

export interface DebugResult {
  success: boolean
  fixes: ExtractedFile[]
  raw: string
}

export class DebuggerAgent {
  private sessionId: string | null = null

  async debug(errors: string, projectPath: string): Promise<DebugResult> {
    if (!this.sessionId) {
      const session = await createSession('Debugger')
      this.sessionId = session.id
    }

    const fullPrompt = [
      DEBUGGER_SYSTEM_PROMPT,
      '---',
      `Project path: ${projectPath}`,
      `Godot validation errors:\n${errors}`,
      '',
      'Fix ALL errors and output the complete corrected files.',
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    const raw = response.text || ''
    const fixes = extractFiles(raw)

    return {
      success: fixes.length > 0,
      fixes,
      raw,
    }
  }
}
