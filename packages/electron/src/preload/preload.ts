import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const opencode = {
  health: () => ipcRenderer.invoke('opencode:health'),
  serverState: () => ipcRenderer.invoke('opencode:server-state'),
  setDirectory: (dir: string) => ipcRenderer.invoke('opencode:set-directory', dir),
  createSession: (title: string) => ipcRenderer.invoke('opencode:create-session', title),
  listSessions: () => ipcRenderer.invoke('opencode:list-sessions'),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('opencode:delete-session', sessionId),
  sendPrompt: (options: {
    sessionId: string
    text: string
    model?: { providerID: string; modelID: string }
    agent?: string
    tools?: Record<string, boolean>
    attachments?: Array<{ media_type: string; data: string }>
  }) => ipcRenderer.invoke('opencode:send-prompt', options),
  listAgents: () => ipcRenderer.invoke('opencode:list-agents'),
  respondPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') =>
    ipcRenderer.invoke('opencode:respond-permission', sessionId, permissionId, response),
  replyQuestion: (requestID: string, answers: Array<Array<string>>) =>
    ipcRenderer.invoke('opencode:reply-question', requestID, answers),
  rejectQuestion: (requestID: string) =>
    ipcRenderer.invoke('opencode:reject-question', requestID),
  subscribeEvents: () => ipcRenderer.invoke('opencode:subscribe-events'),
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_ipcEvent: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('opencode:event', handler)
    return () => ipcRenderer.removeListener('opencode:event', handler)
  },
}

const settings = {
  getProviders: () => ipcRenderer.invoke('settings:get-providers'),
  getAuthStatus: () => ipcRenderer.invoke('settings:get-auth-status'),
  setAuthKey: (providerId: string, apiKey: string) =>
    ipcRenderer.invoke('settings:set-auth-key', providerId, apiKey),
  removeAuth: (providerId: string) => ipcRenderer.invoke('settings:remove-auth', providerId),
  getActiveProvider: () => ipcRenderer.invoke('settings:get-active-provider'),
  setActiveProvider: (providerId: string, modelId: string) =>
    ipcRenderer.invoke('settings:set-active-provider', providerId, modelId),
  getStoredKey: (providerId: string) => ipcRenderer.invoke('settings:get-stored-key', providerId),
  getAgentConfigs: () => ipcRenderer.invoke('settings:get-agent-configs'),
  setAgentConfigs: (configs: Array<{ name: string; modelId: string }>) =>
    ipcRenderer.invoke('settings:set-agent-configs', configs),
}

const auth = {
  getState: () => ipcRenderer.invoke('auth:get-state'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  openLogin: () => ipcRenderer.invoke('auth:open-login'),
  signInEmail: (email: string, password: string) =>
    ipcRenderer.invoke('auth:sign-in-email', email, password),
  onStateChanged: (callback: (state: { authenticated: boolean; user: unknown }) => void) => {
    const handler = (
      _ipcEvent: Electron.IpcRendererEvent,
      data: { authenticated: boolean; user: unknown }
    ) => callback(data)
    ipcRenderer.on('auth:state-changed', handler)
    return () => ipcRenderer.removeListener('auth:state-changed', handler)
  },
}

const godot = {
  startPreview: (projectPath: string) => ipcRenderer.invoke('godot:start-preview', projectPath),
  stopPreview: () => ipcRenderer.invoke('godot:stop-preview'),
  getPreviewStatus: () => ipcRenderer.invoke('godot:preview-status'),
  onPreviewStateChanged: (callback: (state: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('godot:preview-state-changed', handler)
    return () => ipcRenderer.removeListener('godot:preview-state-changed', handler)
  },
  onPreviewOutput: (callback: (line: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on('godot:preview-output', handler)
    return () => ipcRenderer.removeListener('godot:preview-output', handler)
  },
}

const chat = {
  saveMessage: (msg: { projectId: string; role: string; content: string; timestamp: number; metadata?: string }) =>
    ipcRenderer.invoke('chat:save-message', msg),
  getMessages: (projectId: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke('chat:get-messages', projectId, limit, offset),
  deleteMessages: (projectId: string) =>
    ipcRenderer.invoke('chat:delete-messages', projectId),
  search: (projectId: string, query: string) =>
    ipcRenderer.invoke('chat:search', projectId, query),
}

const project = {
  list: () => ipcRenderer.invoke('project:list'),
  create: (name: string, template: string) => ipcRenderer.invoke('project:create', name, template),
  delete: (path: string) => ipcRenderer.invoke('project:delete', path),
  listFiles: (projectPath: string, maxDepth?: number) =>
    ipcRenderer.invoke('project:list-files', projectPath, maxDepth),
  readFile: (projectPath: string, relativePath: string) =>
    ipcRenderer.invoke('project:read-file', projectPath, relativePath),
  writeFile: (projectPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('project:write-file', projectPath, relativePath, content),
}

const agents = {
  initialize: () => ipcRenderer.invoke('agents:initialize'),
  list: () => ipcRenderer.invoke('agents:list'),
  orchestrate: (userMessage: string, projectPath: string) =>
    ipcRenderer.invoke('agents:orchestrate', userMessage, projectPath),
  onProgress: (callback: (event: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('agents:progress', handler)
    return () => ipcRenderer.removeListener('agents:progress', handler)
  },
}

const gameExport = {
  getPresets: (projectPath: string) => ipcRenderer.invoke('export:get-presets', projectPath),
  runExport: (projectPath: string, preset: string, outputPath: string) =>
    ipcRenderer.invoke('export:run', projectPath, preset, outputPath),
  createDefaults: (projectPath: string, platform?: string) =>
    ipcRenderer.invoke('export:create-defaults', projectPath, platform),
  checkTemplates: (godotPath: string) => ipcRenderer.invoke('export:check-templates', godotPath),
}

const api = { opencode, settings, auth, godot, chat, project, agents, export: gameExport }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
