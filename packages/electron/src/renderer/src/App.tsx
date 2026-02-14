import { useState } from 'react'
import { SplitPanel } from './components/SplitPanel'
import { ProjectManager } from './components/ProjectManager'
import type { ProjectInfo } from './hooks/useProjects'

function App(): React.JSX.Element {
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null)

  if (!currentProjectPath) {
    return (
      <div className="app">
        <ProjectManager onProjectSelected={(project: ProjectInfo) => setCurrentProjectPath(project.path)} />
      </div>
    )
  }

  return (
    <div className="app">
      <SplitPanel projectPath={currentProjectPath} />
    </div>
  )
}

export { App }
