import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { checkOnly, type GodotCliResult } from '@game-builder/godot-manager'

export interface ProjectTool {
  name: string
  description: string
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

function listFilesRecursive(dir: string, base: string = ''): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.godot' || entry.name === '.import' || entry.name === 'node_modules') continue
    const relPath = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name), relPath))
    } else {
      results.push(relPath)
    }
  }
  return results
}

export function createProjectTools(projectPath: string): ProjectTool[] {
  return [
    {
      name: 'write_file',
      description: 'Write content to a file in the project directory. Creates parent directories if needed.',
      async execute(args: Record<string, unknown>) {
        const filePath = args.path as string
        const content = args.content as string
        if (!filePath || content === undefined) {
          throw new Error('write_file requires "path" and "content" arguments')
        }
        const absPath = join(projectPath, filePath)
        const dir = dirname(absPath)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        writeFileSync(absPath, content, 'utf-8')
        return { success: true, path: filePath }
      },
    },
    {
      name: 'read_file',
      description: 'Read file content from the project directory.',
      async execute(args: Record<string, unknown>) {
        const filePath = args.path as string
        if (!filePath) throw new Error('read_file requires "path" argument')
        const absPath = join(projectPath, filePath)
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}` }
        }
        const content = readFileSync(absPath, 'utf-8')
        return { success: true, content }
      },
    },
    {
      name: 'list_files',
      description: 'List all files in the project directory recursively.',
      async execute() {
        const files = listFilesRecursive(projectPath)
        return { success: true, files }
      },
    },
    {
      name: 'validate_project',
      description: 'Validate the entire Godot project using godot --check-only.',
      async execute(): Promise<GodotCliResult> {
        return checkOnly(projectPath)
      },
    },
    {
      name: 'validate_script',
      description: 'Validate a specific GDScript file using godot --check-only --script.',
      async execute(args: Record<string, unknown>): Promise<GodotCliResult> {
        const scriptPath = args.path as string
        if (!scriptPath) throw new Error('validate_script requires "path" argument')
        return checkOnly(projectPath, scriptPath)
      },
    },
  ]
}
