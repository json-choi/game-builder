import { useState, useEffect, useCallback, useRef } from 'react'

export interface ChatAttachment {
  media_type: string
  data: string // base64-encoded
  name?: string
}

export interface ChatMessage {
  id?: string
  projectId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  metadata?: string
  attachments?: ChatAttachment[]
}

function projectIdFromPath(projectPath: string): string {
  const segments = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments[segments.length - 1] || projectPath
}

export interface ToolEvent {
  id: string
  tool: string
  args?: string
  status: 'pending' | 'running' | 'done' | 'error'
  title?: string
  timestamp: number
  messageID?: string
}

// SDK event types: message.updated (metadata), message.part.updated (streaming text/tools),
// session.status (busy/idle), session.idle, session.error

interface TextPart {
  id: string
  sessionID: string
  messageID: string
  type: 'text'
  text: string
  time?: { start: number; end?: number }
}

interface ToolState {
  status: 'pending' | 'running' | 'completed' | 'error'
  input: Record<string, unknown>
  title?: string
  output?: string
  error?: string
  metadata?: Record<string, unknown>
  time?: { start: number; end?: number }
}

interface ToolPart {
  id: string
  sessionID: string
  messageID: string
  type: 'tool'
  callID: string
  tool: string
  state: ToolState
}

type Part = TextPart | ToolPart | {
  id: string
  sessionID: string
  messageID: string
  type: string
  [key: string]: unknown
}

interface MessageInfo {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: { created: number; completed?: number }
  error?: { name: string; data: { message: string } }
  tokens?: { input: number; output: number; reasoning: number }
  cost?: number
  finish?: string
}

interface OpenCodeEvent {
  type: string
  properties: Record<string, unknown>
}

