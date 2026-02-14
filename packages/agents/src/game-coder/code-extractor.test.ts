import { describe, expect, test } from 'bun:test'
import { extractFiles, type ExtractedFile } from './code-extractor'

describe('extractFiles', () => {
  describe('code blocks with filename directives', () => {
    test('extracts a single file with filename directive', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/player.gd',
        'extends CharacterBody2D',
        '',
        'func _ready():',
        '    pass',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/player.gd')
      expect(files[0].content).toContain('extends CharacterBody2D')
      expect(files[0].content).not.toContain('filename:')
      expect(files[0].type).toBe('gdscript')
    })

    test('extracts multiple files from separate code blocks', () => {
      const response = [
        'Here is the scene:',
        '```tscn',
        '# filename: scenes/Main.tscn',
        '[gd_scene format=3]',
        '[node name="Main" type="Node2D"]',
        '```',
        '',
        'And the script:',
        '```gdscript',
        '# filename: scripts/main.gd',
        'extends Node2D',
        '',
        'func _ready():',
        '    print("hello")',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(2)
      expect(files[0].path).toBe('scenes/Main.tscn')
      expect(files[0].type).toBe('tscn')
      expect(files[1].path).toBe('scripts/main.gd')
      expect(files[1].type).toBe('gdscript')
    })

    test('strips filename directive line from content', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/enemy.gd',
        'extends Area2D',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].content).toBe('extends Area2D')
    })
  })

  describe('code blocks without filename directives (path inference)', () => {
    test('infers path for gd_scene content', () => {
      const response = [
        '```tscn',
        '[gd_scene format=3]',
        '[node name="Main" type="Node2D"]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scenes/Scene.tscn')
      expect(files[0].type).toBe('tscn')
    })

    test('infers path for gd_resource content', () => {
      const response = [
        '```tres',
        '[gd_resource type="Theme" format=3]',
        '[resource]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('resources/resource.tres')
      expect(files[0].type).toBe('tres')
    })

    test('infers path for gdscript with class_name', () => {
      const response = [
        '```gdscript',
        'class_name PlayerController',
        'extends CharacterBody2D',
        '',
        'func _ready():',
        '    pass',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/playercontroller.gd')
      expect(files[0].type).toBe('gdscript')
    })

    test('infers path for gdscript without class_name', () => {
      const response = [
        '```gdscript',
        'extends Sprite2D',
        '',
        'func _process(delta):',
        '    rotation += delta',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/script.gd')
      expect(files[0].type).toBe('gdscript')
    })

    test('infers tscn path from ini language tag', () => {
      const response = [
        '```ini',
        '[gd_scene format=3]',
        '[node name="Root" type="Node"]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scenes/Scene.tscn')
    })

    test('skips code blocks with empty content', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/empty.gd',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(0)
    })

    test('skips code blocks where path cannot be inferred', () => {
      const response = [
        '```javascript',
        'console.log("not godot")',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(0)
    })
  })

  describe('file type inference', () => {
    test('infers type from .gd extension', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/player.gd',
        'extends Node',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('gdscript')
    })

    test('infers type from .tscn extension', () => {
      const response = [
        '```tscn',
        '# filename: scenes/level.tscn',
        '[gd_scene format=3]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('tscn')
    })

    test('infers type from .tres extension', () => {
      const response = [
        '```tres',
        '# filename: resources/theme.tres',
        '[gd_resource type="Theme"]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('tres')
    })

    test('infers type from .godot extension', () => {
      const response = [
        '```ini',
        '# filename: project.godot',
        'config/name="MyGame"',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('godot')
    })

    test('infers gdscript type from content starting with extends', () => {
      const response = [
        '```',
        '# filename: scripts/unknown.txt',
        'extends Node2D',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('gdscript')
    })

    test('infers tscn type from content starting with [gd_scene', () => {
      const response = [
        '```',
        '# filename: unknown.dat',
        '[gd_scene format=3]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('tscn')
    })

    test('infers tres type from content starting with [gd_resource', () => {
      const response = [
        '```',
        '# filename: unknown.dat',
        '[gd_resource type="StyleBox"]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('tres')
    })

    test('infers godot type from content containing config/name=', () => {
      const response = [
        '```',
        '# filename: unknown.dat',
        '[application]',
        'config/name="TestGame"',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('godot')
    })

    test('returns other for unrecognized extension and content', () => {
      const response = [
        '```',
        '# filename: data/config.json',
        '{"key": "value"}',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].type).toBe('other')
    })
  })

  describe('raw content detection (fallback when no code blocks)', () => {
    test('detects raw gd_scene content', () => {
      const response = [
        'Here is a scene file:',
        '[gd_scene format=3]',
        '[node name="Main" type="Node2D"]',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scenes/Scene.tscn')
      expect(files[0].type).toBe('tscn')
      expect(files[0].content).toContain('[gd_scene format=3]')
    })

    test('detects raw gd_resource content', () => {
      const response = [
        '[gd_resource type="Theme" format=3]',
        '[resource]',
        'default_font_size = 16',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('resources/resource.tres')
      expect(files[0].type).toBe('tres')
    })

    test('detects raw gdscript content starting with extends', () => {
      const response = [
        'extends CharacterBody2D',
        '',
        'var speed = 200',
        '',
        'func _physics_process(delta):',
        '    velocity = Vector2.ZERO',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/script.gd')
      expect(files[0].type).toBe('gdscript')
    })

    test('detects multiple raw sections separated by scene/resource headers', () => {
      const response = [
        '[gd_scene format=3]',
        '[node name="First" type="Node"]',
        '',
        '[gd_resource type="Theme"]',
        '[resource]',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(2)
      expect(files[0].type).toBe('tscn')
      expect(files[1].type).toBe('tres')
    })

    test('raw detection does not trigger when code blocks are present', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/player.gd',
        'extends Node2D',
        '```',
        '',
        'extends Sprite2D',
        'var speed = 100',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/player.gd')
    })
  })

  describe('empty and edge cases', () => {
    test('returns empty array for empty string', () => {
      expect(extractFiles('')).toEqual([])
    })

    test('returns empty array for plain text without code', () => {
      expect(extractFiles('This is just a regular explanation with no code.')).toEqual([])
    })

    test('returns empty array for unrelated code blocks', () => {
      const response = [
        '```python',
        'print("hello")',
        '```',
      ].join('\n')

      expect(extractFiles(response)).toEqual([])
    })

    test('handles code block with no language tag but valid godot content', () => {
      const response = [
        '```',
        '[gd_scene format=3]',
        '[node name="Root" type="Node2D"]',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scenes/Scene.tscn')
    })

    test('trims whitespace in extracted content', () => {
      const response = [
        '```gdscript',
        '# filename: scripts/test.gd',
        '',
        'extends Node',
        '',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files[0].content).toBe('extends Node')
    })

    test('handles filename directive with extra whitespace', () => {
      const response = [
        '```gdscript',
        '#   filename:   scripts/spaced.gd  ',
        'extends Node',
        '```',
      ].join('\n')

      const files = extractFiles(response)
      expect(files).toHaveLength(1)
      expect(files[0].path).toBe('scripts/spaced.gd')
    })
  })
})
