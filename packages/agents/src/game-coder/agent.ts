import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { GAME_CODER_SYSTEM_PROMPT } from './system-prompt'
import { extractFiles, type ExtractedFile } from './code-extractor'
import { createProjectTools } from './tools'

export interface GenerateOptions {
  prompt: string
  projectPath: string
  maxRetries?: number
  model?: { providerID: string; modelID: string }
  onProgress?: (event: GameCoderEvent) => void
}

export interface GameCoderEvent {
  type: 'generating' | 'extracting' | 'writing' | 'validating' | 'retrying' | 'complete' | 'error'
  message: string
  attempt?: number
  files?: ExtractedFile[]
}

export interface GenerateResult {
  success: boolean
  files: ExtractedFile[]
  errors: string[]
  attempts: number
}

export class GameCoderAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { prompt, projectPath, maxRetries = 3, onProgress } = options
    const model = options.model ?? getDefaultModel()
    const tools = createProjectTools(projectPath)
    const writeTool = tools.find((t) => t.name === 'write_file')!
    const validateTool = tools.find((t) => t.name === 'validate_project')!

    const errors: string[] = []
    let lastFiles: ExtractedFile[] = []
    let currentPrompt = `${GAME_CODER_SYSTEM_PROMPT}\n\n---\n\nUser Request: ${prompt}`

    const session = await createSession('Game Coder')

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      onProgress?.({
        type: 'generating',
        message: `Generating code (attempt ${attempt}/${maxRetries})...`,
        attempt,
      })

      const response = await sendPrompt({
        sessionId: session.id,
        text: currentPrompt,
        model,
      })

      if (!response.text) {
        errors.push(`Attempt ${attempt}: No response from AI`)
        continue
      }

      onProgress?.({
        type: 'extracting',
        message: 'Extracting files from response...',
        attempt,
      })

      const files = extractFiles(response.text)
      if (files.length === 0) {
        errors.push(`Attempt ${attempt}: No files extracted from response`)
        currentPrompt = `The previous response did not contain any valid Godot files. Please generate the files again, wrapping each in a code block with a "# filename:" comment on the first line.\n\nOriginal request: ${prompt}`
        continue
      }

      lastFiles = files

      onProgress?.({
        type: 'writing',
        message: `Writing ${files.length} file(s)...`,
        attempt,
        files,
      })

      for (const file of files) {
        await writeTool.execute({ path: file.path, content: file.content })
      }

      onProgress?.({
        type: 'validating',
        message: 'Validating project with Godot...',
        attempt,
      })

      const validation = (await validateTool.execute({})) as {
        exitCode: number
        stdout: string
        stderr: string
      }

      if (validation.exitCode === 0) {
        onProgress?.({
          type: 'complete',
          message: `Successfully generated ${files.length} file(s)`,
          attempt,
          files,
        })
        return { success: true, files, errors, attempts: attempt }
      }

      const errorMsg = validation.stderr || validation.stdout || 'Unknown validation error'
      errors.push(`Attempt ${attempt}: Validation failed — ${errorMsg}`)

      if (attempt < maxRetries) {
        onProgress?.({
          type: 'retrying',
          message: `Validation failed, retrying (${attempt}/${maxRetries})...`,
          attempt,
        })

        currentPrompt = [
          'The generated code has Godot validation errors. Fix ALL errors and regenerate the complete files.',
          '',
          '## Validation Errors',
          errorMsg,
          '',
          '## Original Request',
          prompt,
        ].join('\n')
      }
    }

    onProgress?.({
      type: 'error',
      message: `Failed after ${maxRetries} attempts`,
      files: lastFiles,
    })

    return { success: false, files: lastFiles, errors, attempts: maxRetries }
  }
}
