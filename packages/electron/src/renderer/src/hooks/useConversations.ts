import { useState, useCallback, useEffect } from 'react'

export interface Conversation {
  id: string
  title: string
}

export function useConversations(projectPath: string) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const sessions = await window.api.opencode.listSessions()
      setConversations(sessions.map((s: { id: string; title: string }) => ({ id: s.id, title: s.title })))
    } catch (err) {
      console.error('[useConversations] Failed to list sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const createConversation = useCallback(async (title?: string) => {
    try {
      const session = await window.api.opencode.createSession(title || 'New Chat')
      const conv: Conversation = { id: session.id, title: title || 'New Chat' }
      setConversations((prev) => [conv, ...prev])
      setActiveConversationId(session.id)
      return conv
    } catch (err) {
      console.error('[useConversations] Failed to create session:', err)
      return null
    }
  }, [])

  const deleteConversation = useCallback(async (sessionId: string) => {
    try {
      await window.api.opencode.deleteSession(sessionId)
      setConversations((prev) => prev.filter((c) => c.id !== sessionId))
      if (activeConversationId === sessionId) {
        setActiveConversationId(null)
      }
      return true
    } catch (err) {
      console.error('[useConversations] Failed to delete session:', err)
      return false
    }
  }, [activeConversationId])

  const switchConversation = useCallback((sessionId: string) => {
    setActiveConversationId(sessionId)
  }, [])

  return {
    conversations,
    activeConversationId,
    loading,
    loadConversations,
    createConversation,
    deleteConversation,
    switchConversation,
  }
}
