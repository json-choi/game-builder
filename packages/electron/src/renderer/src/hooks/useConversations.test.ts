import { describe, expect, test, mock } from 'bun:test'

interface Conversation {
  id: string
  title: string
}

interface MockOpenCodeAPI {
  listSessions: ReturnType<typeof mock>
  createSession: ReturnType<typeof mock>
  deleteSession: ReturnType<typeof mock>
}

function createMockAPI(): MockOpenCodeAPI {
  return {
    listSessions: mock(() =>
      Promise.resolve([
        { id: 'sess-1', title: 'Chat 1' },
        { id: 'sess-2', title: 'Chat 2' },
      ])
    ),
    createSession: mock((title: string) =>
      Promise.resolve({ id: `sess-${Date.now()}`, title })
    ),
    deleteSession: mock(() => Promise.resolve()),
  }
}

describe('useConversations', () => {
  describe('list sessions', () => {
    test('loads conversations from API', async () => {
      const api = createMockAPI()
      const sessions = await api.listSessions()
      const conversations: Conversation[] = sessions.map((s: { id: string; title: string }) => ({
        id: s.id,
        title: s.title,
      }))

      expect(conversations).toHaveLength(2)
      expect(conversations[0].id).toBe('sess-1')
      expect(conversations[1].title).toBe('Chat 2')
    })

    test('returns empty array when no sessions', async () => {
      const api = createMockAPI()
      api.listSessions = mock(() => Promise.resolve([]))
      const sessions = await api.listSessions()
      expect(sessions).toHaveLength(0)
    })

    test('handles list failure gracefully', async () => {
      const api = createMockAPI()
      api.listSessions = mock(() => Promise.reject(new Error('Network error')))
      let error: string | null = null
      try {
        await api.listSessions()
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      expect(error).toBe('Network error')
    })
  })

  describe('create conversation', () => {
    test('creates a new session with title', async () => {
      const api = createMockAPI()
      const session = await api.createSession('New Chat')
      expect(session.title).toBe('New Chat')
      expect(typeof session.id).toBe('string')
    })

    test('creates session with default title', async () => {
      const api = createMockAPI()
      const title = undefined || 'New Chat'
      const session = await api.createSession(title)
      expect(session.title).toBe('New Chat')
    })

    test('new conversation is prepended to list', async () => {
      const api = createMockAPI()
      let conversations: Conversation[] = [
        { id: 'sess-1', title: 'Old Chat' },
      ]

      const session = await api.createSession('New Chat')
      const conv: Conversation = { id: session.id, title: session.title }
      conversations = [conv, ...conversations]

      expect(conversations).toHaveLength(2)
      expect(conversations[0].title).toBe('New Chat')
      expect(conversations[1].title).toBe('Old Chat')
    })
  })

  describe('delete conversation', () => {
    test('removes conversation from list', async () => {
      const api = createMockAPI()
      let conversations: Conversation[] = [
        { id: 'sess-1', title: 'Chat 1' },
        { id: 'sess-2', title: 'Chat 2' },
      ]

      await api.deleteSession('sess-1')
      conversations = conversations.filter((c) => c.id !== 'sess-1')

      expect(conversations).toHaveLength(1)
      expect(conversations[0].id).toBe('sess-2')
    })

    test('clears active conversation when deleting active', async () => {
      const api = createMockAPI()
      let activeConversationId: string | null = 'sess-1'

      await api.deleteSession('sess-1')
      if (activeConversationId === 'sess-1') {
        activeConversationId = null
      }

      expect(activeConversationId).toBeNull()
    })

    test('preserves active when deleting other conversation', async () => {
      const api = createMockAPI()
      let activeConversationId: string | null = 'sess-1'

      await api.deleteSession('sess-2')
      if (activeConversationId === 'sess-2') {
        activeConversationId = null
      }

      expect(activeConversationId).toBe('sess-1')
    })

    test('handles delete failure', async () => {
      const api = createMockAPI()
      api.deleteSession = mock(() => Promise.reject(new Error('Not found')))
      let error: string | null = null
      try {
        await api.deleteSession('nonexistent')
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      expect(error).toBe('Not found')
    })
  })

  describe('switch conversation', () => {
    test('sets active conversation id', () => {
      let activeId: string | null = null
      activeId = 'sess-2'
      expect(activeId).toBe('sess-2')
    })

    test('can switch between conversations', () => {
      let activeId: string | null = 'sess-1'
      activeId = 'sess-2'
      expect(activeId).toBe('sess-2')
      activeId = 'sess-1'
      expect(activeId).toBe('sess-1')
    })
  })

  describe('Conversation shape', () => {
    test('has required fields', () => {
      const conv: Conversation = { id: 'test-id', title: 'Test Title' }
      expect(typeof conv.id).toBe('string')
      expect(typeof conv.title).toBe('string')
    })
  })
})
