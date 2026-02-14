import { useState, useCallback, useEffect } from 'react'

export interface ProjectInfo {
  name: string
  path: string
  template: string
  createdAt: number
  modifiedAt: number
}

interface ProjectAPI {
  list: () => Promise<ProjectInfo[]>
  create: (name: string, template: string) => Promise<ProjectInfo>
  delete: (path: string) => Promise<boolean>
}

function getProjectApi(): ProjectAPI {
  return (window as unknown as { api: { project: ProjectAPI } }).api.project
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getProjectApi().list()
      setProjects(list)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const createProject = useCallback(async (name: string, template: string) => {
    setError(null)
    try {
      const project = await getProjectApi().create(name, template)
      setProjects((prev) => [project, ...prev])
      return project
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    }
  }, [])

  const deleteProject = useCallback(async (path: string) => {
    setError(null)
    try {
      const success = await getProjectApi().delete(path)
      if (success) {
        setProjects((prev) => prev.filter((p) => p.path !== path))
        if (currentProject?.path === path) {
          setCurrentProject(null)
        }
      }
      return success
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return false
    }
  }, [currentProject])

  const selectProject = useCallback((path: string) => {
    const project = projects.find((p) => p.path === path) ?? null
    setCurrentProject(project)
  }, [projects])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return { projects, currentProject, loading, error, loadProjects, createProject, deleteProject, selectProject }
}
