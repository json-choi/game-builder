import React, { useState } from 'react'
import { PreviewPanel } from './PreviewPanel'
import { SettingsPanel } from './SettingsPanel'
import { FileExplorer } from './FileExplorer'

type LeftPanelTab = 'preview' | 'files' | 'assets' | 'console' | 'settings'

const TABS: { id: LeftPanelTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'files', label: 'Files' },
  { id: 'assets', label: 'Assets' },
  { id: 'console', label: 'Console' },
  { id: 'settings', label: 'Settings' },
]

interface LeftPanelProps {
  projectPath: string
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ projectPath }) => {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('preview')

  return (
    <div className="left-panel">
      <div className="tab-bar">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={`tab-bar-item ${activeTab === tab.id ? 'tab-bar-item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="left-panel__content">
        {activeTab === 'preview' && <PreviewPanel projectPath={projectPath} />}
        {activeTab === 'files' && <FileExplorer projectPath={projectPath} />}
        {activeTab === 'assets' && <AssetsPlaceholder />}
        {activeTab === 'console' && <ConsolePlaceholder />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}

const AssetsPlaceholder: React.FC = () => (
  <div className="panel-placeholder">
    <div className="panel-placeholder__icon">{'\u{1F3A8}'}</div>
    <div className="panel-placeholder__text">Asset Library</div>
    <div className="panel-placeholder__subtext">Generated assets will appear here</div>
  </div>
)

const ConsolePlaceholder: React.FC = () => (
  <div className="panel-placeholder">
    <div className="panel-placeholder__icon">{'\u{1F4BB}'}</div>
    <div className="panel-placeholder__text">Console Output</div>
    <div className="panel-placeholder__subtext">Godot logs and output will appear here</div>
  </div>
)
