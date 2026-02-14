const TOOL_RESTRICTIONS: Record<string, string[]> = {
  orchestrator: ['read_file', 'list_files'],
  'game-designer': ['read_file', 'write_file', 'list_files'],
  'scene-builder': ['read_file', 'write_file', 'list_files', 'validate_project'],
  'game-coder': ['read_file', 'write_file', 'list_files', 'validate_project', 'validate_script'],
  debugger: ['read_file', 'write_file', 'list_files', 'validate_project', 'validate_script'],
  reviewer: ['read_file', 'list_files', 'validate_project'],
  'asset-generator': ['read_file', 'write_file', 'list_files'],
}

export function getToolsForAgent(agentName: string): string[] {
  return TOOL_RESTRICTIONS[agentName] || []
}

export function isToolAllowed(agentName: string, toolName: string): boolean {
  const allowed = TOOL_RESTRICTIONS[agentName]
  if (!allowed) return false
  return allowed.includes(toolName)
}
