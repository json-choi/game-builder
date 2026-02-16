import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { QAPrompt } from './qa-prompts'

export interface CheckItem {
  name: string
  passed: boolean
  reason: string
  weight: number
}

export interface JudgeResult {
  score: number
  checks: CheckItem[]
  issues: string[]
  summary: string
}

function listFilesRecursive(dir: string, base = ''): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name), rel))
    } else {
      results.push(rel)
    }
  }
  return results
}

function readFile(projectPath: string, relPath: string): string | null {
  const abs = join(projectPath, relPath)
  if (!existsSync(abs)) return null
  return readFileSync(abs, 'utf-8')
}

function checkProjectStructure(projectPath: string, files: string[]): CheckItem {
  const hasProjectGodot = files.includes('project.godot')
  if (!hasProjectGodot) {
    return { name: 'Project Structure', passed: false, reason: 'project.godot missing', weight: 20 }
  }
  const content = readFile(projectPath, 'project.godot') ?? ''
  const hasMainScene = /run\/main_scene\s*=/.test(content)
  if (!hasMainScene) {
    return { name: 'Project Structure', passed: false, reason: 'run/main_scene not set in project.godot', weight: 20 }
  }
  return { name: 'Project Structure', passed: true, reason: 'project.godot exists with main_scene configured', weight: 20 }
}

function checkFileReferenceConsistency(projectPath: string, files: string[]): CheckItem {
  const tscnFiles = files.filter(f => extname(f) === '.tscn')
  if (tscnFiles.length === 0) {
    return { name: 'File Reference Consistency', passed: false, reason: 'No .tscn scene files found', weight: 15 }
  }

  const missingRefs: string[] = []

  for (const tscnFile of tscnFiles) {
    const content = readFile(projectPath, tscnFile)
    if (!content) continue

    // ext_resource path="res://scripts/foo.gd" or path="res://scenes/bar.tscn"
    const extResRegex = /path\s*=\s*"res:\/\/([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = extResRegex.exec(content)) !== null) {
      const refPath = match[1]
      // skip .import, .svg, image assets etc. — only check .gd and .tscn refs
      if (extname(refPath) === '.gd' || extname(refPath) === '.tscn') {
        if (!files.includes(refPath)) {
          missingRefs.push(`${tscnFile} → ${refPath}`)
        }
      }
    }
  }

  if (missingRefs.length > 0) {
    return {
      name: 'File Reference Consistency',
      passed: false,
      reason: `Missing referenced files: ${missingRefs.join(', ')}`,
      weight: 15,
    }
  }
  return { name: 'File Reference Consistency', passed: true, reason: 'All .tscn ext_resource references resolve', weight: 15 }
}

function checkGDScriptSyntax(projectPath: string, files: string[]): CheckItem {
  const gdFiles = files.filter(f => extname(f) === '.gd')
  if (gdFiles.length === 0) {
    return { name: 'GDScript Syntax', passed: false, reason: 'No .gd script files found', weight: 15 }
  }

  const errors: string[] = []
  for (const gdFile of gdFiles) {
    const content = readFile(projectPath, gdFile)
    if (!content) continue
    const trimmed = content.trim()

    if (!trimmed.startsWith('extends ') && !/^class_name\s/.test(trimmed)) {
      errors.push(`${gdFile}: missing 'extends' or 'class_name' declaration`)
    }

    if (!/\bfunc\s+\w+/.test(trimmed)) {
      errors.push(`${gdFile}: no function definitions found`)
    }

    // Detect obvious brace-style syntax errors (GDScript uses indentation, not braces)
    if (/\bfunc\s+\w+[^:]*\{/.test(trimmed)) {
      errors.push(`${gdFile}: brace-style syntax detected (GDScript uses indentation)`)
    }

    // Unmatched parentheses (simple heuristic)
    const opens = (trimmed.match(/\(/g) || []).length
    const closes = (trimmed.match(/\)/g) || []).length
    if (opens !== closes) {
      errors.push(`${gdFile}: unmatched parentheses (${opens} open, ${closes} close)`)
    }
  }

  if (errors.length > 0) {
    return { name: 'GDScript Syntax', passed: false, reason: errors.join('; '), weight: 15 }
  }
  return { name: 'GDScript Syntax', passed: true, reason: `${gdFiles.length} .gd file(s) pass basic syntax checks`, weight: 15 }
}

function checkSceneFileFormat(projectPath: string, files: string[]): CheckItem {
  const tscnFiles = files.filter(f => extname(f) === '.tscn')
  if (tscnFiles.length === 0) {
    return { name: 'Scene File Format', passed: false, reason: 'No .tscn scene files found', weight: 15 }
  }

  const errors: string[] = []
  for (const tscnFile of tscnFiles) {
    const content = readFile(projectPath, tscnFile)
    if (!content) continue

    if (!content.includes('[gd_scene')) {
      errors.push(`${tscnFile}: missing [gd_scene] header`)
    }

    if (!content.includes('[node')) {
      errors.push(`${tscnFile}: no [node] declarations found`)
    }

    // Validate ext_resource IDs are referenced in nodes
    const extIds = new Set<string>()
    const extResIdRegex = /\[ext_resource[^\]]*id="([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = extResIdRegex.exec(content)) !== null) {
      extIds.add(m[1])
    }

    // sub_resource IDs
    const subResIdRegex = /\[sub_resource[^\]]*id="([^"]+)"/g
    while ((m = subResIdRegex.exec(content)) !== null) {
      extIds.add(m[1])
    }

    // Check that declared IDs are actually used somewhere (ExtResource/SubResource references)
    for (const id of extIds) {
      const refPattern = new RegExp(`(?:ExtResource|SubResource)\\(\\s*"${id}"\\s*\\)`)
      if (!refPattern.test(content)) {
        // Not a hard failure — just a warning. Some ext_resources are implicitly used.
      }
    }
  }

  if (errors.length > 0) {
    return { name: 'Scene File Format', passed: false, reason: errors.join('; '), weight: 15 }
  }
  return { name: 'Scene File Format', passed: true, reason: `${tscnFiles.length} .tscn file(s) have valid format`, weight: 15 }
}

