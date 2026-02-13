import React from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'

export const SplitPanel: React.FC = () => {
  return (
    <div className="split-panel">
      <Allotment>
        <Allotment.Pane minSize={200} preferredSize={400}>
          <LeftPanel />
        </Allotment.Pane>
        <Allotment.Pane minSize={200}>
          <RightPanel />
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
