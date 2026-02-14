import React from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'

interface SplitPanelProps {
  projectPath: string
}

export const SplitPanel: React.FC<SplitPanelProps> = ({ projectPath }) => {
  return (
    <div className="split-panel">
      <Allotment>
        <Allotment.Pane minSize={200} preferredSize={400}>
          <LeftPanel projectPath={projectPath} />
        </Allotment.Pane>
        <Allotment.Pane minSize={200}>
          <RightPanel projectPath={projectPath} />
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
