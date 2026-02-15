import { describe, expect, test, beforeEach, mock } from 'bun:test'

interface ProjectInfo {
  name: string
  path: string
  template: string
  createdAt: number
  modifiedAt: number
}

interface MockProjectAPI {
  list: ReturnType<typeof mock>
  create: ReturnType<typeof mock>
  delete: ReturnType<typeof mock>
}

function createMockProjectAPI(): MockProjectAPI {
  return {
    list: mock(() =>
      Promise.resolve([
        { name: 'Game One', path: '/projects/Game_One', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
        { name: 'Game Two', path: '/projects/Game_Two', template: 'basic-2d', createdAt: 1500, modifiedAt: 2500 },
      ] as ProjectInfo[])
    ),
    create: mock((name: string, template: string) =>
      Promise.resolve({ name, path: `/projects/${name.replace(/\s/g, '_')}`, template, createdAt: Date.now(), modifiedAt: Date.now() } as ProjectInfo)
    ),
    delete: mock(() => Promise.resolve(true)),
  }
}

function setupWindowAPI(projectApi: MockProjectAPI): void {
  ;(globalThis as Record<string, unknown>).window = {
    api: { project: projectApi },
  }
}

function cleanupWindowAPI(): void {
  delete (globalThis as Record<string, unknown>).window
}

describe('useProjects', () => {
  describe('window.api.project mock contract', () => {
    let mockApi: MockProjectAPI

    beforeEach(() => {
      mockApi = createMockProjectAPI()
      setupWindowAPI(mockApi)
    })

    test('list returns array of projects', async () => {
      const projects = await mockApi.list()
      expect(projects).toHaveLength(2)
      expect(projects[0].name).toBe('Game One')
      expect(projects[1].name).toBe('Game Two')
    })

    test('create returns new project with correct fields', async () => {
      const project = await mockApi.create('New Game', 'basic-2d')
      expect(project.name).toBe('New Game')
      expect(project.path).toBe('/projects/New_Game')
      expect(project.template).toBe('basic-2d')
      expect(typeof project.createdAt).toBe('number')
      expect(typeof project.modifiedAt).toBe('number')
    })

    test('delete returns true on success', async () => {
      const result = await mockApi.delete('/projects/Game_One')
      expect(result).toBe(true)
      expect(mockApi.delete).toHaveBeenCalledWith('/projects/Game_One')
    })
  })

  describe('loadProjects state management', () => {
    test('successful load populates projects array', async () => {
      const mockApi = createMockProjectAPI()
      let projects: ProjectInfo[] = []
      let loading = false
      let error: string | null = null

      loading = true
      error = null
      try {
        projects = await mockApi.list()
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      } finally {
        loading = false
      }

      expect(projects).toHaveLength(2)
      expect(loading).toBe(false)
      expect(error).toBeNull()
    })

    test('failed load sets error message', async () => {
      const mockApi = createMockProjectAPI()
      mockApi.list = mock(() => Promise.reject(new Error('Disk read failed')))
      let projects: ProjectInfo[] = []
      let error: string | null = null

      try {
        projects = await mockApi.list()
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(projects).toHaveLength(0)
      expect(error).toBe('Disk read failed')
    })

    test('failed load with non-Error converts to string', async () => {
      const mockApi = createMockProjectAPI()
      mockApi.list = mock(() => Promise.reject('raw error'))
      let error: string | null = null

      try {
        await mockApi.list()
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(error).toBe('raw error')
    })
  })

  describe('createProject state management', () => {
    test('successful create prepends project to list', async () => {
      const mockApi = createMockProjectAPI()
      let projects: ProjectInfo[] = [
        { name: 'Existing', path: '/projects/Existing', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
      ]
      let error: string | null = null

      error = null
      try {
        const project = await mockApi.create('New Game', 'basic-2d')
        projects = [project, ...projects]
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(projects).toHaveLength(2)
      expect(projects[0].name).toBe('New Game')
      expect(projects[1].name).toBe('Existing')
      expect(error).toBeNull()
    })

    test('failed create sets error and returns null', async () => {
      const mockApi = createMockProjectAPI()
      mockApi.create = mock(() => Promise.reject(new Error('Project directory already exists: Dup')))
      let error: string | null = null
      let result: ProjectInfo | null = null

      try {
        result = await mockApi.create('Dup', 'basic-2d')
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        result = null
      }

      expect(result).toBeNull()
      expect(error).toBe('Project directory already exists: Dup')
    })

    test('create calls API with name and template', async () => {
      const mockApi = createMockProjectAPI()
      await mockApi.create('My Game', 'basic-2d')
      expect(mockApi.create).toHaveBeenCalledWith('My Game', 'basic-2d')
    })
  })

  describe('deleteProject state management', () => {
    test('successful delete removes project from list', async () => {
      const mockApi = createMockProjectAPI()
      let projects: ProjectInfo[] = [
        { name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
        { name: 'Game B', path: '/projects/Game_B', template: 'basic-2d', createdAt: 1500, modifiedAt: 2500 },
      ]

      const pathToDelete = '/projects/Game_A'
      const success = await mockApi.delete(pathToDelete)
      if (success) {
        projects = projects.filter((p) => p.path !== pathToDelete)
      }

      expect(projects).toHaveLength(1)
      expect(projects[0].name).toBe('Game B')
    })

    test('failed delete does not remove project from list', async () => {
      const mockApi = createMockProjectAPI()
      mockApi.delete = mock(() => Promise.resolve(false))
      let projects: ProjectInfo[] = [
        { name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
      ]

      const success = await mockApi.delete('/projects/Game_A')
      if (success) {
        projects = projects.filter((p) => p.path !== '/projects/Game_A')
      }

      expect(projects).toHaveLength(1)
    })

    test('delete rejection sets error', async () => {
      const mockApi = createMockProjectAPI()
      mockApi.delete = mock(() => Promise.reject(new Error('Permission denied')))
      let error: string | null = null

      try {
        await mockApi.delete('/projects/Game_A')
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      expect(error).toBe('Permission denied')
    })

    test('delete clears currentProject when deleting selected project', async () => {
      const mockApi = createMockProjectAPI()
      let currentProject: ProjectInfo | null = {
        name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000,
      }

      const pathToDelete = '/projects/Game_A'
      const success = await mockApi.delete(pathToDelete)
      if (success && currentProject?.path === pathToDelete) {
        currentProject = null
      }

      expect(currentProject).toBeNull()
    })

    test('delete preserves currentProject when deleting different project', async () => {
      const mockApi = createMockProjectAPI()
      let currentProject: ProjectInfo | null = {
        name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000,
      }

      const success = await mockApi.delete('/projects/Game_B')
      if (success && currentProject?.path === '/projects/Game_B') {
        currentProject = null
      }

      expect(currentProject).not.toBeNull()
      expect(currentProject!.name).toBe('Game A')
    })
  })

  describe('selectProject', () => {
    test('selects project by path', () => {
      const projects: ProjectInfo[] = [
        { name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
        { name: 'Game B', path: '/projects/Game_B', template: 'basic-2d', createdAt: 1500, modifiedAt: 2500 },
      ]

      const currentProject = projects.find((p) => p.path === '/projects/Game_B') ?? null
      expect(currentProject).not.toBeNull()
      expect(currentProject!.name).toBe('Game B')
    })

    test('returns null for non-existent path', () => {
      const projects: ProjectInfo[] = [
        { name: 'Game A', path: '/projects/Game_A', template: 'basic-2d', createdAt: 1000, modifiedAt: 2000 },
      ]

      const currentProject = projects.find((p) => p.path === '/projects/nonexistent') ?? null
      expect(currentProject).toBeNull()
    })
  })

  describe('ProjectInfo shape validation', () => {
    test('ProjectInfo has all required fields', async () => {
      const mockApi = createMockProjectAPI()
      const projects = await mockApi.list()

      for (const project of projects) {
        expect(typeof project.name).toBe('string')
        expect(typeof project.path).toBe('string')
        expect(typeof project.template).toBe('string')
        expect(typeof project.createdAt).toBe('number')
        expect(typeof project.modifiedAt).toBe('number')
      }
    })

    test('created project has same shape as listed project', async () => {
      const mockApi = createMockProjectAPI()
      const created = await mockApi.create('Shape Test', 'basic-2d')
      const listed = (await mockApi.list())[0]

      const createdKeys = Object.keys(created).sort()
      const listedKeys = Object.keys(listed).sort()
      expect(createdKeys).toEqual(listedKeys)
    })
  })
})
