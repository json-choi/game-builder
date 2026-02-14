import { describe, expect, test } from 'bun:test'
import { getToolsForAgent, isToolAllowed } from './tool-restrictions'

describe('tool-restrictions', () => {
  describe('getToolsForAgent', () => {
    test('returns tools for orchestrator', () => {
      expect(getToolsForAgent('orchestrator')).toEqual(['read_file', 'list_files'])
    })

    test('returns tools for game-designer', () => {
      expect(getToolsForAgent('game-designer')).toEqual(['read_file', 'write_file', 'list_files'])
    })

    test('returns tools for scene-builder', () => {
      expect(getToolsForAgent('scene-builder')).toEqual([
        'read_file',
        'write_file',
        'list_files',
        'validate_project',
      ])
    })

    test('returns tools for game-coder', () => {
      expect(getToolsForAgent('game-coder')).toEqual([
        'read_file',
        'write_file',
        'list_files',
        'validate_project',
        'validate_script',
      ])
    })

    test('returns tools for debugger', () => {
      expect(getToolsForAgent('debugger')).toEqual([
        'read_file',
        'write_file',
        'list_files',
        'validate_project',
        'validate_script',
      ])
    })

    test('returns tools for reviewer', () => {
      expect(getToolsForAgent('reviewer')).toEqual([
        'read_file',
        'list_files',
        'validate_project',
      ])
    })

    test('returns tools for asset-generator', () => {
      expect(getToolsForAgent('asset-generator')).toEqual([
        'read_file',
        'write_file',
        'list_files',
      ])
    })

    test('returns empty array for unknown agent', () => {
      expect(getToolsForAgent('unknown-agent')).toEqual([])
    })

    test('returns empty array for empty string', () => {
      expect(getToolsForAgent('')).toEqual([])
    })
  })

  describe('isToolAllowed', () => {
    test('returns true for allowed tool', () => {
      expect(isToolAllowed('orchestrator', 'read_file')).toBe(true)
      expect(isToolAllowed('orchestrator', 'list_files')).toBe(true)
    })

    test('returns false for disallowed tool', () => {
      expect(isToolAllowed('orchestrator', 'write_file')).toBe(false)
      expect(isToolAllowed('reviewer', 'write_file')).toBe(false)
    })

    test('returns false for unknown agent', () => {
      expect(isToolAllowed('nonexistent', 'read_file')).toBe(false)
    })

    test('returns false for unknown tool on known agent', () => {
      expect(isToolAllowed('game-coder', 'delete_file')).toBe(false)
    })

    test('returns false for empty agent name', () => {
      expect(isToolAllowed('', 'read_file')).toBe(false)
    })

    test('returns false for empty tool name', () => {
      expect(isToolAllowed('orchestrator', '')).toBe(false)
    })

    test('game-coder has validate_script but orchestrator does not', () => {
      expect(isToolAllowed('game-coder', 'validate_script')).toBe(true)
      expect(isToolAllowed('orchestrator', 'validate_script')).toBe(false)
    })
  })
})
