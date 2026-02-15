import { useState, useEffect } from 'react'

interface ProgressStep {
  agent: string
  step: number
  totalSteps: number
  message: string
  status: 'pending' | 'running' | 'done' | 'error'
  filesChanged: string[]
}

interface ProgressState {
  active: boolean
  steps: ProgressStep[]
  currentAgent: string | null
  currentStep: number
  totalSteps: number
}

interface ProgressEvent {
  type: 'agent-start' | 'step-start' | 'step-end' | 'file-changed' | 'complete' | 'error'
  agent?: string
  step?: number
  totalSteps?: number
  message?: string
  filesChanged?: string[]
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>({
    active: false,
    steps: [],
    currentAgent: null,
    currentStep: 0,
    totalSteps: 0
  })

  useEffect(() => {
    if (!window.api?.agents?.onProgress) return

    const cleanup = window.api.agents.onProgress((raw) => {
      const event = raw as ProgressEvent
      setProgress(prev => {
        const newState = { ...prev }

        switch (event.type) {
          case 'agent-start':
            newState.active = true
            newState.currentAgent = event.agent || null
            newState.totalSteps = event.totalSteps || 0
            newState.steps = []
            break
          
          case 'step-start':
            newState.active = true
            newState.currentStep = event.step || 0
            if (event.totalSteps) newState.totalSteps = event.totalSteps
            
            newState.steps.push({
              agent: event.agent || newState.currentAgent || 'unknown',
              step: event.step || newState.steps.length + 1,
              totalSteps: event.totalSteps || newState.totalSteps,
              message: event.message || '',
              status: 'running',
              filesChanged: []
            })
            break

          case 'step-end':
            if (newState.steps.length > 0) {
              const lastStep = newState.steps[newState.steps.length - 1]
              lastStep.status = 'done'
              if (event.message) lastStep.message = event.message
              if (event.filesChanged) lastStep.filesChanged = event.filesChanged
            }
            break

          case 'file-changed':
            if (newState.steps.length > 0 && event.filesChanged) {
              const lastStep = newState.steps[newState.steps.length - 1]
              lastStep.filesChanged = [...lastStep.filesChanged, ...event.filesChanged]
            }
            break

          case 'error':
            if (newState.steps.length > 0) {
              const lastStep = newState.steps[newState.steps.length - 1]
              lastStep.status = 'error'
              if (event.message) lastStep.message = event.message
            }
            newState.active = false
            break

          case 'complete':
            newState.active = false
            newState.currentAgent = null
            newState.steps.forEach(s => {
              if (s.status === 'running') s.status = 'done'
            })
            break
        }

        return newState
      })
    })

    return cleanup
  }, [])

  const clearProgress = () => {
    setProgress({
      active: false,
      steps: [],
      currentAgent: null,
      currentStep: 0,
      totalSteps: 0
    })
  }

  return { progress, isActive: progress.active, clearProgress }
}
