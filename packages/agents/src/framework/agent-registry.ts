import type { AgentDefinition } from './types'

const registry = new Map<string, AgentDefinition>()

export function registerAgent(definition: AgentDefinition): void {
  registry.set(definition.name, definition)
}

export function getAgent(name: string): AgentDefinition | undefined {
  return registry.get(name)
}

export function listRegisteredAgents(): AgentDefinition[] {
  return Array.from(registry.values())
}

export function clearRegistry(): void {
  registry.clear()
}
