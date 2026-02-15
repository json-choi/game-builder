import React, { useEffect, useRef, useState, useCallback } from 'react'

export type LogLevel = 'info' | 'warning' | 'error' | 'debug'

export interface ConsoleEntry {
  id: number
  timestamp: number
  level: LogLevel
  message: string
}

export function parseLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('err:') || lower.startsWith('e/')) return 'error'
  if (lower.includes('warning') || lower.includes('warn') || lower.startsWith('w/')) return 'warning'
  if (lower.includes('debug') || lower.startsWith('d/')) return 'debug'
  return 'info'
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  info: '#d1d5db',
  warning: '#f59e0b',
  error: '#ef4444',
  debug: '#8b5cf6',
}

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERR',
  debug: 'DBG',
}

interface ConsolePanelProps {
  output?: string[]
  onClear?: () => void
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ output = [], onClear }) => {
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idCounterRef = useRef(0)
  const prevOutputLenRef = useRef(0)

  useEffect(() => {
    if (output.length > prevOutputLenRef.current) {
      const newLines = output.slice(prevOutputLenRef.current)
      const newEntries = newLines.map((line) => ({
        id: ++idCounterRef.current,
        timestamp: Date.now(),
        level: parseLogLevel(line),
        message: line,
      }))
      setEntries((prev) => [...prev, ...newEntries].slice(-500))
    } else if (output.length === 0 && prevOutputLenRef.current > 0) {
      setEntries([])
      idCounterRef.current = 0
    }
    prevOutputLenRef.current = output.length
  }, [output])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const handleClear = useCallback(() => {
    setEntries([])
    idCounterRef.current = 0
    prevOutputLenRef.current = 0
    onClear?.()
  }, [onClear])

  const filteredEntries = filterLevel === 'all'
    ? entries
    : entries.filter((e) => e.level === filterLevel)

  const counts = {
    error: entries.filter((e) => e.level === 'error').length,
    warning: entries.filter((e) => e.level === 'warning').length,
    info: entries.filter((e) => e.level === 'info').length,
    debug: entries.filter((e) => e.level === 'debug').length,
  }

  if (entries.length === 0) {
    return (
      <div className="console-panel">
        <div className="console-panel__toolbar">
          <span className="console-panel__title">CONSOLE</span>
        </div>
        <div className="console-panel__empty">
          <div className="console-panel__empty-icon">{'\u{1F4BB}'}</div>
          <div className="console-panel__empty-text">No output yet</div>
          <div className="console-panel__empty-subtext">
            Godot logs and output will appear here
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="console-panel">
      <div className="console-panel__toolbar">
        <span className="console-panel__title">CONSOLE</span>
        <div className="console-panel__filters">
          <button
            className={`console-panel__filter-btn ${filterLevel === 'all' ? 'console-panel__filter-btn--active' : ''}`}
            onClick={() => setFilterLevel('all')}
          >
            All ({entries.length})
          </button>
          {counts.error > 0 && (
            <button
              className={`console-panel__filter-btn console-panel__filter-btn--error ${filterLevel === 'error' ? 'console-panel__filter-btn--active' : ''}`}
              onClick={() => setFilterLevel('error')}
            >
              Errors ({counts.error})
            </button>
          )}
          {counts.warning > 0 && (
            <button
              className={`console-panel__filter-btn console-panel__filter-btn--warning ${filterLevel === 'warning' ? 'console-panel__filter-btn--active' : ''}`}
              onClick={() => setFilterLevel('warning')}
            >
              Warns ({counts.warning})
            </button>
          )}
        </div>
        <div className="console-panel__actions">
          <button
            className={`console-panel__action-btn ${autoScroll ? 'console-panel__action-btn--active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          >
            {'\u2B07'}
          </button>
          <button
            className="console-panel__action-btn console-panel__action-btn--clear"
            onClick={handleClear}
            title="Clear console"
          >
            {'\u{1F5D1}'}
          </button>
        </div>
      </div>

      <div
        className="console-panel__output"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className={`console-panel__entry console-panel__entry--${entry.level}`}
            style={{ color: LOG_LEVEL_COLORS[entry.level] }}
          >
            <span className="console-panel__entry-time">
              {formatTimestamp(entry.timestamp)}
            </span>
            <span className="console-panel__entry-level">
              {LOG_LEVEL_LABELS[entry.level]}
            </span>
            <span className="console-panel__entry-message">
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
