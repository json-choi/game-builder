import React, { useState, useEffect, useCallback, useRef } from 'react'

interface FileEditorProps {
  projectPath: string
  filePath: string
  onClose: () => void
}

function getLanguage(filePath: string): string {
  const ext = filePath.includes('.') ? filePath.split('.').pop() || '' : ''
  const map: Record<string, string> = {
    gd: 'gdscript',
    tscn: 'tscn',
    tres: 'tres',
    cfg: 'ini',
    json: 'json',
    ts: 'typescript',
    js: 'javascript',
    md: 'markdown',
    txt: 'text',
    godot: 'ini',
    import: 'ini',
    shader: 'glsl',
  }
  return map[ext] || 'text'
}

export const FileEditor: React.FC<FileEditorProps> = ({ projectPath, filePath, onClose }) => {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [readOnly, setReadOnly] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = content !== originalContent
  const language = getLanguage(filePath)
  const fileName = filePath.split('/').pop() || filePath

  const loadFile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const text = await window.api.project.readFile(projectPath, filePath)
      setContent(text)
      setOriginalContent(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectPath, filePath])

  useEffect(() => {
    loadFile()
    setReadOnly(true)
  }, [loadFile])

  const handleSave = useCallback(async () => {
    if (!isDirty) return
    setSaving(true)
    try {
      await window.api.project.writeFile(projectPath, filePath, content)
      setOriginalContent(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [projectPath, filePath, content, isDirty])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  if (loading) {
    return (
      <div className="file-editor">
        <div className="file-editor__header">
          <span className="file-editor__filename">{fileName}</span>
          <button className="file-editor__close-btn" onClick={onClose}>×</button>
        </div>
        <div className="file-editor__loading">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="file-editor">
        <div className="file-editor__header">
          <span className="file-editor__filename">{fileName}</span>
          <button className="file-editor__close-btn" onClick={onClose}>×</button>
        </div>
        <div className="file-editor__error">{error}</div>
      </div>
    )
  }

  return (
    <div className="file-editor" onKeyDown={handleKeyDown}>
      <div className="file-editor__header">
        <span className="file-editor__filename">
          {fileName}
          {isDirty && <span className="file-editor__dirty-dot" />}
        </span>
        <span className="file-editor__lang">{language}</span>
        <div className="file-editor__actions">
          <button
            className={`file-editor__mode-btn ${!readOnly ? 'file-editor__mode-btn--active' : ''}`}
            onClick={() => { setReadOnly((v) => !v); if (readOnly) textareaRef.current?.focus() }}
          >
            {readOnly ? 'Edit' : 'Read-only'}
          </button>
          {isDirty && (
            <button
              className="file-editor__save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button className="file-editor__close-btn" onClick={onClose}>×</button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="file-editor__textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        wrap="off"
      />
    </div>
  )
}
