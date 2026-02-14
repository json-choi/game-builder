import { createSession } from '../opencode/client'

const agentSessions = new Map<string, string>()

export async function getOrCreateAgentSession(agentName: string): Promise<string> {
  const existing = agentSessions.get(agentName)
  if (existing) return existing

  const session = await createSession(`Agent: ${agentName}`)
  agentSessions.set(agentName, session.id)
  return session.id
}

export function clearAgentSessions(): void {
  agentSessions.clear()
}