function checkGameLogicExists(projectPath: string, files: string[]): CheckItem {
  const gdFiles = files.filter(f => extname(f) === '.gd')
  if (gdFiles.length === 0) {
    return { name: 'Game Logic Exists', passed: false, reason: 'No script files found', weight: 15 }
  }

  let totalLines = 0
  let hasFunctions = false

  for (const gdFile of gdFiles) {
    const content = readFile(projectPath, gdFile)
    if (!content) continue
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    totalLines += lines.length
    if (/\bfunc\s+(?:_ready|_process|_physics_process|_input|_unhandled_input)\b/.test(content)) {
      hasFunctions = true
    }
  }

  if (totalLines < 5) {
    return { name: 'Game Logic Exists', passed: false, reason: `Only ${totalLines} non-empty/non-comment lines across all scripts`, weight: 15 }
  }
  if (!hasFunctions) {
    return { name: 'Game Logic Exists', passed: false, reason: 'No lifecycle functions (_ready, _process, _physics_process, _input) found', weight: 15 }
  }
  return { name: 'Game Logic Exists', passed: true, reason: `${totalLines} lines of logic with lifecycle functions`, weight: 15 }
}

function checkUserRequirements(projectPath: string, files: string[], prompt: QAPrompt): CheckItem {
  const allContent = files
    .filter(f => extname(f) === '.gd' || extname(f) === '.tscn')
    .map(f => readFile(projectPath, f) ?? '')
    .join('\n')
    .toLowerCase()

  const matched: string[] = []
  const missing: string[] = []

  for (const kw of prompt.requiredKeywords) {
    if (allContent.includes(kw.toLowerCase())) {
      matched.push(kw)
    } else {
      missing.push(kw)
    }
  }

  const ratio = prompt.requiredKeywords.length > 0
    ? matched.length / prompt.requiredKeywords.length
    : 0

  if (ratio >= 0.6) {
    return {
      name: 'User Requirements',
      passed: true,
      reason: `Found ${matched.length}/${prompt.requiredKeywords.length} required keywords: ${matched.join(', ')}${missing.length > 0 ? ` (missing: ${missing.join(', ')})` : ''}`,
      weight: 20,
    }
  }
  return {
    name: 'User Requirements',
    passed: false,
    reason: `Only ${matched.length}/${prompt.requiredKeywords.length} keywords found. Missing: ${missing.join(', ')}`,
    weight: 20,
  }
}

export function judge(projectPath: string, prompt: QAPrompt): JudgeResult {
  const files = listFilesRecursive(projectPath)

  const checks: CheckItem[] = [
    checkProjectStructure(projectPath, files),
    checkFileReferenceConsistency(projectPath, files),
    checkGDScriptSyntax(projectPath, files),
    checkSceneFileFormat(projectPath, files),
    checkGameLogicExists(projectPath, files),
    checkUserRequirements(projectPath, files, prompt),
  ]

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0)
  const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0)
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  const issues = checks.filter(c => !c.passed).map(c => `[${c.name}] ${c.reason}`)

  const passCount = checks.filter(c => c.passed).length
  const summary = `Score: ${score}/100 — ${passCount}/${checks.length} checks passed`

  return { score, checks, issues, summary }
}

export function issuesToFixPrompt(issues: string[], originalPrompt: string): string {
  return [
    '이전에 생성한 게임 코드에 다음 문제들이 있습니다. 모두 수정해주세요:',
    '',
    ...issues.map((issue, i) => `${i + 1}. ${issue}`),
    '',
    `원래 요청: ${originalPrompt}`,
    '',
    '모든 파일을 다시 생성하되, 위 문제들을 반드시 수정해주세요.',
  ].join('\n')
}
