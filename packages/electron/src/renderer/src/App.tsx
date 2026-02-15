import { useState, useCallback } from 'react'
import { SplitPanel } from './components/SplitPanel'
import { ProjectManager } from './components/ProjectManager'
import type { ProjectInfo } from './hooks/useProjects'

function App(): React.JSX.Element {
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null)

  const handleBackToProjects = useCallback(() => {
    setCurrentProject(null)
  }, [])

  if (!currentProject) {
    return (
      <div className="app">
        <ProjectManager onProjectSelected={(project: ProjectInfo) => setCurrentProject(project)} />
      </div>
    )
  }

  return (
    <div className="app">
      <SplitPanel
        projectPath={currentProject.path}
        projectName={currentProject.name}
        onBackToProjects={handleBackToProjects}
      />
    </div>
  )
}

export { App }
