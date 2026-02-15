import React, { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { LeftPanel, type LeftPanelTab } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { useKeyboardShortcuts, type ShortcutAction } from '../hooks/useKeyboardShortcuts'

interface SplitPanelProps {
  projectPath: string
  projectName: string
  onBackToProjects: () => void
}

const TAB_MAP: Record<string, LeftPanelTab> = {
  'tab-1': 'preview',
  'tab-2': 'files',
  'tab-3': 'assets',
  'tab-4': 'console',
  'tab-5': 'settings',
}

export const SplitPanel: React.FC<SplitPanelProps> = ({ projectPath, projectName, onBackToProjects }) => {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('preview')

  const handleShortcut = useCallback((action: ShortcutAction) => {
    if (action === 'new-project') {
      onBackToProjects()
      return
    }
    const tab = TAB_MAP[action]
    if (tab) {
      setActiveTab(tab)
    }
  }, [onBackToProjects])

  useKeyboardShortcuts(handleShortcut)

  return (
    <div className="split-panel">
      <Allotment>
        <Allotment.Pane minSize={200} preferredSize={400}>
          <LeftPanel projectPath={projectPath} activeTab={activeTab} onTabChange={setActiveTab} />
        </Allotment.Pane>
        <Allotment.Pane minSize={200}>
          <RightPanel projectPath={projectPath} projectName={projectName} onBackToProjects={onBackToProjects} />
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
