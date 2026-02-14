import { extname } from 'node:path'

export interface ExtractedFile {
  path: string
  content: string
  type: 'gdscript' | 'tscn' | 'tres' | 'godot' | 'other'
}

function inferType(path: string, content: string): ExtractedFile['type'] {
  const ext = extname(path).toLowerCase()
  if (ext === '.gd') return 'gdscript'
  if (ext === '.tscn') return 'tscn'
  if (ext === '.tres') return 'tres'
  if (ext === '.godot') return 'godot'

  if (content.trimStart().startsWith('[gd_scene')) return 'tscn'
  if (content.trimStart().startsWith('[gd_resource')) return 'tres'
  if (content.trimStart().startsWith('extends ')) return 'gdscript'
  if (content.includes('config/name=')) return 'godot'

  return 'other'
}

function inferPathFromContent(content: string, language: string): string | null {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('[gd_scene')) return 'scenes/Scene.tscn'
  if (trimmed.startsWith('[gd_resource')) return 'resources/resource.tres'
  if (trimmed.startsWith('extends ') || language === 'gdscript') {
    const match = trimmed.match(/^class_name\s+(\w+)/m)
    if (match) return `scripts/${match[1].toLowerCase()}.gd`
    return 'scripts/script.gd'
  }
  if (language === 'ini' || language === 'tscn') return 'scenes/Scene.tscn'
  return null
}

function extractFromCodeBlocks(response: string): ExtractedFile[] {
  const files: ExtractedFile[] = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || ''
    let code = match[2]

    // Check for filename directive on first line
    const filenameMatch = code.match(/^#\s*filename:\s*(.+)$/m)
    let path: string | null = null

    if (filenameMatch) {
      path = filenameMatch[1].trim()
      code = code.replace(/^#\s*filename:\s*.+\n?/m, '')
    }

    const trimmedCode = code.trim()
    if (!trimmedCode) continue

    if (!path) {
      path = inferPathFromContent(trimmedCode, language)
    }
    if (!path) continue

    files.push({
      path,
      content: trimmedCode,
      type: inferType(path, trimmedCode),
    })
  }

  return files
}

function extractRawContent(response: string): ExtractedFile[] {
  const files: ExtractedFile[] = []
  const lines = response.split('\n')
  let currentContent: string[] = []
  let currentType: ExtractedFile['type'] | null = null

  for (const line of lines) {
    if (line.trimStart().startsWith('[gd_scene') || line.trimStart().startsWith('[gd_resource')) {
      if (currentContent.length > 0 && currentType) {
        const content = currentContent.join('\n').trim()
        const path = currentType === 'tscn' ? 'scenes/Scene.tscn' : 'resources/resource.tres'
        files.push({ path, content, type: currentType })
      }
      currentContent = [line]
      currentType = line.trimStart().startsWith('[gd_scene') ? 'tscn' : 'tres'
    } else if (line.trimStart().startsWith('extends ') && currentType === null) {
      currentContent = [line]
      currentType = 'gdscript'
    } else if (currentType !== null) {
      currentContent.push(line)
    }
  }

  if (currentContent.length > 0 && currentType) {
    const content = currentContent.join('\n').trim()
    const defaultPaths: Record<string, string> = {
      tscn: 'scenes/Scene.tscn',
      tres: 'resources/resource.tres',
      gdscript: 'scripts/script.gd',
    }
    files.push({
      path: defaultPaths[currentType] || 'scripts/script.gd',
      content,
      type: currentType,
    })
  }

  return files
}

export function extractFiles(response: string): ExtractedFile[] {
  // Strategy 1: Code blocks with filename directives
  const fromBlocks = extractFromCodeBlocks(response)
  if (fromBlocks.length > 0) return fromBlocks

  // Strategy 2: Raw content detection
  const fromRaw = extractRawContent(response)
  if (fromRaw.length > 0) return fromRaw

  return []
}
