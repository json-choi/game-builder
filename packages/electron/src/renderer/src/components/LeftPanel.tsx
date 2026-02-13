import React from 'react'

export const LeftPanel: React.FC = () => {
  return (
    <div className="left-panel">
      <div className="tab-bar">
        <span>Preview</span>
      </div>
      <div style={{ flex: 1, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Preview Area (Empty)
      </div>
    </div>
  )
}
