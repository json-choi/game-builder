import { registerAgent } from './framework/agent-registry'
import type { AgentDefinition } from './framework/types'
import { ORCHESTRATOR_SYSTEM_PROMPT } from './orchestrator/system-prompt'
import { GAME_DESIGNER_SYSTEM_PROMPT } from './game-designer/system-prompt'
import { GAME_CODER_SYSTEM_PROMPT } from './game-coder/system-prompt'
import { SCENE_BUILDER_SYSTEM_PROMPT } from './scene-builder/system-prompt'
import { DEBUGGER_SYSTEM_PROMPT } from './debugger/system-prompt'
import { REVIEWER_SYSTEM_PROMPT } from './reviewer/system-prompt'
import { PLUGIN_RECOMMENDER_SYSTEM_PROMPT } from './plugin-recommender/system-prompt'

const agents: AgentDefinition[] = [
  {
    name: 'orchestrator',
    displayName: 'Orchestrator',
    description: 'Decomposes user requests and creates execution plans',
    category: 'planning',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-opus-4-6' },
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    tools: { read_file: true, list_files: true },
    maxRetries: 1,
  },
  {
    name: 'game-designer',
    displayName: 'Game Designer',
    description: 'Creates game design documents with scene structures and mechanics',
    category: 'planning',
    defaultModel: { providerID: 'openai', modelID: 'gpt-5.2' },
    systemPrompt: GAME_DESIGNER_SYSTEM_PROMPT,
    tools: { read_file: true, write_file: true, list_files: true },
    maxRetries: 2,
  },
  {
    name: 'game-coder',
    displayName: 'Game Coder',
    description: 'Writes GDScript code and implements game logic',
    category: 'coding',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
    systemPrompt: GAME_CODER_SYSTEM_PROMPT,
    tools: {
      read_file: true,
      write_file: true,
      list_files: true,
      validate_project: true,
      validate_script: true,
    },
    maxRetries: 3,
  },
  {
    name: 'scene-builder',
    displayName: 'Scene Builder',
    description: 'Generates Godot .tscn scene files and node trees',
    category: 'building',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
    systemPrompt: SCENE_BUILDER_SYSTEM_PROMPT,
    tools: { read_file: true, write_file: true, list_files: true, validate_project: true },
    maxRetries: 2,
  },
  {
    name: 'debugger',
    displayName: 'Debugger',
    description: 'Analyzes Godot errors and fixes broken scripts and scenes',
    category: 'debugging',
    defaultModel: { providerID: 'openai', modelID: 'gpt-5.2' },
    systemPrompt: DEBUGGER_SYSTEM_PROMPT,
    tools: {
      read_file: true,
      write_file: true,
      list_files: true,
      validate_project: true,
      validate_script: true,
    },
    maxRetries: 3,
  },
  {
    name: 'reviewer',
    displayName: 'Reviewer',
    description: 'Reviews generated code quality and best practices',
    category: 'reviewing',
    defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    tools: { read_file: true, list_files: true, validate_project: true },
    maxRetries: 1,
  },
  {
    name: 'plugin-recommender',
    displayName: 'Plugin Recommender',
    description: 'Recommends Godot plugins based on game requirements and design documents',
    category: 'recommending',
    defaultModel: { providerID: 'openai', modelID: 'gpt-5.2' },
    systemPrompt: PLUGIN_RECOMMENDER_SYSTEM_PROMPT,
    tools: { read_file: true, list_files: true },
    maxRetries: 2,
  },
]

export function initializeAgents(): void {
  for (const agent of agents) {
    registerAgent(agent)
  }
}

export { agents as AGENT_DEFINITIONS }
