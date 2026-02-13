import React from 'react'

export const RightPanel: React.FC = () => {
  return (
    <div className="right-panel">
      <div className="tab-bar">
        <span>Chat</span>
      </div>
      <div style={{ flex: 1, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Chat Area (Empty)
      </div>
    </div>
  )
}
