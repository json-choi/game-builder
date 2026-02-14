import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { SCENE_BUILDER_SYSTEM_PROMPT } from './system-prompt'
import { extractFiles, type ExtractedFile } from '../game-coder/code-extractor'

export interface SceneBuildResult {
  success: boolean
  scenes: ExtractedFile[]
  raw: string
}

export class SceneBuilderAgent {
  private sessionId: string | null = null

  async buildScenes(design: string, projectPath: string): Promise<SceneBuildResult> {
    if (!this.sessionId) {
      const session = await createSession('Scene Builder')
      this.sessionId = session.id
    }

    const fullPrompt = [
      SCENE_BUILDER_SYSTEM_PROMPT,
      '---',
      `Project path: ${projectPath}`,
      `Design specification:\n${design}`,
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    const raw = response.text || ''
    const scenes = extractFiles(raw).filter(
      (f) => f.path.endsWith('.tscn') || f.path.endsWith('.tres')
    )

    return {
      success: scenes.length > 0,
      scenes,
      raw,
    }
  }
}
