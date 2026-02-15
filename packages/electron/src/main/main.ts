import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  startServer,
  stopServer,
  checkHealth,
  getServerState,
  setDirectory,
  createSession,
  listSessions,
  deleteSession,
  sendPromptAsync,
  respondToPermission,
  replyToQuestion,
  rejectQuestion,
  listAgents,
  subscribeEvents,
  getDefaultModel,
  getProviders,
  setAuthKey,
  getAuthStatus,
  removeAuth,
  getActiveProvider,
  setActiveProvider,
  getStoredKey,
  getAgentConfigs,
  setAgentConfigs,
  type PromptOptions,
} from '@game-builder/agents'
import { createPreviewManager, type PreviewState } from '@game-builder/godot-manager'
import {
  initChatDb,
  saveMessage,
  getMessages,
  deleteProjectMessages,
  searchMessages,
  closeDatabase,
} from './chat-history'
import {
  listProjects,
  createProject,
  deleteProject,
} from './project-manager'
import {
  createDeepLinkAuth,
  saveToken,
  type AuthUser,
} from './deep-link-auth'
import {
  getExportPresets,
  createDefaultPresets,
  exportGodotProject,
  checkExportTemplates,
} from '@game-builder/godot-manager'
import {
  initializeAgents,
  listRegisteredAgents,
  orchestrate,
} from '@game-builder/agents'

process.stdout?.on('error', () => {})
process.stderr?.on('error', () => {})

const PROTOCOL = 'gamebuilder'
const BACKEND_URL = process.env.GAME_BUILDER_BACKEND_URL || 'http://localhost:3001'

let mainWindow: BrowserWindow | null = null
let pendingDeepLinkUrl: string | null = null
const previewManager = createPreviewManager()

