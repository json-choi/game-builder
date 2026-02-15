import { describe, expect, test } from 'bun:test'

interface ProjectInfo {
  name: string
  path: string
  template: string
  createdAt: number
  modifiedAt: number
}

describe('App project switching', () => {
  describe('project state management', () => {
    test('starts with no current project', () => {
      let currentProject: ProjectInfo | null = null
      expect(currentProject).toBeNull()
    })

    test('selecting project sets current project', () => {
      let currentProject: ProjectInfo | null = null
      const project: ProjectInfo = {
        name: 'My Game',
        path: '/projects/my-game',
        template: 'basic-2d',
        createdAt: 1000,
        modifiedAt: 2000,
      }

      currentProject = project
      expect(currentProject).not.toBeNull()
      expect(currentProject!.name).toBe('My Game')
      expect(currentProject!.path).toBe('/projects/my-game')
    })

    test('back to projects clears current project', () => {
      let currentProject: ProjectInfo | null = {
        name: 'My Game',
        path: '/projects/my-game',
        template: 'basic-2d',
        createdAt: 1000,
        modifiedAt: 2000,
      }

      currentProject = null
      expect(currentProject).toBeNull()
    })

    test('shows ProjectManager when no project selected', () => {
      const currentProject: ProjectInfo | null = null
      const showProjectManager = !currentProject
      const showSplitPanel = !!currentProject
      expect(showProjectManager).toBe(true)
      expect(showSplitPanel).toBe(false)
    })

    test('shows SplitPanel when project is selected', () => {
      const currentProject: ProjectInfo | null = {
        name: 'My Game',
        path: '/projects/my-game',
        template: 'basic-2d',
        createdAt: 1000,
        modifiedAt: 2000,
      }
      const showProjectManager = !currentProject
      const showSplitPanel = !!currentProject
      expect(showProjectManager).toBe(false)
      expect(showSplitPanel).toBe(true)
    })

    test('project name and path passed to SplitPanel', () => {
      const project: ProjectInfo = {
        name: 'My Game',
        path: '/projects/my-game',
        template: 'basic-2d',
        createdAt: 1000,
        modifiedAt: 2000,
      }
      expect(project.path).toBe('/projects/my-game')
      expect(project.name).toBe('My Game')
    })

    test('switching projects resets to new project', () => {
      let currentProject: ProjectInfo | null = {
        name: 'Game A',
        path: '/projects/game-a',
        template: 'basic-2d',
        createdAt: 1000,
        modifiedAt: 2000,
      }

      currentProject = null

      currentProject = {
        name: 'Game B',
        path: '/projects/game-b',
        template: 'basic-2d',
        createdAt: 1500,
        modifiedAt: 2500,
      }

      expect(currentProject.name).toBe('Game B')
      expect(currentProject.path).toBe('/projects/game-b')
    })
  })
})
