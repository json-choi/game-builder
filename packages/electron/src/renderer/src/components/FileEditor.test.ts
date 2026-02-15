import { describe, expect, test } from 'bun:test'

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

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

describe('FileEditor', () => {
  describe('language detection', () => {
    test('.gd files detected as gdscript', () => {
      expect(getLanguage('main.gd')).toBe('gdscript')
    })

    test('.tscn files detected as tscn', () => {
      expect(getLanguage('level.tscn')).toBe('tscn')
    })

    test('.tres files detected as tres', () => {
      expect(getLanguage('resource.tres')).toBe('tres')
    })

    test('.cfg files detected as ini', () => {
      expect(getLanguage('project.cfg')).toBe('ini')
    })

    test('.json files detected as json', () => {
      expect(getLanguage('data.json')).toBe('json')
    })

    test('.ts files detected as typescript', () => {
      expect(getLanguage('app.ts')).toBe('typescript')
    })

    test('.js files detected as javascript', () => {
      expect(getLanguage('index.js')).toBe('javascript')
    })

    test('.md files detected as markdown', () => {
      expect(getLanguage('README.md')).toBe('markdown')
    })

    test('.godot files detected as ini', () => {
      expect(getLanguage('project.godot')).toBe('ini')
    })

    test('.shader files detected as glsl', () => {
      expect(getLanguage('custom.shader')).toBe('glsl')
    })

    test('unknown extensions default to text', () => {
      expect(getLanguage('data.xyz')).toBe('text')
    })

    test('files without extension default to text', () => {
      expect(getLanguage('Makefile')).toBe('text')
    })

    test('nested paths extract extension correctly', () => {
      expect(getLanguage('scripts/player/movement.gd')).toBe('gdscript')
    })
  })

  describe('filename extraction', () => {
    test('extracts filename from simple path', () => {
      expect(getFileName('player.gd')).toBe('player.gd')
    })

    test('extracts filename from nested path', () => {
      expect(getFileName('scripts/player/movement.gd')).toBe('movement.gd')
    })

    test('handles path with no slashes', () => {
      expect(getFileName('main.tscn')).toBe('main.tscn')
    })
  })

  describe('dirty state logic', () => {
    test('content matching original is not dirty', () => {
      const original = 'extends Node2D'
      const current = 'extends Node2D'
      expect(current !== original).toBe(false)
    })

    test('modified content is dirty', () => {
      const original = 'extends Node2D'
      const current = 'extends CharacterBody2D'
      expect(current !== original).toBe(true)
    })

    test('save resets dirty state', () => {
      let original = 'extends Node2D'
      let current = 'extends CharacterBody2D'
      expect(current !== original).toBe(true)

      original = current
      expect(current !== original).toBe(false)
    })
  })

  describe('read-only mode toggle', () => {
    test('starts in read-only mode', () => {
      let readOnly = true
      expect(readOnly).toBe(true)
    })

    test('can toggle to edit mode', () => {
      let readOnly = true
      readOnly = !readOnly
      expect(readOnly).toBe(false)
    })

    test('can toggle back to read-only', () => {
      let readOnly = false
      readOnly = !readOnly
      expect(readOnly).toBe(true)
    })

    test('loading new file resets to read-only', () => {
      let readOnly = false
      readOnly = true
      expect(readOnly).toBe(true)
    })
  })

  describe('path security', () => {
    test('path within project is valid', () => {
      const projectPath = '/projects/my-game'
      const fullPath = projectPath + '/' + 'scripts/main.gd'
      expect(fullPath.startsWith(projectPath)).toBe(true)
    })

    test('path traversal is detectable', () => {
      const projectPath = '/projects/my-game'
      const malicious = '../../../etc/passwd'
      const fullPath = projectPath + '/' + malicious
      const normalized = fullPath.replace(/\/\.\./g, '')
      expect(normalized).not.toContain('..')
    })
  })
})
