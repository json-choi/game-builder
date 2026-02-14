export function toRelativePath(absolutePath: string, projectPath: string): string {
  if (!absolutePath || !projectPath) return absolutePath

  const normalizedProject = projectPath.replace(/[/\\]+$/, '')
  const normalizedAbs = absolutePath.replace(/[/\\]+$/, '')

  if (normalizedAbs === normalizedProject) return '.'

  if (normalizedAbs.startsWith(normalizedProject + '/') || normalizedAbs.startsWith(normalizedProject + '\\')) {
    return `./${normalizedAbs.slice(normalizedProject.length + 1)}`
  }

  return absolutePath
}

export function shortenHomePath(absolutePath: string): string {
  if (!absolutePath) return absolutePath

  const macMatch = absolutePath.match(/^\/Users\/[^/]+\/(.*)$/)
  if (macMatch) return `~/${macMatch[1]}`

  const linuxMatch = absolutePath.match(/^\/home\/[^/]+\/(.*)$/)
  if (linuxMatch) return `~/${linuxMatch[1]}`

  const winMatch = absolutePath.match(/^[A-Z]:\\Users\\[^\\]+\\(.*)$/i)
  if (winMatch) return `~\\${winMatch[1]}`

  return absolutePath
}

export function replaceAbsolutePaths(text: string, projectPath: string): string {
  if (!text || !projectPath) return text

  const normalizedProject = projectPath.replace(/[/\\]+$/, '')
  if (!normalizedProject) return text

  // regex special chars in file paths must be escaped before use as pattern
  const escaped = normalizedProject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return text
    .replace(new RegExp(escaped + '[/\\\\]', 'g'), './')
    .replace(new RegExp(escaped, 'g'), '.')
}
