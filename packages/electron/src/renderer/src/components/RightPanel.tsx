import React, { useEffect, useRef, useCallback } from 'react'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { UserMenu } from './UserMenu'
import { TypingIndicator } from './TypingIndicator'
import { ToolIndicator } from './ToolIndicator'
import { ProgressPanel } from './ProgressPanel'
import { WelcomeScreen } from './WelcomeScreen'
import { QuestionPanel } from './QuestionPanel'

interface RightPanelProps {
  projectPath: string
}

export const RightPanel: React.FC<RightPanelProps> = ({ projectPath }) => {
  const { messages, toolEvents, isLoading, sendMessage, error, pendingQuestion, replyQuestion, rejectQuestionRequest } = useChat(projectPath)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isNearBottom = useCallback((): boolean => {
    const el = chatMessagesRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const scrollToBottom = useCallback(() => {
    if (isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isNearBottom])

  useEffect(() => {
    scrollToBottom()
  }, [messages, toolEvents, isLoading, scrollToBottom])

  return (
    <div className="right-panel">
      <div className="tab-bar">
        <span className="chat-header__title">Game Builder</span>
        <span className={`chat-header__status ${isLoading ? 'chat-header__status--loading' : error ? 'chat-header__status--error' : 'chat-header__status--idle'}`} />
        <UserMenu />
      </div>
      
      <div className="chat-messages" ref={chatMessagesRef}>
        {messages.length === 0 && !isLoading && (
          <WelcomeScreen onSuggestionClick={sendMessage} />
        )}
        
        {messages.map((msg, index) => {
          const prevMsg = index > 0 ? messages[index - 1] : null
          const nextMsg = index < messages.length - 1 ? messages[index + 1] : null
          const isFirstInGroup = !prevMsg || prevMsg.role !== msg.role
          const isLastInGroup = !nextMsg || nextMsg.role !== msg.role
          const showAvatar = isFirstInGroup

          // Find tool events associated with this assistant message
          const msgToolEvents = msg.role === 'assistant' && msg.id
            ? toolEvents.filter((te) => {
                const rawId = msg.id!.startsWith('assistant-')
                  ? msg.id!.slice('assistant-'.length)
                  : msg.id!
                return te.messageID === rawId
              })
            : []

          return (
            <React.Fragment key={msg.id || index}>
              {msgToolEvents.length > 0 && (
                <div className="tool-events">
                  {msgToolEvents.map((event) => (
                    <ToolIndicator
                      key={event.id}
                      tool={event.tool}
                      args={event.args}
                      status={event.status}
                      projectPath={projectPath}
                    />
                  ))}
                </div>
              )}
              <ChatMessage
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                showAvatar={showAvatar}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                isStreaming={isLoading && msg.role === 'assistant' && index === messages.length - 1}
              />
            </React.Fragment>
          )
        })}

        {/* Show unmatched tool events (no messageID yet or orphaned) */}
        {(() => {
          const matchedIds = new Set<string>()
          messages.forEach((msg) => {
            if (msg.role === 'assistant' && msg.id) {
              const rawId = msg.id.startsWith('assistant-')
                ? msg.id.slice('assistant-'.length)
                : msg.id
              toolEvents.forEach((te) => {
                if (te.messageID === rawId) matchedIds.add(te.id)
              })
            }
          })
          const unmatched = toolEvents.filter((te) => !matchedIds.has(te.id))
          return unmatched.length > 0 ? (
            <div className="tool-events">
              {unmatched.map((event) => (
                <ToolIndicator
                  key={event.id}
                  tool={event.tool}
                  args={event.args}
                  status={event.status}
                  projectPath={projectPath}
                />
              ))}
            </div>
          ) : null
        })()}

        <ProgressPanel />

        {pendingQuestion && (
          <QuestionPanel
            question={pendingQuestion}
            onReply={replyQuestion}
            onReject={rejectQuestionRequest}
          />
        )}

        {isLoading && !pendingQuestion && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
