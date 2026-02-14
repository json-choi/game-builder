import { describe, expect, test } from 'bun:test'
import { formatErrorsForAI, parseGodotErrors, type GodotError } from './error-parser'

describe('error-parser', () => {
  describe('parseGodotErrors', () => {
    test('parses res:// path error with line number', () => {
      const stderr = 'res://scripts/player.gd:15 - Parse Error: Unexpected token'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        file: 'scripts/player.gd',
        line: 15,
        column: 0,
        message: 'Parse Error: Unexpected token',
        type: 'error',
        raw: stderr,
      })
    })

    test('parses res:// path error with line and column', () => {
      const stderr = 'res://scenes/main.tscn:42:8 - Invalid node reference'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0].file).toBe('scenes/main.tscn')
      expect(errors[0].line).toBe(42)
      expect(errors[0].column).toBe(8)
    })

    test('detects warning type from res:// line containing "warning"', () => {
      const stderr = 'res://scripts/util.gd:3 - Warning: Unused variable "x"'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0].type).toBe('warning')
    })

    test('parses standalone ERROR: line', () => {
      const stderr = 'ERROR: Failed to load resource'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        file: '',
        line: 0,
        column: 0,
        message: 'Failed to load resource',
        type: 'error',
        raw: stderr,
      })
    })

    test('parses standalone WARNING: line', () => {
      const stderr = 'WARNING: Deprecated function call'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0].type).toBe('warning')
      expect(errors[0].message).toBe('Deprecated function call')
    })

    test('parses SCRIPT ERROR: line', () => {
      const stderr = 'SCRIPT ERROR: Null reference in _process'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        file: '',
        line: 0,
        column: 0,
        message: 'Null reference in _process',
        type: 'error',
        raw: stderr,
      })
    })

    test('parses multiple errors from multi-line stderr', () => {
      const stderr = [
        'res://scripts/player.gd:10 - Parse Error: Expected ":"',
        'ERROR: Unable to load script',
        'WARNING: Shader compilation slow',
        'SCRIPT ERROR: Stack overflow',
      ].join('\n')
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(4)
      expect(errors[0].file).toBe('scripts/player.gd')
      expect(errors[1].type).toBe('error')
      expect(errors[2].type).toBe('warning')
      expect(errors[3].message).toBe('Stack overflow')
    })

    test('skips non-matching lines', () => {
      const stderr = [
        'Godot Engine v4.2.stable',
        'res://scripts/enemy.gd:5 - Error: bad syntax',
        'Loading project settings...',
      ].join('\n')
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0].file).toBe('scripts/enemy.gd')
    })

    test('returns empty array for empty input', () => {
      expect(parseGodotErrors('')).toEqual([])
    })

    test('returns empty array for input with no errors', () => {
      expect(parseGodotErrors('All good!\nNo issues found.')).toEqual([])
    })

    test('strips res:// prefix from file path', () => {
      const stderr = 'res://deeply/nested/path/script.gd:1 - Error: something'
      const errors = parseGodotErrors(stderr)
      expect(errors[0].file).toBe('deeply/nested/path/script.gd')
    })

    test('handles case-insensitive ERROR/WARNING matching', () => {
      const stderr = 'error: lowercase error message'
      const errors = parseGodotErrors(stderr)
      expect(errors).toHaveLength(1)
      expect(errors[0].type).toBe('error')
    })
  })

  describe('formatErrorsForAI', () => {
    test('returns "No errors found." for empty array', () => {
      expect(formatErrorsForAI([])).toBe('No errors found.')
    })

    test('formats error with file location', () => {
      const errors: GodotError[] = [
        {
          file: 'scripts/player.gd',
          line: 15,
          column: 0,
          message: 'Unexpected token',
          type: 'error',
          raw: '',
        },
      ]
      expect(formatErrorsForAI(errors)).toBe(
        '[ERROR] scripts/player.gd:15 \u2014 Unexpected token'
      )
    })

    test('formats error with file, line, and column', () => {
      const errors: GodotError[] = [
        {
          file: 'scenes/main.tscn',
          line: 42,
          column: 8,
          message: 'Invalid reference',
          type: 'warning',
          raw: '',
        },
      ]
      expect(formatErrorsForAI(errors)).toBe(
        '[WARNING] scenes/main.tscn:42:8 \u2014 Invalid reference'
      )
    })

    test('formats error without file as "Unknown location"', () => {
      const errors: GodotError[] = [
        {
          file: '',
          line: 0,
          column: 0,
          message: 'Something broke',
          type: 'error',
          raw: '',
        },
      ]
      expect(formatErrorsForAI(errors)).toBe('[ERROR] Unknown location \u2014 Something broke')
    })

    test('formats multiple errors separated by newlines', () => {
      const errors: GodotError[] = [
        {
          file: 'a.gd',
          line: 1,
          column: 0,
          message: 'Error A',
          type: 'error',
          raw: '',
        },
        {
          file: 'b.gd',
          line: 2,
          column: 5,
          message: 'Warning B',
          type: 'warning',
          raw: '',
        },
      ]
      const result = formatErrorsForAI(errors)
      const lines = result.split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe('[ERROR] a.gd:1 \u2014 Error A')
      expect(lines[1]).toBe('[WARNING] b.gd:2:5 \u2014 Warning B')
    })
  })
})
