import React from 'react'

export const TypingIndicator: React.FC = () => {
  return (
    <div className="typing-indicator-container">
      <div className="typing-spinner"></div>
      <span className="typing-text">Thinking...</span>
    </div>
  )
}
