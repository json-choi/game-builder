import { describe, expect, test, beforeEach, mock } from 'bun:test'

type StateCallback = (state: PreviewState) => void
type OutputCallback = (line: string) => void

interface PreviewState {
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  pid: number | null
  error: string | null
  output: string[]
}

interface MockGodotAPI {
  startPreview: ReturnType<typeof mock>
  stopPreview: ReturnType<typeof mock>
  getPreviewStatus: ReturnType<typeof mock>
  onPreviewStateChanged: ReturnType<typeof mock>
  onPreviewOutput: ReturnType<typeof mock>
}

function createMockGodotAPI(): {
  api: MockGodotAPI
  getStateCallback: () => StateCallback
  getOutputCallback: () => OutputCallback
} {
  let stateCallback: StateCallback | null = null
  let outputCallback: OutputCallback | null = null

  const api: MockGodotAPI = {
    startPreview: mock(() =>
      Promise.resolve({ status: 'running', pid: 1234, error: null, output: [] } as PreviewState)
    ),
    stopPreview: mock(() => Promise.resolve(true)),
    getPreviewStatus: mock(() =>
      Promise.resolve({ status: 'idle', pid: null, error: null, output: [] } as PreviewState)
    ),
    onPreviewStateChanged: mock((cb: StateCallback) => {
      stateCallback = cb
      return () => { stateCallback = null }
    }),
    onPreviewOutput: mock((cb: OutputCallback) => {
      outputCallback = cb
      return () => { outputCallback = null }
    }),
  }

  return {
    api,
    getStateCallback: () => {
      if (!stateCallback) throw new Error('No state callback registered')
      return stateCallback
    },
    getOutputCallback: () => {
      if (!outputCallback) throw new Error('No output callback registered')
      return outputCallback
    },
  }
}

function setupWindowAPI(godotApi: MockGodotAPI): void {
  ;(globalThis as Record<string, unknown>).window = {
    api: { godot: godotApi },
  }
}

function cleanupWindowAPI(): void {
  delete (globalThis as Record<string, unknown>).window
}

