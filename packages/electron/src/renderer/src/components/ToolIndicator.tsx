import React from 'react'

interface ToolIndicatorProps {
  tool: string
  args?: string
  status: 'pending' | 'running' | 'done' | 'error'
  title?: string
  projectPath?: string
}

interface ToolMeta {
  letter: string
  label: string
}

const TOOL_META: Record<string, ToolMeta> = {
  read_file: { letter: 'R', label: 'Read' },
  read: { letter: 'R', label: 'Read' },
  write_file: { letter: 'W', label: 'Write' },
  write: { letter: 'W', label: 'Write' },
  edit: { letter: 'E', label: 'Edit' },
  execute: { letter: '$', label: 'Shell' },
  bash: { letter: '$', label: 'Shell' },
  search: { letter: 'S', label: 'Search' },
  grep: { letter: 'S', label: 'Search' },
  glob: { letter: 'S', label: 'Search' },
  list_files: { letter: 'L', label: 'List' },
  list: { letter: 'L', label: 'List' },
  task: { letter: 'A', label: 'Agent' },
  webfetch: { letter: 'F', label: 'Fetch' },
  apply_patch: { letter: 'P', label: 'Patch' },
  lsp_diagnostics: { letter: 'D', label: 'Diagnostics' },
  lsp_symbols: { letter: 'D', label: 'Symbols' },
  lsp_goto_definition: { letter: 'D', label: 'Definition' },
  lsp_find_references: { letter: 'D', label: 'References' },
  todowrite: { letter: 'T', label: 'Todo' },
}

const DEFAULT_META: ToolMeta = { letter: '?', label: 'Tool' }

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

function extractSubtitle(tool: string, args?: string, projectPath?: string): string {
  if (!args) return ''

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(args)
  } catch {
    return ''
  }

  const normalizedTool = tool.toLowerCase()

  // File operations → show filename
  if (['read', 'read_file', 'write', 'write_file', 'edit'].includes(normalizedTool)) {
    const filePath = parsed.filePath as string | undefined
    if (filePath) {
      if (projectPath) {
        const normalizedProject = projectPath.replace(/[/\\]+$/, '')
        if (filePath.startsWith(normalizedProject + '/') || filePath.startsWith(normalizedProject + '\\')) {
          return filePath.slice(normalizedProject.length + 1)
        }
      }
      return basename(filePath)
    }
  }

  // Shell → show description or truncated command
  if (['bash', 'execute'].includes(normalizedTool)) {
    const desc = parsed.description as string | undefined
    if (desc) return desc
    const cmd = parsed.command as string | undefined
    if (cmd) return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
  }

  // Search → show pattern
  if (['grep', 'search', 'glob'].includes(normalizedTool)) {
    const pattern = parsed.pattern as string | undefined
    if (pattern) return pattern
    const query = parsed.query as string | undefined
    if (query) return query
  }

  // List → show path
  if (['list', 'list_files'].includes(normalizedTool)) {
    const path = parsed.path as string | undefined
    if (path) return basename(path)
  }

  // Agent → show description
  if (normalizedTool === 'task') {
    const desc = parsed.description as string | undefined
    if (desc) return desc
  }

  // Fetch → show URL
  if (normalizedTool === 'webfetch') {
    const url = parsed.url as string | undefined
    if (url) return url.length > 60 ? url.slice(0, 57) + '...' : url
  }

  // LSP tools → show filePath
  if (normalizedTool.startsWith('lsp_')) {
    const filePath = parsed.filePath as string | undefined
    if (filePath) return basename(filePath)
  }

  // Todo → show first item
  if (normalizedTool === 'todowrite') {
    const todos = parsed.todos as Array<{ content?: string }> | undefined
    if (todos?.[0]?.content) {
      const first = todos[0].content
      return first.length > 50 ? first.slice(0, 47) + '...' : first
    }
  }

  return ''
}

export const ToolIndicator: React.FC<ToolIndicatorProps> = ({ tool, args, status, projectPath }) => {
  const [isExpanded, setIsExpanded] = React.useState(false)

  const normalizedTool = tool.toLowerCase()
  const meta = TOOL_META[normalizedTool] || DEFAULT_META
  const subtitle = extractSubtitle(tool, args, projectPath)

  let formattedArgs = ''
  if (args) {
    try {
      formattedArgs = JSON.stringify(JSON.parse(args), null, 2)
    } catch {
      formattedArgs = args
    }
  }

  return (
    <div className={`tool-card tool-card--${status}`}>
      <button
        className="tool-card__trigger"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="tool-card__icon" data-status={status}>
          {meta.letter}
        </span>
        <span className="tool-card__label">{meta.label}</span>
        {subtitle && <span className="tool-card__subtitle">{subtitle}</span>}
        <span className="tool-card__status-area">
          {status === 'running' && <span className="tool-card__spinner" />}
          {status === 'done' && <span className="tool-card__check">✓</span>}
          {status === 'error' && <span className="tool-card__error">✕</span>}
        </span>
        <span className={`tool-card__chevron ${isExpanded ? 'tool-card__chevron--open' : ''}`}>
          ›
        </span>
      </button>

      {isExpanded && formattedArgs && (
        <div className="tool-card__content">
          <pre className="tool-card__pre">{formattedArgs}</pre>
        </div>
      )}
    </div>
  )
}