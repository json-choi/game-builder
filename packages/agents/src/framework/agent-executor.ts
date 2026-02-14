import { sendPrompt } from '../opencode/client'
import { getOrCreateAgentSession } from './session-manager'
import type { AgentDefinition, AgentExecutionContext, AgentResult } from './types'

export async function executeAgent(
  definition: AgentDefinition,
  prompt: string,
  context: AgentExecutionContext
): Promise<AgentResult> {
  context.onProgress?.({
    type: 'agent-start',
    agent: definition.name,
    message: `${definition.displayName} starting...`,
  })

  try {
    const sessionId = await getOrCreateAgentSession(definition.name)
    const fullPrompt = `${definition.systemPrompt}\n\n---\n\n${prompt}`

    const response = await sendPrompt({
      sessionId,
      text: fullPrompt,
      model: definition.defaultModel,
    })

    context.onProgress?.({
      type: 'step-end',
      agent: definition.name,
      message: `${definition.displayName} completed`,
    })

    return {
      success: true,
      agent: definition.name,
      filesChanged: [],
      errors: [],
      output: response.text || '',
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    context.onProgress?.({
      type: 'error',
      agent: definition.name,
      message: `${definition.displayName} failed: ${errorMsg}`,
    })

    return {
      success: false,
      agent: definition.name,
      filesChanged: [],
      errors: [errorMsg],
      output: '',
    }
  }
}
