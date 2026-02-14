import React, { useState } from 'react'
import { useProjects, ProjectInfo } from '../hooks/useProjects'
import { shortenHomePath } from '../utils/pathUtils'

const TEMPLATES = [
  { id: 'basic-2d', name: 'Basic 2D' },
]

interface ProjectManagerProps {
  onProjectSelected: (project: ProjectInfo) => void
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectSelected }) => {
  const { projects, loading, error, createProject, deleteProject } = useProjects()
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTemplate, setNewTemplate] = useState('basic-2d')
  const [creating, setCreating] = useState(false)
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const project = await createProject(newName.trim(), newTemplate)
    setCreating(false)
    if (project) {
      setShowNewForm(false)
      setNewName('')
      setNewTemplate('basic-2d')
      onProjectSelected(project)
    }
  }

  const handleDelete = async (path: string) => {
    await deleteProject(path)
    setConfirmDeletePath(null)
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="pm-container">
      <div className="pm-content">
        <div className="pm-header">
          <h1 className="pm-title">Game Builder</h1>
          <button
            className="pm-new-btn"
            onClick={() => setShowNewForm(!showNewForm)}
          >
            {showNewForm ? 'Cancel' : 'New Project'}
          </button>
        </div>

        {error && (
          <div className="pm-error">{error}</div>
        )}

        {showNewForm && (
          <div className="pm-new-form">
            <input
              className="pm-input"
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              autoFocus
            />
            <select
              className="pm-select"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              className="pm-create-btn"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {loading && projects.length === 0 && (
          <div className="pm-loading">Loading projects...</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="pm-empty">
            No projects yet. Create your first game!
          </div>
        )}

        <div className="pm-list">
          {projects.map((project) => (
            <div
              key={project.path}
              className="pm-card"
              onClick={() => onProjectSelected(project)}
            >
              <div className="pm-card-info">
                <div className="pm-card-name">{project.name}</div>
                <div className="pm-card-meta">
                  <span className="pm-card-path">{shortenHomePath(project.path)}</span>
                  <span className="pm-card-date">Modified {formatDate(project.modifiedAt)}</span>
                </div>
              </div>
              <button
                className="pm-delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDeletePath(project.path)
                }}
              >
                Delete
              </button>
              {confirmDeletePath === project.path && (
                <div className="pm-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                  <span className="pm-confirm-text">Delete this project?</span>
                  <button
                    className="pm-confirm-yes"
                    onClick={() => handleDelete(project.path)}
                  >
                    Yes, delete
                  </button>
                  <button
                    className="pm-confirm-no"
                    onClick={() => setConfirmDeletePath(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
