export interface GodotError {
  file: string
  line: number
  column: number
  message: string
  type: 'error' | 'warning'
  raw: string
}

export function parseGodotErrors(stderr: string): GodotError[] {
  const errors: GodotError[] = []
  const lines = stderr.split('\n')

  for (const line of lines) {
    // Pattern 1: "res://scripts/player.gd:15 - Parse Error: ..."
    const match1 = line.match(/^(res:\/\/[^:]+):(\d+)(?::(\d+))?\s*-\s*(.*)/i)
    if (match1) {
      errors.push({
        file: match1[1].replace('res://', ''),
        line: parseInt(match1[2]),
        column: match1[3] ? parseInt(match1[3]) : 0,
        message: match1[4].trim(),
        type: line.toLowerCase().includes('warning') ? 'warning' : 'error',
        raw: line,
      })
      continue
    }

    // Pattern 2: "ERROR: ..." or "WARNING: ..."
    const match2 = line.match(/^(ERROR|WARNING):\s*(.*)/i)
    if (match2) {
      errors.push({
        file: '',
        line: 0,
        column: 0,
        message: match2[2].trim(),
        type: match2[1].toLowerCase() as 'error' | 'warning',
        raw: line,
      })
      continue
    }

    // Pattern 3: Script errors with different format
    const match3 = line.match(/SCRIPT ERROR:\s*(.*)/i)
    if (match3) {
      errors.push({
        file: '',
        line: 0,
        column: 0,
        message: match3[1].trim(),
        type: 'error',
        raw: line,
      })
    }
  }

  return errors
}

export function formatErrorsForAI(errors: GodotError[]): string {
  if (errors.length === 0) return 'No errors found.'

  return errors
    .map((e) => {
      const location = e.file
        ? `${e.file}:${e.line}${e.column ? ':' + e.column : ''}`
        : 'Unknown location'
      return `[${e.type.toUpperCase()}] ${location} — ${e.message}`
    })
    .join('\n')
}
