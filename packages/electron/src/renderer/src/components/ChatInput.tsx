import React, { useState, KeyboardEvent, useRef, useEffect, useCallback, DragEvent, ClipboardEvent } from 'react'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB

export const AGENT_OPTIONS = [
  { id: '', label: 'Auto (Orchestrator)' },
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'game-coder', label: 'Game Coder' },
  { id: 'game-designer', label: 'Designer' },
  { id: 'scene-builder', label: 'Scene Builder' },
  { id: 'debugger', label: 'Debugger' },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'vision', label: 'Vision' },
] as const

export interface ImagePreview {
  id: string
  file: File
  dataUrl: string
  media_type: string
  base64: string
}

interface ChatInputProps {
  onSend: (text: string, attachments?: Array<{ media_type: string; data: string; name?: string }>, agent?: string) => void
  disabled?: boolean
}

function generateId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function fileToImagePreview(file: File): Promise<ImagePreview | null> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return null
  if (file.size > MAX_IMAGE_SIZE) return null

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // dataUrl format: "data:<media_type>;base64,<data>"
      const base64 = dataUrl.split(',')[1] || ''
      resolve({
        id: generateId(),
        file,
        dataUrl,
        media_type: file.type,
        base64,
      })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const previews = await Promise.all(fileArray.map(fileToImagePreview))
    const valid = previews.filter((p): p is ImagePreview => p !== null)
    if (valid.length > 0) {
      setImages((prev) => [...prev, ...valid])
    }
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if ((!text.trim() && images.length === 0) || disabled) return

    const attachments = images.length > 0
      ? images.map((img) => ({
          media_type: img.media_type,
          data: img.base64,
          name: img.file.name,
        }))
      : undefined

    onSend(text, attachments, selectedAgent || undefined)
    setText('')
    setImages([])
  }

  // Clipboard paste (Ctrl+V)
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && ACCEPTED_IMAGE_TYPES.includes(item.type)) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        addFiles(imageFiles)
      }
    },
    [addFiles]
  )

  // Drag and Drop
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        addFiles(files)
      }
    },
    [addFiles]
  )

  // File input click
  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        addFiles(files)
      }
      // Reset input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [addFiles]
  )

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px` // Max ~5 lines
    }
  }, [text])

  const canSend = (text.trim() || images.length > 0) && !disabled

  return (
    <div
      className={`chat-input-card${isDragOver ? ' chat-input-card--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Image Previews — horizontal scroll strip above textarea */}
      {images.length > 0 && (
        <div className="chat-input-card__previews">
          {images.map((img) => (
            <div key={img.id} className="chat-input-card__preview">
              <img
                src={img.dataUrl}
                alt={img.file.name}
                className="chat-input-card__preview-img"
              />
              <button
                className="chat-input-card__preview-remove"
                onClick={() => removeImage(img.id)}
                type="button"
                aria-label={`Remove ${img.file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="chat-input-card__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={images.length > 0 ? 'Add a message or send images...' : 'Ask a question or describe a task...'}
        disabled={disabled}
        rows={1}
      />

      {/* Toolbar */}
      <div className="chat-input-card__toolbar">
        <div className="chat-input-card__toolbar-left">
          <select
            className="chat-input-card__agent-select"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            disabled={disabled}
            aria-label="Select agent"
          >
            {AGENT_OPTIONS.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.label}</option>
            ))}
          </select>
        </div>
        <div className="chat-input-card__toolbar-right">
          <button
            className="chat-input-card__icon-btn"
            onClick={handleFileSelect}
            disabled={disabled}
            type="button"
            aria-label="Attach image"
            title="Attach image (png, jpg, gif, webp)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <button
            className={`chat-input-card__icon-btn chat-input-card__icon-btn--send${canSend ? ' chat-input-card__icon-btn--active' : ''}`}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="chat-input-card__drag-overlay">
          <span>Drop images here</span>
        </div>
      )}
    </div>
  )
}
