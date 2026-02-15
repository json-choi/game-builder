import React from 'react'
import { PreviewPanel } from './PreviewPanel'
import { SettingsPanel } from './SettingsPanel'
import { FileExplorer } from './FileExplorer'
import { ConsolePanel } from './ConsolePanel'
import { AssetLibrary } from './AssetLibrary'
import { usePreview } from '../hooks/usePreview'

export type LeftPanelTab = 'preview' | 'files' | 'assets' | 'console' | 'settings'

export const TABS: { id: LeftPanelTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'files', label: 'Files' },
  { id: 'assets', label: 'Assets' },
  { id: 'console', label: 'Console' },
  { id: 'settings', label: 'Settings' },
]

interface LeftPanelProps {
  projectPath: string
  activeTab: LeftPanelTab
  onTabChange: (tab: LeftPanelTab) => void
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ projectPath, activeTab, onTabChange }) => {
  const { output, clearOutput } = usePreview()

  return (
    <div className="left-panel">
      <div className="tab-bar">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={`tab-bar-item ${activeTab === tab.id ? 'tab-bar-item--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="left-panel__content">
        {activeTab === 'preview' && <PreviewPanel projectPath={projectPath} />}
        {activeTab === 'files' && <FileExplorer projectPath={projectPath} />}
        {activeTab === 'assets' && <AssetLibrary projectPath={projectPath} />}
        {activeTab === 'console' && <ConsolePanel output={output} onClear={clearOutput} />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