export function useChat(projectPath: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<QuestionRequest | null>(null)
  const mounted = useRef(true)

  const textPartsRef = useRef<Map<string, Map<string, string>>>(new Map())
  const userMessageIdsRef = useRef<Set<string>>(new Set())
  const persistedIdsRef = useRef<Set<string>>(new Set())
  const projectId = projectIdFromPath(projectPath)

  const updateAssistantMessage = useCallback((messageID: string) => {
    const partsMap = textPartsRef.current.get(messageID)
    if (!partsMap) return

    const parts = Array.from(partsMap.entries())
    parts.sort(([a], [b]) => a.localeCompare(b))
    const fullContent = parts.map(([, text]) => text).join('')

    if (!fullContent) return

    setMessages((prev) => {
      const idx = prev.findIndex(
        (m) => m.id === messageID || m.id === `assistant-${messageID}`
      )
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], content: fullContent }
        return updated
      }
      return [
        ...prev,
        {
          id: `assistant-${messageID}`,
          role: 'assistant' as const,
          content: fullContent,
          timestamp: Date.now(),
        },
      ]
    })
  }, [])

  useEffect(() => {
    mounted.current = true
    let unsubscribe: (() => void) | undefined

    const initSession = async () => {
      try {
        await window.api.opencode.setDirectory(projectPath)
        const session = await window.api.opencode.createSession('Game Builder')
        if (mounted.current) {
          setSessionId(session.id)
        }

        try {
          const history = await window.api.chat.getMessages(projectId)
          if (mounted.current && history.length > 0) {
            for (const msg of history) {
              if (msg.id) persistedIdsRef.current.add(msg.id)
            }
            setMessages(history)
          }
        } catch (e) {
          console.error('[useChat] Failed to load chat history:', e)
        }

        const subResult = await window.api.opencode.subscribeEvents()
        if (subResult.error) {
          console.error('[useChat] Failed to subscribe:', subResult.error)
          if (mounted.current) setError(subResult.error)
          return
        }

        unsubscribe = window.api.opencode.onEvent((event: unknown) => {
          if (!mounted.current) return

          const typedEvent = event as OpenCodeEvent
          if (!typedEvent.type) return

          switch (typedEvent.type) {
            case 'message.updated': {
              const info = typedEvent.properties.info as MessageInfo | undefined
              if (!info) break

              if (info.role === 'user') {
                userMessageIdsRef.current.add(info.id)
                break
              }

              if (info.role === 'assistant' && info.error) {
                const errorMsg = info.error.data?.message || info.error.name || 'Unknown error'
                setError(errorMsg)
                setIsLoading(false)
              }

              if (info.role === 'assistant' && info.finish) {
                setIsLoading(false)

                const msgKey = `assistant-${info.id}`
                if (!persistedIdsRef.current.has(msgKey)) {
                  const partsMap = textPartsRef.current.get(info.id)
                  if (partsMap) {
                    const sorted = Array.from(partsMap.entries())
                    sorted.sort(([a], [b]) => a.localeCompare(b))
                    const content = sorted.map(([, t]) => t).join('')
                    if (content) {
                      persistedIdsRef.current.add(msgKey)
                      window.api.chat
                        .saveMessage({
                          projectId,
                          role: 'assistant',
                          content,
                          timestamp: info.time.created,
                        })
                        .catch((e: unknown) =>
                          console.error('[useChat] Failed to persist assistant message:', e)
                        )
                    }
                  }
                }
              }

              if (info.role === 'assistant') {
                setMessages((prev) => {
                  const exists = prev.some(
                    (m) => m.id === info.id || m.id === `assistant-${info.id}`
                  )
                  if (!exists) {
                    return [
                      ...prev,
                      {
                        id: `assistant-${info.id}`,
                        role: 'assistant',
                        content: '',
                        timestamp: info.time.created,
                      },
                    ]
                  }
                  return prev
                })
              }
              break
            }

            case 'message.part.updated': {
              const part = typedEvent.properties.part as Part | undefined
              const delta = typedEvent.properties.delta as string | undefined
              if (!part) break
              if (userMessageIdsRef.current.has(part.messageID)) break

              if (part.type === 'text') {
                const textPart = part as TextPart
                if (!textPartsRef.current.has(textPart.messageID)) {
                  textPartsRef.current.set(textPart.messageID, new Map())
                }
                const partsMap = textPartsRef.current.get(textPart.messageID)!

                // Always prefer the full text snapshot when available.
                // Only append delta when full text is absent (pure incremental stream).
                if (textPart.text != null && textPart.text.length > 0) {
                  partsMap.set(textPart.id, textPart.text)
                } else if (delta !== undefined) {
                  const existing = partsMap.get(textPart.id) || ''
                  partsMap.set(textPart.id, existing + delta)
                }

                updateAssistantMessage(textPart.messageID)
              } else if (part.type === 'tool') {
                const toolPart = part as ToolPart
                setToolEvents((prev) => {
                  const existing = prev.find((t) => t.id === toolPart.id)
                  const toolEvent: ToolEvent = {
                    id: toolPart.id,
                    tool: toolPart.tool,
                    args:
                      typeof toolPart.state.input === 'object'
                        ? JSON.stringify(toolPart.state.input)
                        : undefined,
                    status:
                      toolPart.state.status === 'completed'
                        ? 'done'
                        : toolPart.state.status,
                    title: toolPart.state.title,
                    timestamp: existing?.timestamp || Date.now(),
                    messageID: toolPart.messageID,
                  }
                  if (existing) {
                    return prev.map((t) => (t.id === toolPart.id ? toolEvent : t))
                  }
                  return [...prev, toolEvent]
                })
              }
              break
            }

            case 'session.status': {
              const status = typedEvent.properties.status as
                | { type: 'busy' }
                | { type: 'idle' }
                | { type: 'retry'; message: string }
                | undefined
              if (!status) break

              if (status.type === 'busy') {
                setIsLoading(true)
              } else if (status.type === 'idle') {
                setIsLoading(false)
              } else if (status.type === 'retry') {
                setError(`Retrying: ${status.message}`)
              }
              break
            }

            case 'session.idle': {
              setIsLoading(false)
              break
            }

            case 'session.error': {
              const err = typedEvent.properties.error as
                | { name: string; data: { message: string } }
                | undefined
              if (err) {
                setError(err.data?.message || err.name || 'Unknown error')
              }
              setIsLoading(false)
              break
            }

            case 'permission.updated': {
              const perm = typedEvent.properties as {
                id?: string
                sessionID?: string
                title?: string
              }
              if (perm.id && perm.sessionID) {
                window.api.opencode
                  .respondPermission(perm.sessionID, perm.id, 'always')
                  .catch((e: unknown) =>
                    console.error('[useChat] Failed to respond to permission:', e)
                  )
              }
              break
            }

            case 'question.asked': {
              const questionReq = typedEvent.properties as unknown as QuestionRequest
              if (questionReq.id && questionReq.questions?.length > 0) {
                setPendingQuestion(questionReq)
              }
              break
            }

            case 'question.replied':
            case 'question.rejected': {
              setPendingQuestion(null)
              break
            }
          }
        })
      } catch (err) {
        console.error('[useChat] Error initializing chat:', err)
        if (mounted.current) setError(err instanceof Error ? err.message : String(err))
      }
    }

    initSession()

    return () => {
      mounted.current = false
      textPartsRef.current.clear()
      userMessageIdsRef.current.clear()
      persistedIdsRef.current.clear()
      if (unsubscribe) unsubscribe()
    }
  }, [projectPath, projectId, updateAssistantMessage])

  const sendMessage = useCallback(
    async (text: string, attachments?: ChatAttachment[], agent?: string) => {
      if (!sessionId) return

      const now = Date.now()
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: now,
        id: `user-${now}`,
        projectId,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      }

      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)
      textPartsRef.current.clear()

      window.api.chat
        .saveMessage({ projectId, role: 'user', content: text, timestamp: now })
        .then((savedId) => {
          persistedIdsRef.current.add(savedId)
        })
        .catch((e: unknown) => console.error('[useChat] Failed to persist user message:', e))

      try {
        const promptOptions: {
          sessionId: string
          text: string
          attachments?: Array<{ media_type: string; data: string }>
          agent?: string
        } = { sessionId, text }

        if (attachments && attachments.length > 0) {
          promptOptions.attachments = attachments.map((a) => ({
            media_type: a.media_type,
            data: a.data,
          }))
        }

        if (agent) {
          promptOptions.agent = agent
        }

        await window.api.opencode.sendPrompt(promptOptions)
      } catch (err) {
        console.error('[useChat] Failed to send message:', err)
        setError(err instanceof Error ? err.message : String(err))
        setIsLoading(false)
      }
    },
    [sessionId, projectId]
  )

  const replyQuestion = useCallback(
    async (answers: Array<Array<string>>) => {
      if (!pendingQuestion) return
      try {
        await window.api.opencode.replyQuestion(pendingQuestion.id, answers)
        setPendingQuestion(null)
      } catch (err) {
        console.error('[useChat] Failed to reply to question:', err)
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [pendingQuestion]
  )

  const rejectQuestionRequest = useCallback(async () => {
    if (!pendingQuestion) return
    try {
      await window.api.opencode.rejectQuestion(pendingQuestion.id)
      setPendingQuestion(null)
    } catch (err) {
      console.error('[useChat] Failed to reject question:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [pendingQuestion])

  return { messages, toolEvents, isLoading, sendMessage, error, sessionId, pendingQuestion, replyQuestion, rejectQuestionRequest }
}
