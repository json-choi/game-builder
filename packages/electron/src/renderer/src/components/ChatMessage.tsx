import React, { useMemo } from 'react'
import { Streamdown, type Components } from 'streamdown'
import { code } from '@streamdown/code'
import { CodeBlock } from './CodeBlock'

interface ChatAttachment {
  media_type: string
  data: string
  name?: string
}

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  showAvatar?: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  isStreaming?: boolean
  attachments?: ChatAttachment[]
}

const GDSCRIPT_LANGUAGES = new Set(['gdscript', 'godot', 'gd'])

function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractTextContent).join('')
  if (React.isValidElement(children)) {
    return extractTextContent((children.props as { children?: React.ReactNode }).children)
  }
  return ''
}

const streamdownComponents: Components = {
  pre: ({ children, node, ...rest }) => {
    const codeChild = React.Children.toArray(children).find(
      (child): child is React.ReactElement =>
        React.isValidElement(child) && typeof (child.props as Record<string, unknown>).className === 'string'
    ) as React.ReactElement | undefined

    if (codeChild) {
      const className = (codeChild.props as { className?: string }).className || ''
      const langMatch = className.match(/language-(\w+)/)
      const lang = langMatch?.[1] || 'text'

      if (GDSCRIPT_LANGUAGES.has(lang)) {
        const codeText = extractTextContent((codeChild.props as { children?: React.ReactNode }).children)
        return <CodeBlock code={codeText} language={lang} />
      }
    }

    const { ref, ...props } = rest as Record<string, unknown>
    return <pre {...props}>{children}</pre>
  },
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  isStreaming = false,
  attachments,
}) => {
  const isUser = role === 'user'
  const plugins = useMemo(() => ({ code }), [])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}>
      <div className="chat-message__content-wrapper">
        <button className="chat-message__copy-btn" onClick={handleCopy} type="button">Copy</button>
        {attachments && attachments.length > 0 && (
          <div className="chat-message__attachments">
            {attachments.map((att, i) => (
              <img
                key={`${att.name || 'img'}-${i}`}
                src={`data:${att.media_type};base64,${att.data}`}
                alt={att.name || 'Attached image'}
                className="chat-message__attachment-image"
              />
            ))}
          </div>
        )}
        {isUser ? (
          <div className="chat-message-content">{content}</div>
        ) : (
          <div className="chat-message-content">
            <Streamdown
              plugins={plugins}
              components={streamdownComponents}
              isAnimating={isStreaming}
            >
              {content}
            </Streamdown>
          </div>
        )}
      </div>
    </div>
  )
}
