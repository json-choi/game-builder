import { existsSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { scaffoldProject } from '@game-builder/godot-manager'

function getTemplatesDir(): string {
  // app.getAppPath() varies by launch context (dev vs built vs test) — walk up to find templates
  let dir = app.getAppPath()
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'templates')
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return resolve(app.getAppPath(), '..', '..', 'templates')
}

export interface ProjectInfo {
  name: string
  path: string
  template: string
  createdAt: number
  modifiedAt: number
}

const PROJECTS_DIR = join(app.getPath('userData'), 'projects')

export function ensureProjectsDir(): void {
  if (!existsSync(PROJECTS_DIR)) {
    mkdirSync(PROJECTS_DIR, { recursive: true })
  }
}

export function listProjects(): ProjectInfo[] {
  ensureProjectsDir()
  
  const projects: ProjectInfo[] = []
  const dirs = readdirSync(PROJECTS_DIR)

  for (const dir of dirs) {
    const projectPath = join(PROJECTS_DIR, dir)
    const projectFile = join(projectPath, 'project.godot')

    if (existsSync(projectFile)) {
      try {
        const stats = statSync(projectPath)
        // Try to read project name from project.godot if possible, or use dir name
        // Simple parsing for config_version=5 and [application] config/name="Name"
        let name = dir
        const content = readFileSync(projectFile, 'utf-8')
        const nameMatch = content.match(/config\/name="([^"]+)"/)
        if (nameMatch) {
          name = nameMatch[1]
        }

        projects.push({
          name,
          path: projectPath,
          template: 'unknown', // We don't store template info in project.godot easily, maybe infer or just leave unknown
          createdAt: stats.birthtimeMs,
          modifiedAt: stats.mtimeMs
        })
      } catch (err) {
        console.error(`Failed to read project at ${projectPath}:`, err)
      }
    }
  }

  return projects.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export function createProject(name: string, template: string = 'basic-2d'): ProjectInfo {
  ensureProjectsDir()
  
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const projectPath = join(PROJECTS_DIR, sanitizedName)

  if (existsSync(projectPath)) {
    throw new Error(`Project directory already exists: ${sanitizedName}`)
  }

  scaffoldProject(projectPath, { 
    name, 
    template,
    templatesDir: getTemplatesDir(),
  })

  const stats = statSync(projectPath)
  
  return {
    name,
    path: projectPath,
    template,
    createdAt: stats.birthtimeMs,
    modifiedAt: stats.mtimeMs
  }
}

export function deleteProject(path: string): boolean {
  // Security check: ensure path is within PROJECTS_DIR
  if (!path.startsWith(PROJECTS_DIR)) {
    console.error('Attempted to delete project outside projects directory:', path)
    return false
  }

  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
    return true
  }
  return false
}

export function getProjectPath(name: string): string {
  return join(PROJECTS_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_'))
}