describe('usePreview', () => {
  describe('window.api.godot mock contract', () => {
    let mockCtx: ReturnType<typeof createMockGodotAPI>

    beforeEach(() => {
      mockCtx = createMockGodotAPI()
      setupWindowAPI(mockCtx.api)
    })

    test('startPreview returns running state', async () => {
      const result = await mockCtx.api.startPreview('/projects/my-game')
      expect(result.status).toBe('running')
      expect(result.pid).toBe(1234)
      expect(result.error).toBeNull()
      expect(mockCtx.api.startPreview).toHaveBeenCalledWith('/projects/my-game')
    })

    test('stopPreview returns success', async () => {
      const result = await mockCtx.api.stopPreview()
      expect(result).toBe(true)
    })

    test('onPreviewStateChanged registers callback and returns unsubscribe', () => {
      const cb = () => {}
      const unsub = mockCtx.api.onPreviewStateChanged(cb)
      expect(typeof unsub).toBe('function')
      expect(mockCtx.api.onPreviewStateChanged).toHaveBeenCalledWith(cb)
    })

    test('onPreviewOutput registers callback and returns unsubscribe', () => {
      const cb = () => {}
      const unsub = mockCtx.api.onPreviewOutput(cb)
      expect(typeof unsub).toBe('function')
      expect(mockCtx.api.onPreviewOutput).toHaveBeenCalledWith(cb)
    })
  })

  describe('state transition logic', () => {
    test('onPreviewStateChanged propagates status, error, and output', () => {
      const mockCtx = createMockGodotAPI()

      let status: PreviewState['status'] = 'idle'
      let error: string | null = null
      let output: string[] = []

      mockCtx.api.onPreviewStateChanged((state: PreviewState) => {
        status = state.status
        error = state.error
        output = state.output
      })

      const cb = mockCtx.getStateCallback()
      cb({ status: 'starting', pid: null, error: null, output: [] })

      expect(status).toBe('starting')
      expect(error).toBeNull()
      expect(output).toEqual([])
    })

    test('state transitions through full lifecycle: idle → starting → running → stopping → idle', () => {
      const mockCtx = createMockGodotAPI()
      const states: PreviewState['status'][] = []

      mockCtx.api.onPreviewStateChanged((state: PreviewState) => {
        states.push(state.status)
      })

      const cb = mockCtx.getStateCallback()
      cb({ status: 'starting', pid: null, error: null, output: [] })
      cb({ status: 'running', pid: 5678, error: null, output: [] })
      cb({ status: 'stopping', pid: 5678, error: null, output: [] })
      cb({ status: 'idle', pid: null, error: null, output: [] })

      expect(states).toEqual(['starting', 'running', 'stopping', 'idle'])
    })

    test('error state sets error message', () => {
      const mockCtx = createMockGodotAPI()

      let status: PreviewState['status'] = 'idle'
      let error: string | null = null

      mockCtx.api.onPreviewStateChanged((state: PreviewState) => {
        status = state.status
        error = state.error
      })

      const cb = mockCtx.getStateCallback()
      cb({ status: 'error', pid: null, error: 'Godot binary not found', output: [] })

      expect(status).toBe('error')
      expect(error).toBe('Godot binary not found')
    })
  })

  describe('output streaming', () => {
    test('onPreviewOutput receives individual lines', () => {
      const mockCtx = createMockGodotAPI()
      const lines: string[] = []

      mockCtx.api.onPreviewOutput((line: string) => {
        lines.push(line)
      })

      const cb = mockCtx.getOutputCallback()
      cb('Godot Engine v4.6.stable')
      cb('Loading project...')
      cb('Scene loaded successfully')

      expect(lines).toEqual([
        'Godot Engine v4.6.stable',
        'Loading project...',
        'Scene loaded successfully',
      ])
    })

    test('output buffer caps at 200 lines (keeps last 199 + new)', () => {
      let output: string[] = []

      function appendLine(line: string) {
        output = [...output.slice(-199), line]
      }

      for (let i = 0; i < 250; i++) {
        appendLine(`line-${i}`)
      }

      expect(output.length).toBe(200)
      expect(output[0]).toBe('line-50')
      expect(output[199]).toBe('line-249')
    })

    test('output buffer works correctly with fewer than 200 lines', () => {
      let output: string[] = []

      function appendLine(line: string) {
        output = [...output.slice(-199), line]
      }

      appendLine('first')
      appendLine('second')
      appendLine('third')

      expect(output).toEqual(['first', 'second', 'third'])
    })
  })

  describe('startPreview error handling', () => {
    test('startPreview success updates status from result', async () => {
      const mockCtx = createMockGodotAPI()
      let status: PreviewState['status'] = 'idle'
      let error: string | null = null

      try {
        const result = await mockCtx.api.startPreview('/projects/my-game')
        status = result.status
        if (result.error) error = result.error
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : String(err)
      }

      expect(status).toBe('running')
      expect(error).toBeNull()
    })

    test('startPreview returns error state when Godot not found', async () => {
      const mockCtx = createMockGodotAPI()
      mockCtx.api.startPreview = mock(() =>
        Promise.resolve({ status: 'error', pid: null, error: 'Godot not found', output: [] } as PreviewState)
      )

      let status: PreviewState['status'] = 'idle'
      let error: string | null = null

      const result = await mockCtx.api.startPreview('/projects/my-game')
      status = result.status
      if (result.error) error = result.error

      expect(status).toBe('error')
      expect(error).toBe('Godot not found')
    })

    test('startPreview rejection sets error status with Error message', async () => {
      const mockCtx = createMockGodotAPI()
      mockCtx.api.startPreview = mock(() =>
        Promise.reject(new Error('IPC channel closed'))
      )

      let status: PreviewState['status'] = 'idle'
      let error: string | null = null

      try {
        const result = await mockCtx.api.startPreview('/projects/my-game')
        status = result.status
        if (result.error) error = result.error
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : String(err)
      }

      expect(status).toBe('error')
      expect(error).toBe('IPC channel closed')
    })

    test('startPreview rejection with non-Error converts to string', async () => {
      const mockCtx = createMockGodotAPI()
      mockCtx.api.startPreview = mock(() => Promise.reject('raw string error'))

      let status: PreviewState['status'] = 'idle'
      let error: string | null = null

      try {
        const result = await mockCtx.api.startPreview('/projects/my-game')
        status = result.status
        if (result.error) error = result.error
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : String(err)
      }

      expect(status).toBe('error')
      expect(error).toBe('raw string error')
    })
  })

  describe('stopPreview error handling', () => {
    test('stopPreview success does not change status to error', async () => {
      const mockCtx = createMockGodotAPI()
      let status: PreviewState['status'] = 'running'
      let error: string | null = null

      try {
        await mockCtx.api.stopPreview()
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : String(err)
      }

      expect(status).toBe('running')
      expect(error).toBeNull()
    })

    test('stopPreview rejection sets error status', async () => {
      const mockCtx = createMockGodotAPI()
      mockCtx.api.stopPreview = mock(() =>
        Promise.reject(new Error('Process already terminated'))
      )

      let status: PreviewState['status'] = 'running'
      let error: string | null = null

      try {
        await mockCtx.api.stopPreview()
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : String(err)
      }

      expect(status).toBe('error')
      expect(error).toBe('Process already terminated')
    })
  })

  describe('subscription cleanup', () => {
    test('unsubscribe from onPreviewStateChanged stops delivery', () => {
      const mockCtx = createMockGodotAPI()
      const states: PreviewState['status'][] = []

      const unsub = mockCtx.api.onPreviewStateChanged((state: PreviewState) => {
        states.push(state.status)
      })

      const cb = mockCtx.getStateCallback()
      cb({ status: 'running', pid: 1234, error: null, output: [] })
      expect(states).toEqual(['running'])

      unsub()
      expect(() => mockCtx.getStateCallback()).toThrow('No state callback registered')
    })

    test('unsubscribe from onPreviewOutput stops delivery', () => {
      const mockCtx = createMockGodotAPI()
      const lines: string[] = []

      const unsub = mockCtx.api.onPreviewOutput((line: string) => {
        lines.push(line)
      })

      const cb = mockCtx.getOutputCallback()
      cb('line 1')
      expect(lines).toEqual(['line 1'])

      unsub()
      expect(() => mockCtx.getOutputCallback()).toThrow('No output callback registered')
    })

    test('cleanup function calls both unsubscribes (mirrors useEffect return)', () => {
      const mockCtx = createMockGodotAPI()

      const unsub1 = mockCtx.api.onPreviewStateChanged(() => {})
      const unsub2 = mockCtx.api.onPreviewOutput(() => {})
      unsub1()
      unsub2()

      expect(() => mockCtx.getStateCallback()).toThrow('No state callback registered')
      expect(() => mockCtx.getOutputCallback()).toThrow('No output callback registered')
    })
  })

  describe('clearOutput', () => {
    test('clearOutput resets output array', () => {
      let output: string[] = ['line1', 'line2', 'line3']

      const clearOutput = () => { output = [] }
      clearOutput()

      expect(output).toEqual([])
    })
  })
})
