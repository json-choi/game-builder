interface QuestionOption {
  label: string
  description: string
}

interface QuestionInfo {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

interface OpenCodeAPI {
  health: () => Promise<{ healthy: boolean; version?: string }>
  serverState: () => { status: string; version: string | null; pid: number | null }
  setDirectory: (dir: string) => Promise<boolean>
  createSession: (title: string) => Promise<{ id: string }>
  listSessions: () => Promise<Array<{ id: string; title: string }>>
  deleteSession: (sessionId: string) => Promise<void>
  sendPrompt: (options: {
    sessionId: string
    text: string
    model?: { providerID: string; modelID: string }
    agent?: string
    tools?: Record<string, boolean>
  }) => Promise<{ sent: boolean }>
  listAgents: () => Promise<unknown>
  respondPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
  replyQuestion: (requestID: string, answers: Array<Array<string>>) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  subscribeEvents: () => Promise<{ subscribed: boolean; error?: string }>
  onEvent: (callback: (event: unknown) => void) => () => void
}

interface ProviderModel {
  id: string
  name: string
  thinking?: boolean
  attachment?: boolean
  limit?: { context?: number; output?: number }
}

interface ProviderPreset {
  id: string
  name: string
  envVar: string
  models: ProviderModel[]
}

interface AgentModelConfig {
  name: string
  modelId: string
}

interface SettingsAPI {
  getProviders: () => Promise<ProviderPreset[]>
  getAuthStatus: () => Promise<Record<string, boolean>>
  setAuthKey: (providerId: string, apiKey: string) => Promise<boolean>
  removeAuth: (providerId: string) => Promise<boolean>
  getActiveProvider: () => Promise<{ providerId: string | null; modelId: string | null }>
  setActiveProvider: (providerId: string, modelId: string) => Promise<boolean>
  getStoredKey: (providerId: string) => Promise<string | null>
  getAgentConfigs: () => Promise<AgentModelConfig[]>
  setAgentConfigs: (configs: AgentModelConfig[]) => Promise<boolean>
}

interface AuthUser {
  id: string
  name: string
  email: string
  image: string | null
}

interface AuthState {
  authenticated: boolean
  user: AuthUser | null
}

interface AuthAPI {
  getState: () => Promise<AuthState>
  logout: () => Promise<boolean>
  openLogin: () => Promise<void>
  signInEmail: (email: string, password: string) => Promise<AuthState>
  onStateChanged: (callback: (state: AuthState) => void) => () => void
}

interface PreviewState {
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  pid: number | null
  error: string | null
  output: string[]
}

interface GodotAPI {
  startPreview: (projectPath: string) => Promise<PreviewState>
  stopPreview: () => Promise<boolean>
  getPreviewStatus: () => Promise<PreviewState>
  onPreviewStateChanged: (callback: (state: PreviewState) => void) => () => void
  onPreviewOutput: (callback: (line: string) => void) => () => void
}

interface ChatMessage {
  id: string
  projectId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: string
}

interface ChatAPI {
  saveMessage: (msg: Omit<ChatMessage, 'id'>) => Promise<string>
  getMessages: (projectId: string, limit?: number, offset?: number) => Promise<ChatMessage[]>
  deleteMessages: (projectId: string) => Promise<boolean>
  search: (projectId: string, query: string) => Promise<ChatMessage[]>
}

interface ProjectInfo {
  name: string
  path: string
  template: string
  createdAt: number
  modifiedAt: number
}

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

interface ProjectAPI {
  list: () => Promise<ProjectInfo[]>
  create: (name: string, template: string) => Promise<ProjectInfo>
  delete: (path: string) => Promise<boolean>
  listFiles: (projectPath: string, maxDepth?: number) => Promise<FileNode[]>
}

interface AgentProgressEvent {
  agent: string
  type: string
  step?: number
  totalSteps?: number
  message?: string
  files?: string[]
}

interface AgentsAPI {
  initialize: () => Promise<boolean>
  list: () => Promise<Array<{ name: string; displayName: string }>>
  orchestrate: (userMessage: string, projectPath: string) => Promise<{ success: boolean; results: unknown[] }>
  onProgress: (callback: (event: AgentProgressEvent) => void) => () => void
}

interface ExportPreset {
  name: string
  platform: 'windows' | 'macos' | 'linux' | 'web' | 'android' | 'ios'
  runnable: boolean
  exportPath: string
}

interface ExportResult {
  success: boolean
  outputPath: string
  error?: string
  duration: number
}

interface ExportAPI {
  getPresets: (projectPath: string) => Promise<ExportPreset[]>
  runExport: (projectPath: string, preset: string, outputPath: string) => Promise<ExportResult>
  createDefaults: (projectPath: string, platform?: string) => Promise<boolean>
  checkTemplates: (godotPath: string) => Promise<{ installed: boolean; version?: string }>
}

interface AppAPI {
  opencode: OpenCodeAPI
  settings: SettingsAPI
  auth: AuthAPI
  godot: GodotAPI
  chat: ChatAPI
  project: ProjectAPI
  agents: AgentsAPI
  export: ExportAPI
}

interface Window {
  api: AppAPI
  electron: unknown
}
