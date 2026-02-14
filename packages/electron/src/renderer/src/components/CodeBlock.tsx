import React, { useState } from 'react'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'text', filename }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const highlightGDScript = (source: string): string => {
    // Escape HTML entities first
    let html = source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Helper to replace with regex safely
    const replace = (pattern: RegExp, className: string) => {
      html = html.replace(pattern, (match) => `<span class="${className}">${match}</span>`)
    }

    // 1. Strings (double and single quotes) - handle these first to avoid matching keywords inside strings
    // We use a placeholder strategy to prevent other rules from messing up strings
    const strings: string[] = []
    html = html.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
      strings.push(`<span class="code-string">${match}</span>`)
      return `__STR_${strings.length - 1}__`
    })

    // 2. Comments
    const comments: string[] = []
    html = html.replace(/#.*/g, (match) => {
      comments.push(`<span class="code-comment">${match}</span>`)
      return `__COM_${comments.length - 1}__`
    })

    // 3. Keywords
    const keywords = [
      'extends', 'class_name', 'func', 'var', 'const', 'signal', 'enum', 'match', 
      'if', 'elif', 'else', 'for', 'while', 'return', 'pass', 'break', 'continue', 
      'await', 'yield', 'static', 'export', 'void', 'true', 'false', 'null', 'self'
    ]
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g')
    replace(keywordRegex, 'code-keyword')

    // 4. Decorators
    replace(/@\w+/g, 'code-decorator')

    // 5. Numbers
    replace(/\b\d+(\.\d+)?\b/g, 'code-number')

    // 6. Built-in types
    const types = [
      'Vector2', 'Vector3', 'Node2D', 'Node3D', 'Sprite2D', 'CharacterBody2D', 
      'RigidBody2D', 'Area2D', 'CollisionShape2D', 'Color', 'String', 'int', 
      'float', 'bool', 'Array', 'Dictionary', 'PackedScene', 'Node', 'Object',
      'Input', 'InputEvent', 'TileMap', 'Timer', 'Label', 'Control'
    ]
    const typeRegex = new RegExp(`\\b(${types.join('|')})\\b`, 'g')
    replace(typeRegex, 'code-type')

    // 7. Function calls (word followed by open paren)
    html = html.replace(/\b([a-zA-Z_]\w*)(?=\()/g, '<span class="code-function">$1</span>')

    // Restore comments and strings
    html = html.replace(/__COM_(\d+)__/g, (_, i) => comments[parseInt(i)])
    html = html.replace(/__STR_(\d+)__/g, (_, i) => strings[parseInt(i)])

    return html
  }

  const highlightedCode = language === 'gdscript' || language === 'godot' 
    ? highlightGDScript(code) 
    : code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Generate line numbers
  const lineCount = code.split('\n').length
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{filename || language}</span>
        <button className="code-block__copy-btn" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="code-block__content">
        <div className="code-block__lines">{lineNumbers}</div>
        <pre className="code-block__pre">
          <code 
            className="code-block__code"
            dangerouslySetInnerHTML={{ __html: highlightedCode }} 
          />
        </pre>
      </div>
    </div>
  )
}
