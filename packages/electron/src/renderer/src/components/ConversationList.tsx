import React, { useState } from 'react'
import type { Conversation } from '../hooks/useConversations'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <div className="conversation-list">
      <div className="conversation-list__header">
        <span className="conversation-list__title">Conversations</span>
        <div className="conversation-list__actions">
          <button
            className="conversation-list__new-btn"
            onClick={onCreate}
            aria-label="New conversation"
          >
            + New
          </button>
          <button
            className="conversation-list__close-btn"
            onClick={onClose}
            aria-label="Close conversation list"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="conversation-list__items">
        {conversations.length === 0 && (
          <div className="conversation-list__empty">No conversations yet</div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-list__item ${activeId === conv.id ? 'conversation-list__item--active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="conversation-list__item-title">{conv.title}</span>
            <button
              className="conversation-list__item-delete"
              onClick={(e) => {
                e.stopPropagation()
                if (confirmDeleteId === conv.id) {
                  onDelete(conv.id)
                  setConfirmDeleteId(null)
                } else {
                  setConfirmDeleteId(conv.id)
                }
              }}
              aria-label={confirmDeleteId === conv.id ? 'Confirm delete' : 'Delete conversation'}
            >
              {confirmDeleteId === conv.id ? 'Confirm' : '×'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
