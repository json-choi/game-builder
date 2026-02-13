import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const opencode = {
  health: () => ipcRenderer.invoke('opencode:health'),
  serverState: () => ipcRenderer.invoke('opencode:server-state'),
  createSession: (title: string) => ipcRenderer.invoke('opencode:create-session', title),
  listSessions: () => ipcRenderer.invoke('opencode:list-sessions'),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('opencode:delete-session', sessionId),
  sendPrompt: (options: {
    sessionId: string
    text: string
    model?: { providerID: string; modelID: string }
    agent?: string
    tools?: string[]
  }) => ipcRenderer.invoke('opencode:send-prompt', options),
  listAgents: () => ipcRenderer.invoke('opencode:list-agents'),
  subscribeEvents: () => ipcRenderer.invoke('opencode:subscribe-events'),
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_ipcEvent: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('opencode:event', handler)
    return () => ipcRenderer.removeListener('opencode:event', handler)
  },
}

const api = { opencode }

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