const deepLinkAuth = createDeepLinkAuth({
  userDataPath: app.getPath('userData'),
  backendUrl: BACKEND_URL,
  encrypt: safeStorage.isEncryptionAvailable()
    ? (s) => safeStorage.encryptString(s)
    : null,
  decrypt: safeStorage.isEncryptionAvailable()
    ? (b) => safeStorage.decryptString(b)
    : null,
  onAuthStateChanged: (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:state-changed', state)
    }
  },
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

function readDirectoryTree(
  dirPath: string,
  basePath: string,
  depth: number,
  maxDepth: number
): FileNode[] {
  if (depth >= maxDepth || !existsSync(dirPath)) return []

  const entries = readdirSync(dirPath)
  const nodes: FileNode[] = []

  for (const entry of entries) {
    const fullPath = join(dirPath, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    const isDir = stat.isDirectory()

    // Filter out dot-prefixed directories, but keep dot-prefixed files
    if (isDir && entry.startsWith('.')) continue

    const relativePath = fullPath.slice(basePath.length + 1)

    const node: FileNode = {
      name: entry,
      path: relativePath,
      isDirectory: isDir,
    }

    if (isDir) {
      node.children = readDirectoryTree(fullPath, basePath, depth + 1, maxDepth)
    }

    nodes.push(node)
  }

  // Sort: directories first, then alphabetical
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

function registerOpenCodeIPC(): void {
  ipcMain.handle('opencode:health', async () => {
    return checkHealth()
  })

  ipcMain.handle('opencode:server-state', () => {
    return getServerState()
  })

  ipcMain.handle('opencode:set-directory', (_event, dir: string) => {
    setDirectory(dir)
    return true
  })

  ipcMain.handle('opencode:create-session', async (_event, title: string) => {
    return createSession(title)
  })

  ipcMain.handle('opencode:list-sessions', async () => {
    return listSessions()
  })

  ipcMain.handle('opencode:delete-session', async (_event, sessionId: string) => {
    return deleteSession(sessionId)
  })

  ipcMain.handle(
    'opencode:send-prompt',
    async (_event, options: Omit<PromptOptions, 'model'> & { model?: PromptOptions['model'] }) => {
      const model = options.model ?? getDefaultModel()
      await sendPromptAsync({ ...options, model })
      return { sent: true }
    }
  )

  ipcMain.handle('opencode:list-agents', async () => {
    return listAgents()
  })

  ipcMain.handle('opencode:subscribe-events', async () => {
    try {
      const { stream } = await subscribeEvents()

      ;(async () => {
        for await (const event of stream) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('opencode:event', event)
          }
        }
      })().catch((err) => {
        console.error('[opencode/ipc] SSE stream error:', err)
      })

      return { subscribed: true }
    } catch (err) {
      console.error('[opencode/ipc] Failed to subscribe:', err)
      return { subscribed: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'opencode:respond-permission',
    async (_event, sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => {
      await respondToPermission(sessionId, permissionId, response)
    }
  )

  ipcMain.handle(
    'opencode:reply-question',
    async (_event, requestID: string, answers: Array<Array<string>>) => {
      await replyToQuestion(requestID, answers)
    }
  )

  ipcMain.handle('opencode:reject-question', async (_event, requestID: string) => {
    await rejectQuestion(requestID)
  })

  ipcMain.handle('settings:get-providers', () => {
    return getProviders()
  })

  ipcMain.handle('settings:get-auth-status', () => {
    return getAuthStatus()
  })

  ipcMain.handle('settings:set-auth-key', async (_event, providerId: string, apiKey: string) => {
    try {
      await setAuthKey(providerId, apiKey)
      return true
    } catch (err) {
      console.error('[settings] Failed to set auth key:', err)
      throw err
    }
  })

  ipcMain.handle('settings:remove-auth', async (_event, providerId: string) => {
    await removeAuth(providerId)
    return true
  })

  ipcMain.handle('settings:get-active-provider', () => {
    return getActiveProvider()
  })

  ipcMain.handle('settings:set-active-provider', (_event, providerId: string, modelId: string) => {
    setActiveProvider(providerId, modelId)
    return true
  })

  ipcMain.handle('settings:get-stored-key', (_event, providerId: string) => {
    return getStoredKey(providerId)
  })

  ipcMain.handle('settings:get-agent-configs', () => {
    return getAgentConfigs()
  })

  ipcMain.handle('settings:set-agent-configs', (_event, configs: Array<{ name: string; modelId: string }>) => {
    setAgentConfigs(configs)
    return true
  })

  ipcMain.handle('auth:get-state', async () => {
    const token = deepLinkAuth.getToken()
    if (!token) return { authenticated: false, user: null }

    const cached = deepLinkAuth.getCurrentUser()
    if (cached) return { authenticated: true, user: cached }

    try {
      const response = await fetch(`${BACKEND_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = (await response.json()) as { user: AuthUser }
        deepLinkAuth.setCurrentUser(data.user)
        return { authenticated: true, user: data.user }
      }
    } catch {
      // backend unreachable — still authenticated locally
    }
    return { authenticated: true, user: null }
  })

  ipcMain.handle('auth:logout', () => {
    deepLinkAuth.logout()
    return true
  })

  ipcMain.handle('auth:open-login', () => {
    shell.openExternal(`${BACKEND_URL}`)
  })

  ipcMain.handle('auth:sign-in-email', async (_event, email: string, password: string) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      let message = `Sign-in failed (${response.status})`
      try {
        const err = (await response.json()) as { message?: string }
        if (err.message) message = err.message
      } catch { /* noop */ }
      throw new Error(message)
    }

    const data = (await response.json()) as {
      token: string
      user: AuthUser
    }
    saveToken(
      app.getPath('userData'),
      data.token,
      safeStorage.isEncryptionAvailable() ? (s) => safeStorage.encryptString(s) : null
    )
    deepLinkAuth.setCurrentUser(data.user)

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:state-changed', {
        authenticated: true,
        user: data.user,
      })
    }

    return { authenticated: true, user: data.user }
  })

  ipcMain.handle('godot:start-preview', async (_event, projectPath: string) => {
    previewManager.start(projectPath)
    return previewManager.getState()
  })

  ipcMain.handle('godot:stop-preview', async () => {
    previewManager.stop()
    return true
  })

  ipcMain.handle('godot:preview-status', () => {
    return previewManager.getState()
  })

  ipcMain.handle('chat:save-message', (_event, msg: { projectId: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number; metadata?: string }) => {
    return saveMessage(msg)
  })

  ipcMain.handle('chat:get-messages', (_event, projectId: string, limit?: number, offset?: number) => {
    return getMessages(projectId, limit, offset)
  })

  ipcMain.handle('chat:delete-messages', (_event, projectId: string) => {
    deleteProjectMessages(projectId)
    return true
  })

  ipcMain.handle('chat:search', (_event, projectId: string, query: string) => {
    return searchMessages(projectId, query)
  })

  ipcMain.handle('project:list', () => {
    return listProjects()
  })

  ipcMain.handle('project:create', (_event, name: string, template: string) => {
    return createProject(name, template)
  })

  ipcMain.handle('project:delete', (_event, path: string) => {
    return deleteProject(path)
  })

  ipcMain.handle('project:list-files', (_event, projectPath: string, maxDepth?: number) => {
    return readDirectoryTree(projectPath, projectPath, 0, maxDepth ?? 10)
  })

  ipcMain.handle('agents:initialize', async () => {
    initializeAgents()
    return true
  })

  ipcMain.handle('agents:list', () => {
    return listRegisteredAgents()
  })

  ipcMain.handle('agents:orchestrate', async (_event, userMessage: string, projectPath: string) => {
    return orchestrate(userMessage, projectPath, (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agents:progress', event)
      }
    })
  })

  ipcMain.handle('export:get-presets', (_event, projectPath: string) => {
    return getExportPresets(projectPath)
  })

  ipcMain.handle('export:run', async (_event, projectPath: string, preset: string, outputPath: string) => {
    return exportGodotProject({ projectPath, preset, outputPath })
  })

  ipcMain.handle('export:create-defaults', (_event, projectPath: string, platform?: string) => {
    createDefaultPresets(projectPath, platform)
    return true
  })

  ipcMain.handle('export:check-templates', async (_event, godotPath: string) => {
    return checkExportTemplates(godotPath)
  })
}

async function initOpenCode(): Promise<void> {
  console.log('[main] Starting OpenCode server...')
  const result = await startServer()

  if (result.success) {
    const state = getServerState()
    console.log(
      `[main] OpenCode server ready (v${state.version}, alreadyRunning: ${result.alreadyRunning})`
    )
  } else {
    console.error(`[main] OpenCode server failed: ${result.error}`)
  }
}

if (is.dev) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
    join(process.argv[1] || ''),
  ])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (deepLinkUrl) deepLinkAuth.handleDeepLink(deepLinkUrl)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) {
    deepLinkAuth.handleDeepLink(url)
  } else {
    pendingDeepLinkUrl = url
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.gamebuilder')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  await initChatDb()
  registerOpenCodeIPC()

  previewManager.onStateChanged((state: PreviewState) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('godot:preview-state-changed', state)
    }
  })

  previewManager.onOutput((line: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('godot:preview-output', line)
    }
  })

  createWindow()

  if (pendingDeepLinkUrl) {
    deepLinkAuth.handleDeepLink(pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }

  await initOpenCode()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  previewManager.stop()
  closeDatabase()
  await stopServer()
})
