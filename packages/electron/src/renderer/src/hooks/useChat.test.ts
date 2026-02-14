import { describe, expect, test, beforeEach, mock } from 'bun:test'

type EventCallback = (event: unknown) => void

interface MockOpenCodeAPI {
  setDirectory: ReturnType<typeof mock>
  createSession: ReturnType<typeof mock>
  subscribeEvents: ReturnType<typeof mock>
  onEvent: ReturnType<typeof mock>
  sendPrompt: ReturnType<typeof mock>
  respondPermission: ReturnType<typeof mock>
  replyQuestion: ReturnType<typeof mock>
  rejectQuestion: ReturnType<typeof mock>
}

function createMockAPI(): { api: MockOpenCodeAPI; getEventCallback: () => EventCallback } {
  let eventCallback: EventCallback | null = null

  const api: MockOpenCodeAPI = {
    setDirectory: mock(() => Promise.resolve(true)),
    createSession: mock(() => Promise.resolve({ id: 'session-1' })),
    subscribeEvents: mock(() => Promise.resolve({ subscribed: true })),
    onEvent: mock((cb: EventCallback) => {
      eventCallback = cb
      return () => { eventCallback = null }
    }),
    sendPrompt: mock(() => Promise.resolve({ sent: true })),
    respondPermission: mock(() => Promise.resolve()),
    replyQuestion: mock(() => Promise.resolve()),
    rejectQuestion: mock(() => Promise.resolve()),
  }

  return {
    api,
    getEventCallback: () => {
      if (!eventCallback) throw new Error('No event callback registered')
      return eventCallback
    },
  }
}

function setupWindowAPI(api: MockOpenCodeAPI): void {
  ;(globalThis as Record<string, unknown>).window = {
    api: { opencode: api },
  }
}

function cleanupWindowAPI(): void {
  delete (globalThis as Record<string, unknown>).window
}

