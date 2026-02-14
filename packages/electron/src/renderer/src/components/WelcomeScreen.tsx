import React from 'react'

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void
}

const suggestions = [
  'Make a platformer game',
  'Create a puzzle game',
  'Design a space shooter',
  'Build an RPG'
]

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSuggestionClick }) => {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__icon">🎮</div>
      <h1 className="welcome-screen__title">Game Builder</h1>
      <p className="welcome-screen__subtitle">
        What would you like to build today?
      </p>
      <div className="welcome-screen__suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="welcome-screen__chip"
            onClick={() => onSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
