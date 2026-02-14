import React, { useState, useCallback, useEffect } from 'react'

interface FileExplorerProps {
  projectPath?: string | null
}

const FILE_ICONS: Record<string, string> = {
  '.gd': '\u{1F4DC}',
  '.tscn': '\u{1F3AC}',
  '.tres': '\u{1F4E6}',
  '.png': '\u{1F5BC}',
  '.jpg': '\u{1F5BC}',
  '.jpeg': '\u{1F5BC}',
  '.svg': '\u{1F5BC}',
  '.wav': '\u{1F50A}',
  '.ogg': '\u{1F50A}',
  '.mp3': '\u{1F50A}',
  '.ttf': '\u{1F524}',
  '.otf': '\u{1F524}',
  '.cfg': '\u2699\uFE0F',
  '.import': '\u{1F4CB}',
  '.godot': '\u2699\uFE0F',
}

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '\u{1F4C1}'
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
  return FILE_ICONS[ext] ?? '\u{1F4C4}'
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, depth, selectedPath, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 1)

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      setExpanded((prev) => !prev)
    }
    onSelect(node.path)
  }, [node, onSelect])

  const isSelected = selectedPath === node.path
  const icon = getFileIcon(node.name, node.isDirectory)
  const chevron = node.isDirectory ? (expanded ? '\u25BE' : '\u25B8') : '\u00A0'

  return (
    <>
      <div
        className={`file-tree-node ${isSelected ? 'file-tree-node--selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="file-tree-node__chevron">{chevron}</span>
        <span className="file-tree-node__icon">{icon}</span>
        <span className="file-tree-node__name">{node.name}</span>
      </div>
      {node.isDirectory && expanded && node.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ projectPath }) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const tree = await window.api.project.listFiles(path)
      setFiles(tree)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (projectPath) {
      loadFiles(projectPath)
    }
  }, [projectPath, loadFiles])

  if (!projectPath) {
    return (
      <div className="file-explorer">
        <div className="file-explorer__empty">No project open</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="file-explorer">
        <div className="file-explorer__header">
          <span className="file-explorer__title">PROJECT FILES</span>
        </div>
        <div className="file-explorer__empty">Loading files...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="file-explorer">
        <div className="file-explorer__header">
          <span className="file-explorer__title">PROJECT FILES</span>
        </div>
        <div className="file-explorer__empty">{error}</div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="file-explorer">
        <div className="file-explorer__header">
          <span className="file-explorer__title">PROJECT FILES</span>
        </div>
        <div className="file-explorer__empty">No files found</div>
      </div>
    )
  }

  return (
    <div className="file-explorer">
      <div className="file-explorer__header">
        <span className="file-explorer__title">PROJECT FILES</span>
      </div>
      <div className="file-explorer__tree">
        {files.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        ))}
      </div>
    </div>
  )
}
