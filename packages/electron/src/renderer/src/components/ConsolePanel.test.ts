import { describe, expect, test } from 'bun:test'
import {
  parseLogLevel,
  formatTimestamp,
  LOG_LEVEL_COLORS,
  LOG_LEVEL_LABELS,
} from './ConsolePanel'
import type { LogLevel, ConsoleEntry } from './ConsolePanel'

describe('ConsolePanel', () => {
  describe('parseLogLevel', () => {
    test('detects error level from "error" keyword', () => {
      expect(parseLogLevel('ERROR: something broke')).toBe('error')
    })

    test('detects error level from "err:" prefix', () => {
      expect(parseLogLevel('err: connection refused')).toBe('error')
    })

    test('detects error level from "E/" prefix', () => {
      expect(parseLogLevel('E/ fatal crash')).toBe('error')
    })

    test('detects warning level from "warning" keyword', () => {
      expect(parseLogLevel('WARNING: deprecated call')).toBe('warning')
    })

    test('detects warning level from "warn" keyword', () => {
      expect(parseLogLevel('WARN: slow operation')).toBe('warning')
    })

    test('detects warning level from "W/" prefix', () => {
      expect(parseLogLevel('W/ resource leak')).toBe('warning')
    })

    test('detects debug level from "debug" keyword', () => {
      expect(parseLogLevel('DEBUG: variable x = 42')).toBe('debug')
    })

    test('detects debug level from "D/" prefix', () => {
      expect(parseLogLevel('D/ trace info')).toBe('debug')
    })

    test('defaults to info for normal messages', () => {
      expect(parseLogLevel('Godot Engine v4.6.stable')).toBe('info')
    })

    test('defaults to info for empty string', () => {
      expect(parseLogLevel('')).toBe('info')
    })

    test('is case-insensitive', () => {
      expect(parseLogLevel('Error occurred')).toBe('error')
      expect(parseLogLevel('WARNING: attention')).toBe('warning')
      expect(parseLogLevel('Debug mode on')).toBe('debug')
    })
  })

  describe('formatTimestamp', () => {
    test('formats timestamp with zero-padded hours, minutes, seconds', () => {
      const ts = new Date(2025, 0, 1, 9, 5, 3).getTime()
      expect(formatTimestamp(ts)).toBe('09:05:03')
    })

    test('formats midnight correctly', () => {
      const ts = new Date(2025, 0, 1, 0, 0, 0).getTime()
      expect(formatTimestamp(ts)).toBe('00:00:00')
    })

    test('formats end of day correctly', () => {
      const ts = new Date(2025, 0, 1, 23, 59, 59).getTime()
      expect(formatTimestamp(ts)).toBe('23:59:59')
    })

    test('returns a string of format HH:MM:SS', () => {
      const result = formatTimestamp(Date.now())
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })
  })

  describe('LOG_LEVEL_COLORS', () => {
    test('info has gray color', () => {
      expect(LOG_LEVEL_COLORS.info).toBe('#d1d5db')
    })

    test('warning has amber color', () => {
      expect(LOG_LEVEL_COLORS.warning).toBe('#f59e0b')
    })

    test('error has red color', () => {
      expect(LOG_LEVEL_COLORS.error).toBe('#ef4444')
    })

    test('debug has purple color', () => {
      expect(LOG_LEVEL_COLORS.debug).toBe('#8b5cf6')
    })

    test('all four log levels have colors defined', () => {
      const levels: LogLevel[] = ['info', 'warning', 'error', 'debug']
      for (const level of levels) {
        expect(LOG_LEVEL_COLORS[level]).toBeDefined()
        expect(typeof LOG_LEVEL_COLORS[level]).toBe('string')
        expect(LOG_LEVEL_COLORS[level].startsWith('#')).toBe(true)
      }
    })
  })

  describe('LOG_LEVEL_LABELS', () => {
    test('info label is INFO', () => {
      expect(LOG_LEVEL_LABELS.info).toBe('INFO')
    })

    test('warning label is WARN', () => {
      expect(LOG_LEVEL_LABELS.warning).toBe('WARN')
    })

    test('error label is ERR', () => {
      expect(LOG_LEVEL_LABELS.error).toBe('ERR')
    })

    test('debug label is DBG', () => {
      expect(LOG_LEVEL_LABELS.debug).toBe('DBG')
    })

    test('all four log levels have labels defined', () => {
      const levels: LogLevel[] = ['info', 'warning', 'error', 'debug']
      for (const level of levels) {
        expect(LOG_LEVEL_LABELS[level]).toBeDefined()
        expect(typeof LOG_LEVEL_LABELS[level]).toBe('string')
        expect(LOG_LEVEL_LABELS[level].length).toBeGreaterThan(0)
      }
    })
  })

  describe('ConsoleEntry type contract', () => {
    test('ConsoleEntry has required fields', () => {
      const entry: ConsoleEntry = {
        id: 1,
        timestamp: Date.now(),
        level: 'info',
        message: 'test message',
      }
      expect(entry.id).toBe(1)
      expect(typeof entry.timestamp).toBe('number')
      expect(entry.level).toBe('info')
      expect(entry.message).toBe('test message')
    })

    test('ConsoleEntry level accepts all LogLevel values', () => {
      const levels: LogLevel[] = ['info', 'warning', 'error', 'debug']
      levels.forEach((level, i) => {
        const entry: ConsoleEntry = { id: i, timestamp: Date.now(), level, message: `msg-${i}` }
        expect(entry.level).toBe(level)
      })
    })
  })

  describe('output-to-entries conversion logic', () => {
    test('new output lines get parsed into entries with correct levels', () => {
      const lines = [
        'Godot Engine v4.6.stable',
        'WARNING: deprecated function',
        'ERROR: crash detected',
        'DEBUG: variable x = 42',
      ]

      const entries = lines.map((line, i) => ({
        id: i + 1,
        timestamp: Date.now(),
        level: parseLogLevel(line),
        message: line,
      }))

      expect(entries[0].level).toBe('info')
      expect(entries[1].level).toBe('warning')
      expect(entries[2].level).toBe('error')
      expect(entries[3].level).toBe('debug')
    })

    test('output buffer caps at 500 entries', () => {
      const entries: ConsoleEntry[] = []
      for (let i = 0; i < 600; i++) {
        entries.push({ id: i, timestamp: Date.now(), level: 'info', message: `line-${i}` })
      }
      const capped = entries.slice(-500)
      expect(capped.length).toBe(500)
      expect(capped[0].message).toBe('line-100')
      expect(capped[499].message).toBe('line-599')
    })
  })

  describe('filter logic', () => {
    test('filter "all" returns all entries', () => {
      const entries: ConsoleEntry[] = [
        { id: 1, timestamp: 0, level: 'info', message: 'a' },
        { id: 2, timestamp: 0, level: 'error', message: 'b' },
        { id: 3, timestamp: 0, level: 'warning', message: 'c' },
      ]
      const filterLevel: LogLevel | 'all' = 'all'
      const filtered = filterLevel === 'all' ? entries : entries.filter((e) => e.level === filterLevel)
      expect(filtered).toHaveLength(3)
    })

    test('filter "error" returns only error entries', () => {
      const entries: ConsoleEntry[] = [
        { id: 1, timestamp: 0, level: 'info', message: 'a' },
        { id: 2, timestamp: 0, level: 'error', message: 'b' },
        { id: 3, timestamp: 0, level: 'warning', message: 'c' },
        { id: 4, timestamp: 0, level: 'error', message: 'd' },
      ]
      const filtered = entries.filter((e) => e.level === 'error')
      expect(filtered).toHaveLength(2)
      expect(filtered[0].message).toBe('b')
      expect(filtered[1].message).toBe('d')
    })

    test('filter "warning" returns only warning entries', () => {
      const entries: ConsoleEntry[] = [
        { id: 1, timestamp: 0, level: 'info', message: 'a' },
        { id: 2, timestamp: 0, level: 'warning', message: 'b' },
      ]
      const filtered = entries.filter((e) => e.level === 'warning')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].message).toBe('b')
    })

    test('counting entries by level', () => {
      const entries: ConsoleEntry[] = [
        { id: 1, timestamp: 0, level: 'info', message: 'a' },
        { id: 2, timestamp: 0, level: 'error', message: 'b' },
        { id: 3, timestamp: 0, level: 'warning', message: 'c' },
        { id: 4, timestamp: 0, level: 'info', message: 'd' },
        { id: 5, timestamp: 0, level: 'error', message: 'e' },
      ]
      const counts = {
        error: entries.filter((e) => e.level === 'error').length,
        warning: entries.filter((e) => e.level === 'warning').length,
        info: entries.filter((e) => e.level === 'info').length,
        debug: entries.filter((e) => e.level === 'debug').length,
      }
      expect(counts.error).toBe(2)
      expect(counts.warning).toBe(1)
      expect(counts.info).toBe(2)
      expect(counts.debug).toBe(0)
    })
  })
})
