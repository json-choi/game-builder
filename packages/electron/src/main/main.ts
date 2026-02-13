import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  startServer,
  stopServer,
  checkHealth,
  getServerState,
  createSession,
  listSessions,
  deleteSession,
  sendPrompt,
  listAgents,
  subscribeEvents,
  getDefaultModel,
  type PromptOptions,
} from '@game-builder/agents'

let mainWindow: BrowserWindow | null = null

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

function registerOpenCodeIPC(): void {
  ipcMain.handle('opencode:health', async () => {
    return checkHealth()
  })

  ipcMain.handle('opencode:server-state', () => {
    return getServerState()
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
      return sendPrompt({ ...options, model })
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  registerOpenCodeIPC()
  createWindow()

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
  await stopServer()
})
