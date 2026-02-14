import { getAgent } from './agent-registry'
import { executeAgent } from './agent-executor'
import { createProgressReporter } from './progress-reporter'
import { acquireFileLock } from './file-lock'
import type { AgentProgressEvent, AgentResult, OrchestrationPlan } from './types'

export async function orchestrate(
  userMessage: string,
  projectPath: string,
  onProgress?: (event: AgentProgressEvent) => void
): Promise<{ success: boolean; results: AgentResult[] }> {
  const reporter = onProgress ? createProgressReporter(onProgress) : null
  const results: AgentResult[] = []

  const orchestratorDef = getAgent('orchestrator')
  if (!orchestratorDef) throw new Error('Orchestrator agent not registered')

  reporter?.agentStart('orchestrator', 5)
  reporter?.stepStart('orchestrator', 1, 'Creating execution plan...')

  const planResult = await executeAgent(orchestratorDef, userMessage, {
    projectPath,
    sessionId: '',
    onProgress,
  })
  results.push(planResult)

  let plan: OrchestrationPlan
  try {
    const parsed = JSON.parse(planResult.output)
    if (parsed.steps && Array.isArray(parsed.steps)) {
      plan = parsed as OrchestrationPlan
    } else {
      plan = {
        steps: [{ agent: 'game-coder', task: userMessage, dependsOn: [] }],
        totalSteps: 1,
      }
    }
  } catch {
    plan = {
      steps: [{ agent: 'game-coder', task: userMessage, dependsOn: [] }],
      totalSteps: 1,
    }
  }

  reporter?.stepEnd('orchestrator', 'Plan created')

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    const agentDef = getAgent(step.agent)
    if (!agentDef) {
      reporter?.error(`Agent not found: ${step.agent}`)
      continue
    }

    reporter?.stepStart(step.agent, i + 2, `${agentDef.displayName}: ${step.task}`)

    const release = await acquireFileLock()
    try {
      const result = await executeAgent(agentDef, step.task, {
        projectPath,
        sessionId: '',
        onProgress,
      })
      results.push(result)

      if (!result.success && agentDef.maxRetries > 1) {
        for (let retry = 1; retry < agentDef.maxRetries; retry++) {
          reporter?.stepStart(
            step.agent,
            i + 2,
            `${agentDef.displayName}: retry ${retry}/${agentDef.maxRetries - 1}`
          )
          const retryResult = await executeAgent(
            agentDef,
            `Previous attempt failed with errors:\n${result.errors.join('\n')}\n\nOriginal task: ${step.task}`,
            { projectPath, sessionId: '', onProgress }
          )
          results.push(retryResult)
          if (retryResult.success) break
        }
      }
    } finally {
      release()
    }

    reporter?.stepEnd(step.agent, `${agentDef.displayName} completed`)
  }

  reporter?.stepStart('reviewer', plan.steps.length + 2, 'Reviewing code quality...')
  const reviewerDef = getAgent('reviewer')
  if (reviewerDef) {
    const reviewResult = await executeAgent(
      reviewerDef,
      'Review the generated project files for quality and best practices.',
      { projectPath, sessionId: '', onProgress }
    )
    results.push(reviewResult)
  }
  reporter?.stepEnd('reviewer', 'Review complete')

  reporter?.complete()
  return { success: results.every((r) => r.success), results }
}
