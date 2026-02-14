import type { AgentProgressEvent } from './types'

export interface ProgressReporter {
  agentStart(agent: string, totalSteps?: number): void
  stepStart(agent: string, step: number, message: string): void
  stepEnd(agent: string, message?: string, filesChanged?: string[]): void
  fileChanged(files: string[]): void
  complete(): void
  error(message: string): void
}

export function createProgressReporter(
  callback: (event: AgentProgressEvent) => void
): ProgressReporter {
  return {
    agentStart(agent, totalSteps) {
      callback({ type: 'agent-start', agent, totalSteps })
    },
    stepStart(agent, step, message) {
      callback({ type: 'step-start', agent, step, message })
    },
    stepEnd(agent, message, filesChanged) {
      callback({ type: 'step-end', agent, message, filesChanged })
    },
    fileChanged(files) {
      callback({ type: 'file-changed', filesChanged: files })
    },
    complete() {
      callback({ type: 'complete' })
    },
    error(message) {
      callback({ type: 'error', message })
    },
  }
}
