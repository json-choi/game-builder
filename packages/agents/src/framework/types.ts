export interface AgentDefinition {
  name: string
  displayName: string
  description: string
  category: 'planning' | 'coding' | 'building' | 'debugging' | 'reviewing' | 'recommending'
  defaultModel: { providerID: string; modelID: string }
  systemPrompt: string
  tools: Record<string, boolean>
  maxRetries: number
}

export interface AgentExecutionContext {
  projectPath: string
  sessionId: string
  onProgress?: (event: AgentProgressEvent) => void
}

export interface AgentProgressEvent {
  type: 'agent-start' | 'step-start' | 'step-end' | 'file-changed' | 'complete' | 'error'
  agent?: string
  step?: number
  totalSteps?: number
  message?: string
  filesChanged?: string[]
}

export interface OrchestrationPlan {
  steps: PlanStep[]
  totalSteps: number
}

export interface PlanStep {
  agent: string
  task: string
  dependsOn: string[]
}

export interface AgentResult {
  success: boolean
  agent: string
  filesChanged: string[]
  errors: string[]
  output: string
}