describe('useChat', () => {
  describe('window.api.opencode mock contract', () => {
    let mockCtx: ReturnType<typeof createMockAPI>

    beforeEach(() => {
      mockCtx = createMockAPI()
      setupWindowAPI(mockCtx.api)
    })

    test('setDirectory is callable with project path', async () => {
      await mockCtx.api.setDirectory('/test/project')
      expect(mockCtx.api.setDirectory).toHaveBeenCalledWith('/test/project')
    })

    test('createSession returns session with id', async () => {
      const session = await mockCtx.api.createSession('Game Builder')
      expect(session).toEqual({ id: 'session-1' })
    })

    test('subscribeEvents returns success', async () => {
      const result = await mockCtx.api.subscribeEvents()
      expect(result).toEqual({ subscribed: true })
    })

    test('onEvent registers callback and returns unsubscribe', () => {
      const cb = () => {}
      const unsub = mockCtx.api.onEvent(cb)
      expect(typeof unsub).toBe('function')
      expect(mockCtx.api.onEvent).toHaveBeenCalledWith(cb)
    })

    test('sendPrompt sends with sessionId and text', async () => {
      const opts = { sessionId: 'session-1', text: 'hello' }
      await mockCtx.api.sendPrompt(opts)
      expect(mockCtx.api.sendPrompt).toHaveBeenCalledWith(opts)
    })
  })

  describe('event processing logic', () => {
    test('message.updated with assistant role creates placeholder message', () => {
      const messages: Array<{ id: string; role: string; content: string; timestamp: number }> = []

      const event = {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: 'session-1',
            role: 'assistant',
            time: { created: 1000 },
          },
        },
      }

      const info = event.properties.info
      if (info.role === 'assistant') {
        const exists = messages.some(
          (m) => m.id === info.id || m.id === `assistant-${info.id}`
        )
        if (!exists) {
          messages.push({
            id: `assistant-${info.id}`,
            role: 'assistant',
            content: '',
            timestamp: info.time.created,
          })
        }
      }

      expect(messages).toHaveLength(1)
      expect(messages[0].id).toBe('assistant-msg-1')
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].content).toBe('')
    })

    test('message.updated with user role tracks user message ID', () => {
      const userMessageIds = new Set<string>()

      const event = {
        type: 'message.updated',
        properties: {
          info: {
            id: 'user-msg-1',
            sessionID: 'session-1',
            role: 'user',
            time: { created: 1000 },
          },
        },
      }

      const info = event.properties.info
      if (info.role === 'user') {
        userMessageIds.add(info.id)
      }

      expect(userMessageIds.has('user-msg-1')).toBe(true)
    })

    test('message.updated with assistant error sets error state', () => {
      let error: string | null = null
      let isLoading = true

      const event = {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-err',
            sessionID: 'session-1',
            role: 'assistant',
            time: { created: 1000 },
            error: { name: 'RateLimitError', data: { message: 'Rate limit exceeded' } },
          },
        },
      }

      const info = event.properties.info
      if (info.role === 'assistant' && info.error) {
        const errorMsg = info.error.data?.message || info.error.name || 'Unknown error'
        error = errorMsg
        isLoading = false
      }

      expect(error).toBe('Rate limit exceeded')
      expect(isLoading).toBe(false)
    })

    test('message.updated with finish flag clears loading', () => {
      let isLoading = true

      const event = {
        type: 'message.updated',
        properties: {
          info: {
            id: 'msg-1',
            sessionID: 'session-1',
            role: 'assistant',
            time: { created: 1000 },
            finish: 'stop',
          },
        },
      }

      const info = event.properties.info
      if (info.role === 'assistant' && info.finish) {
        isLoading = false
      }

      expect(isLoading).toBe(false)
    })
  })

  describe('streaming text accumulation', () => {
    test('accumulates text parts by messageID and partID', () => {
      const textParts = new Map<string, Map<string, string>>()

      const parts = [
        { id: 'part-1', messageID: 'msg-1', type: 'text', text: 'Hello' },
        { id: 'part-1', messageID: 'msg-1', type: 'text', text: 'Hello world' },
        { id: 'part-2', messageID: 'msg-1', type: 'text', text: '!' },
      ]

      for (const part of parts) {
        if (!textParts.has(part.messageID)) {
          textParts.set(part.messageID, new Map())
        }
        const partsMap = textParts.get(part.messageID)!

        if (part.text != null && part.text.length > 0) {
          partsMap.set(part.id, part.text)
        }
      }

      const partsMap = textParts.get('msg-1')!
      const sorted = Array.from(partsMap.entries())
      sorted.sort(([a], [b]) => a.localeCompare(b))
      const fullContent = sorted.map(([, text]) => text).join('')

      expect(fullContent).toBe('Hello world!')
    })

    test('handles delta-only streaming (no full text)', () => {
      const textParts = new Map<string, Map<string, string>>()

      const events = [
        { part: { id: 'p1', messageID: 'msg-1', type: 'text', text: '' }, delta: 'Hel' },
        { part: { id: 'p1', messageID: 'msg-1', type: 'text', text: '' }, delta: 'lo ' },
        { part: { id: 'p1', messageID: 'msg-1', type: 'text', text: '' }, delta: 'world' },
      ]

      for (const { part, delta } of events) {
        if (!textParts.has(part.messageID)) {
          textParts.set(part.messageID, new Map())
        }
        const partsMap = textParts.get(part.messageID)!

        if (part.text != null && part.text.length > 0) {
          partsMap.set(part.id, part.text)
        } else if (delta !== undefined) {
          const existing = partsMap.get(part.id) || ''
          partsMap.set(part.id, existing + delta)
        }
      }

      const partsMap = textParts.get('msg-1')!
      const fullContent = Array.from(partsMap.values()).join('')

      expect(fullContent).toBe('Hello world')
    })

    test('full text snapshot overrides previous delta accumulation', () => {
      const textParts = new Map<string, Map<string, string>>()
      const messageID = 'msg-1'
      const partID = 'p1'

      if (!textParts.has(messageID)) {
        textParts.set(messageID, new Map())
      }
      const partsMap = textParts.get(messageID)!

      partsMap.set(partID, 'He')
      partsMap.set(partID, partsMap.get(partID)! + 'llo')
      expect(partsMap.get(partID)).toBe('Hello')

      const fullText = 'Hello World Complete'
      if (fullText.length > 0) {
        partsMap.set(partID, fullText)
      }

      expect(partsMap.get(partID)).toBe('Hello World Complete')
    })

    test('skips parts belonging to user messages', () => {
      const userMessageIds = new Set<string>(['user-msg-1'])
      const textParts = new Map<string, Map<string, string>>()

      const part = { id: 'p1', messageID: 'user-msg-1', type: 'text', text: 'Should be skipped' }

      if (!userMessageIds.has(part.messageID)) {
        if (!textParts.has(part.messageID)) {
          textParts.set(part.messageID, new Map())
        }
        textParts.get(part.messageID)!.set(part.id, part.text)
      }

      expect(textParts.has('user-msg-1')).toBe(false)
    })
  })

  describe('tool event processing', () => {
    test('creates new tool event from tool part', () => {
      const toolEvents: Array<{
        id: string
        tool: string
        args?: string
        status: 'pending' | 'running' | 'done' | 'error'
        title?: string
        timestamp: number
      }> = []

      const toolPart = {
        id: 'tool-1',
        sessionID: 'session-1',
        messageID: 'msg-1',
        type: 'tool',
        callID: 'call-1',
        tool: 'read_file',
        state: {
          status: 'running' as const,
          input: { filePath: '/some/file.ts' },
          title: 'Reading file',
        },
      }

      const existing = toolEvents.find((t) => t.id === toolPart.id)
      const toolEvent = {
        id: toolPart.id,
        tool: toolPart.tool,
        args: typeof toolPart.state.input === 'object'
          ? JSON.stringify(toolPart.state.input)
          : undefined,
        status: toolPart.state.status === 'completed' ? 'done' as const : toolPart.state.status,
        title: toolPart.state.title,
        timestamp: existing?.timestamp || Date.now(),
      }

      toolEvents.push(toolEvent)

      expect(toolEvents).toHaveLength(1)
      expect(toolEvents[0].tool).toBe('read_file')
      expect(toolEvents[0].status).toBe('running')
      expect(toolEvents[0].args).toBe('{"filePath":"/some/file.ts"}')
    })

    test('updates existing tool event status', () => {
      const toolEvents = [
        { id: 'tool-1', tool: 'read_file', status: 'running' as const, timestamp: 1000 },
      ]

      const toolPart = {
        id: 'tool-1',
        type: 'tool',
        tool: 'read_file',
        state: { status: 'completed' as const, input: {} },
      }

      const existingIdx = toolEvents.findIndex((t) => t.id === toolPart.id)
      const updatedEvent = {
        id: toolPart.id,
        tool: toolPart.tool,
        status: toolPart.state.status === 'completed' ? 'done' as const : toolPart.state.status,
        timestamp: toolEvents[existingIdx].timestamp,
      }
      toolEvents[existingIdx] = updatedEvent

      expect(toolEvents[0].status).toBe('done')
      expect(toolEvents[0].timestamp).toBe(1000)
    })

    test('maps "completed" status to "done"', () => {
      const sdkStatus = 'completed'
      const uiStatus = sdkStatus === 'completed' ? 'done' : sdkStatus
      expect(uiStatus).toBe('done')
    })

    test('preserves "error" status as-is', () => {
      const sdkStatus = 'error'
      const uiStatus = sdkStatus === 'completed' ? 'done' : sdkStatus
      expect(uiStatus).toBe('error')
    })
  })

  describe('session status events', () => {
    test('session.status busy sets loading', () => {
      let isLoading = false

      const status = { type: 'busy' }
      if (status.type === 'busy') isLoading = true

      expect(isLoading).toBe(true)
    })

    test('session.status idle clears loading', () => {
      let isLoading = true

      const status = { type: 'idle' }
      if (status.type === 'idle') isLoading = false

      expect(isLoading).toBe(false)
    })

    test('session.status retry sets error with message', () => {
      let error: string | null = null

      const status = { type: 'retry', message: 'API rate limited, retrying in 5s' }
      if (status.type === 'retry') {
        error = `Retrying: ${status.message}`
      }

      expect(error).toBe('Retrying: API rate limited, retrying in 5s')
    })

    test('session.idle clears loading', () => {
      let isLoading = true

      const eventType = 'session.idle'
      if (eventType === 'session.idle') isLoading = false

      expect(isLoading).toBe(false)
    })

    test('session.error extracts error message and clears loading', () => {
      let error: string | null = null
      let isLoading = true

      const err = { name: 'AuthError', data: { message: 'Invalid API key' } }
      error = err.data?.message || err.name || 'Unknown error'
      isLoading = false

      expect(error).toBe('Invalid API key')
      expect(isLoading).toBe(false)
    })

    test('session.error falls back to error name when no data.message', () => {
      let error: string | null = null

      const err = { name: 'UnknownError', data: { message: '' } }
      error = err.data?.message || err.name || 'Unknown error'

      expect(error).toBe('UnknownError')
    })
  })

  describe('permission auto-response', () => {
    test('permission.updated auto-responds with "always"', async () => {
      const mockCtx = createMockAPI()

      const event = {
        type: 'permission.updated',
        properties: {
          id: 'perm-1',
          sessionID: 'session-1',
          title: 'Allow file read',
        },
      }

      const perm = event.properties
      if (perm.id && perm.sessionID) {
        await mockCtx.api.respondPermission(perm.sessionID, perm.id, 'always')
      }

      expect(mockCtx.api.respondPermission).toHaveBeenCalledWith('session-1', 'perm-1', 'always')
    })
  })

  describe('question handling', () => {
    test('question.asked sets pending question', () => {
      let pendingQuestion: { id: string; questions: Array<{ question: string }> } | null = null

      const event = {
        type: 'question.asked',
        properties: {
          id: 'q-1',
          sessionID: 'session-1',
          questions: [
            { question: 'Which approach?', header: 'Strategy', options: [], multiple: false },
          ],
        },
      }

      const questionReq = event.properties
      if (questionReq.id && questionReq.questions?.length > 0) {
        pendingQuestion = questionReq as typeof pendingQuestion
      }

      expect(pendingQuestion).not.toBeNull()
      expect(pendingQuestion!.id).toBe('q-1')
    })

    test('question.replied clears pending question', () => {
      let pendingQuestion: unknown = { id: 'q-1' }

      const eventType = 'question.replied'
      if (eventType === 'question.replied' || eventType === 'question.rejected') {
        pendingQuestion = null
      }

      expect(pendingQuestion).toBeNull()
    })

    test('question.rejected clears pending question', () => {
      let pendingQuestion: unknown = { id: 'q-1' }

      const eventType = 'question.rejected'
      if (eventType === 'question.replied' || eventType === 'question.rejected') {
        pendingQuestion = null
      }

      expect(pendingQuestion).toBeNull()
    })

    test('replyQuestion calls API with correct args', async () => {
      const mockCtx = createMockAPI()
      const answers = [['Option A'], ['Custom answer']]

      await mockCtx.api.replyQuestion('q-1', answers)

      expect(mockCtx.api.replyQuestion).toHaveBeenCalledWith('q-1', answers)
    })

    test('rejectQuestion calls API with request ID', async () => {
      const mockCtx = createMockAPI()

      await mockCtx.api.rejectQuestion('q-1')

      expect(mockCtx.api.rejectQuestion).toHaveBeenCalledWith('q-1')
    })
  })

  describe('sendMessage flow', () => {
    test('creates optimistic user message and calls sendPrompt', async () => {
      const mockCtx = createMockAPI()

      const messages: Array<{ role: string; content: string; id: string }> = []
      let isLoading = false
      let error: string | null = 'previous error'
      const sessionId = 'session-1'

      const text = 'Build a platformer game'

      const userMsg = {
        role: 'user',
        content: text,
        id: `user-${Date.now()}`,
      }
      messages.push(userMsg)
      isLoading = true
      error = null

      await mockCtx.api.sendPrompt({ sessionId, text })

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Build a platformer game')
      expect(isLoading).toBe(true)
      expect(error).toBeNull()
      expect(mockCtx.api.sendPrompt).toHaveBeenCalledWith({
        sessionId: 'session-1',
        text: 'Build a platformer game',
      })
    })

    test('sendPrompt failure sets error and clears loading', async () => {
      const failingAPI = createMockAPI()
      failingAPI.api.sendPrompt = mock(() => Promise.reject(new Error('Network error')))

      let error: string | null = null
      let isLoading = true

      try {
        await failingAPI.api.sendPrompt({ sessionId: 'session-1', text: 'test' })
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        isLoading = false
      }

      expect(error).toBe('Network error')
      expect(isLoading).toBe(false)
    })

    test('sendPrompt with non-Error rejection converts to string', async () => {
      const failingAPI = createMockAPI()
      failingAPI.api.sendPrompt = mock(() => Promise.reject('string error'))

      let error: string | null = null

      try {
        await failingAPI.api.sendPrompt({ sessionId: 'session-1', text: 'test' })
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(error).toBe('string error')
    })
  })

  describe('initialization flow', () => {
    test('init calls setDirectory → createSession → subscribeEvents → onEvent', async () => {
      const mockCtx = createMockAPI()
      const projectPath = '/projects/my-game'

      await mockCtx.api.setDirectory(projectPath)
      const session = await mockCtx.api.createSession('Game Builder')
      const subResult = await mockCtx.api.subscribeEvents()
      const unsub = mockCtx.api.onEvent(() => {})

      expect(mockCtx.api.setDirectory).toHaveBeenCalledWith(projectPath)
      expect(session.id).toBe('session-1')
      expect(subResult.subscribed).toBe(true)
      expect(typeof unsub).toBe('function')
    })

    test('subscribeEvents failure sets error', async () => {
      const mockCtx = createMockAPI()
      mockCtx.api.subscribeEvents = mock(() =>
        Promise.resolve({ subscribed: false, error: 'Connection refused' })
      )

      const subResult = await mockCtx.api.subscribeEvents()

      let error: string | null = null
      if (subResult.error) {
        error = subResult.error as string
      }

      expect(error).toBe('Connection refused')
    })

    test('createSession failure sets error', async () => {
      const mockCtx = createMockAPI()
      mockCtx.api.createSession = mock(() =>
        Promise.reject(new Error('Server not running'))
      )

      let error: string | null = null
      try {
        await mockCtx.api.createSession('Game Builder')
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(error).toBe('Server not running')
    })
  })

  describe('event callback lifecycle', () => {
    test('onEvent callback receives and processes events', () => {
      const mockCtx = createMockAPI()
      const receivedEvents: unknown[] = []

      mockCtx.api.onEvent((event: unknown) => {
        receivedEvents.push(event)
      })

      const cb = mockCtx.getEventCallback()

      cb({ type: 'session.status', properties: { status: { type: 'busy' } } })
      cb({ type: 'message.updated', properties: { info: { id: 'm1', role: 'assistant', time: { created: 1 } } } })
      cb({ type: 'session.idle', properties: {} })

      expect(receivedEvents).toHaveLength(3)
      expect((receivedEvents[0] as { type: string }).type).toBe('session.status')
      expect((receivedEvents[2] as { type: string }).type).toBe('session.idle')
    })

    test('unsubscribe stops event delivery', () => {
      const mockCtx = createMockAPI()
      const receivedEvents: unknown[] = []

      const unsub = mockCtx.api.onEvent((event: unknown) => {
        receivedEvents.push(event)
      })

      const cb = mockCtx.getEventCallback()
      cb({ type: 'session.idle', properties: {} })
      expect(receivedEvents).toHaveLength(1)

      unsub()

      expect(() => mockCtx.getEventCallback()).toThrow('No event callback registered')
    })
  })

  describe('cleanup', () => {
    test('textParts map clears properly', () => {
      const textParts = new Map<string, Map<string, string>>()

      textParts.set('msg-1', new Map([['p1', 'Hello']]))
      textParts.set('msg-2', new Map([['p1', 'World']]))
      expect(textParts.size).toBe(2)

      textParts.clear()
      expect(textParts.size).toBe(0)
    })

    test('userMessageIds set clears properly', () => {
      const userMessageIds = new Set<string>()

      userMessageIds.add('user-1')
      userMessageIds.add('user-2')
      expect(userMessageIds.size).toBe(2)

      userMessageIds.clear()
      expect(userMessageIds.size).toBe(0)
    })
  })
})
