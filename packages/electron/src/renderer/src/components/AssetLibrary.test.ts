import { describe, expect, test } from 'bun:test'
import {
  categorizeFile,
  getAssetIcon,
  CATEGORY_LABELS,
} from './AssetLibrary'
import type { AssetCategory, AssetEntry } from './AssetLibrary'

describe('AssetLibrary', () => {
  describe('categorizeFile', () => {
    test('categorizes .png as image', () => {
      expect(categorizeFile('.png')).toBe('image')
    })

    test('categorizes .jpg as image', () => {
      expect(categorizeFile('.jpg')).toBe('image')
    })

    test('categorizes .jpeg as image', () => {
      expect(categorizeFile('.jpeg')).toBe('image')
    })

    test('categorizes .svg as image', () => {
      expect(categorizeFile('.svg')).toBe('image')
    })

    test('categorizes .webp as image', () => {
      expect(categorizeFile('.webp')).toBe('image')
    })

    test('categorizes .bmp as image', () => {
      expect(categorizeFile('.bmp')).toBe('image')
    })

    test('categorizes .gif as image', () => {
      expect(categorizeFile('.gif')).toBe('image')
    })

    test('categorizes .wav as audio', () => {
      expect(categorizeFile('.wav')).toBe('audio')
    })

    test('categorizes .ogg as audio', () => {
      expect(categorizeFile('.ogg')).toBe('audio')
    })

    test('categorizes .mp3 as audio', () => {
      expect(categorizeFile('.mp3')).toBe('audio')
    })

    test('categorizes .flac as audio', () => {
      expect(categorizeFile('.flac')).toBe('audio')
    })

    test('categorizes .aac as audio', () => {
      expect(categorizeFile('.aac')).toBe('audio')
    })

    test('categorizes .gd as script', () => {
      expect(categorizeFile('.gd')).toBe('script')
    })

    test('categorizes .gdshader as script', () => {
      expect(categorizeFile('.gdshader')).toBe('script')
    })

    test('categorizes .tscn as scene', () => {
      expect(categorizeFile('.tscn')).toBe('scene')
    })

    test('categorizes .tres as scene', () => {
      expect(categorizeFile('.tres')).toBe('scene')
    })

    test('categorizes .godot as scene', () => {
      expect(categorizeFile('.godot')).toBe('scene')
    })

    test('returns null for unknown extensions', () => {
      expect(categorizeFile('.txt')).toBeNull()
      expect(categorizeFile('.json')).toBeNull()
      expect(categorizeFile('.md')).toBeNull()
    })

    test('is case-insensitive', () => {
      expect(categorizeFile('.PNG')).toBe('image')
      expect(categorizeFile('.WAV')).toBe('audio')
      expect(categorizeFile('.GD')).toBe('script')
      expect(categorizeFile('.TSCN')).toBe('scene')
    })
  })

  describe('getAssetIcon', () => {
    test('returns image icon for image category', () => {
      expect(getAssetIcon('image')).toBe('\u{1F5BC}')
    })

    test('returns audio icon for audio category', () => {
      expect(getAssetIcon('audio')).toBe('\u{1F50A}')
    })

    test('returns script icon for script category', () => {
      expect(getAssetIcon('script')).toBe('\u{1F4DC}')
    })

    test('returns scene icon for scene category', () => {
      expect(getAssetIcon('scene')).toBe('\u{1F3AC}')
    })

    test('all categories return non-empty strings', () => {
      const categories: AssetEntry['category'][] = ['image', 'audio', 'script', 'scene']
      for (const cat of categories) {
        const icon = getAssetIcon(cat)
        expect(typeof icon).toBe('string')
        expect(icon.length).toBeGreaterThan(0)
      }
    })
  })

  describe('CATEGORY_LABELS', () => {
    test('all label is "All"', () => {
      expect(CATEGORY_LABELS.all).toBe('All')
    })

    test('image label is "Images"', () => {
      expect(CATEGORY_LABELS.image).toBe('Images')
    })

    test('audio label is "Audio"', () => {
      expect(CATEGORY_LABELS.audio).toBe('Audio')
    })

    test('script label is "Scripts"', () => {
      expect(CATEGORY_LABELS.script).toBe('Scripts')
    })

    test('scene label is "Scenes"', () => {
      expect(CATEGORY_LABELS.scene).toBe('Scenes')
    })

    test('all five categories have labels', () => {
      const cats: AssetCategory[] = ['all', 'image', 'audio', 'script', 'scene']
      for (const cat of cats) {
        expect(CATEGORY_LABELS[cat]).toBeDefined()
        expect(typeof CATEGORY_LABELS[cat]).toBe('string')
        expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0)
      }
    })
  })

  describe('AssetEntry type contract', () => {
    test('AssetEntry has required fields', () => {
      const entry: AssetEntry = {
        name: 'player.png',
        path: '/project/assets/player.png',
        extension: '.png',
        category: 'image',
      }
      expect(entry.name).toBe('player.png')
      expect(entry.path).toBe('/project/assets/player.png')
      expect(entry.extension).toBe('.png')
      expect(entry.category).toBe('image')
    })

    test('AssetEntry supports optional size field', () => {
      const entry: AssetEntry = {
        name: 'sound.wav',
        path: '/project/assets/sound.wav',
        extension: '.wav',
        category: 'audio',
        size: 1024,
      }
      expect(entry.size).toBe(1024)
    })
  })

  describe('file tree flattening logic', () => {
    test('extracts asset entries from flat file list', () => {
      const files: FileNode[] = [
        { name: 'player.png', path: '/p/player.png', isDirectory: false },
        { name: 'main.gd', path: '/p/main.gd', isDirectory: false },
        { name: 'readme.txt', path: '/p/readme.txt', isDirectory: false },
      ]

      const assets: AssetEntry[] = []
      for (const file of files) {
        const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
        const cat = categorizeFile(ext)
        if (cat) {
          assets.push({ name: file.name, path: file.path, extension: ext, category: cat })
        }
      }

      expect(assets).toHaveLength(2)
      expect(assets[0].category).toBe('image')
      expect(assets[1].category).toBe('script')
    })

    test('extracts assets from nested directories', () => {
      const files: FileNode[] = [
        {
          name: 'assets',
          path: '/p/assets',
          isDirectory: true,
          children: [
            { name: 'sprite.png', path: '/p/assets/sprite.png', isDirectory: false },
            {
              name: 'audio',
              path: '/p/assets/audio',
              isDirectory: true,
              children: [
                { name: 'jump.wav', path: '/p/assets/audio/jump.wav', isDirectory: false },
              ],
            },
          ],
        },
      ]

      const assets: AssetEntry[] = []
      function walk(nodes: FileNode[]) {
        for (const node of nodes) {
          if (node.isDirectory) {
            if (node.children) walk(node.children)
            continue
          }
          const ext = node.name.includes('.') ? `.${node.name.split('.').pop()}` : ''
          const cat = categorizeFile(ext)
          if (cat) {
            assets.push({ name: node.name, path: node.path, extension: ext, category: cat })
          }
        }
      }
      walk(files)

      expect(assets).toHaveLength(2)
      expect(assets[0].name).toBe('sprite.png')
      expect(assets[1].name).toBe('jump.wav')
    })

    test('skips files without recognized extensions', () => {
      const files: FileNode[] = [
        { name: 'project.godot', path: '/p/project.godot', isDirectory: false },
        { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
        { name: '.gitignore', path: '/p/.gitignore', isDirectory: false },
      ]

      const assets: AssetEntry[] = []
      for (const file of files) {
        const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
        const cat = categorizeFile(ext)
        if (cat) {
          assets.push({ name: file.name, path: file.path, extension: ext, category: cat })
        }
      }

      expect(assets).toHaveLength(1)
      expect(assets[0].name).toBe('project.godot')
    })
  })

  describe('category filtering logic', () => {
    const sampleAssets: AssetEntry[] = [
      { name: 'player.png', path: '/p/player.png', extension: '.png', category: 'image' },
      { name: 'jump.wav', path: '/p/jump.wav', extension: '.wav', category: 'audio' },
      { name: 'main.gd', path: '/p/main.gd', extension: '.gd', category: 'script' },
      { name: 'level.tscn', path: '/p/level.tscn', extension: '.tscn', category: 'scene' },
      { name: 'bg.jpg', path: '/p/bg.jpg', extension: '.jpg', category: 'image' },
    ]

    test('filter "all" returns all assets', () => {
      const active: AssetCategory = 'all'
      const filtered = active === 'all' ? sampleAssets : sampleAssets.filter((a) => a.category === active)
      expect(filtered).toHaveLength(5)
    })

    test('filter "image" returns only images', () => {
      const filtered = sampleAssets.filter((a) => a.category === 'image')
      expect(filtered).toHaveLength(2)
    })

    test('filter "audio" returns only audio', () => {
      const filtered = sampleAssets.filter((a) => a.category === 'audio')
      expect(filtered).toHaveLength(1)
    })

    test('filter "script" returns only scripts', () => {
      const filtered = sampleAssets.filter((a) => a.category === 'script')
      expect(filtered).toHaveLength(1)
    })

    test('filter "scene" returns only scenes', () => {
      const filtered = sampleAssets.filter((a) => a.category === 'scene')
      expect(filtered).toHaveLength(1)
    })

    test('category counts are computed correctly', () => {
      const counts: Record<AssetCategory, number> = { all: sampleAssets.length, image: 0, audio: 0, script: 0, scene: 0 }
      for (const a of sampleAssets) {
        counts[a.category]++
      }
      expect(counts.all).toBe(5)
      expect(counts.image).toBe(2)
      expect(counts.audio).toBe(1)
      expect(counts.script).toBe(1)
      expect(counts.scene).toBe(1)
    })
  })

  describe('search filtering logic', () => {
    const sampleAssets: AssetEntry[] = [
      { name: 'player_sprite.png', path: '/p/player_sprite.png', extension: '.png', category: 'image' },
      { name: 'enemy_sprite.png', path: '/p/enemy_sprite.png', extension: '.png', category: 'image' },
      { name: 'jump_sound.wav', path: '/p/jump_sound.wav', extension: '.wav', category: 'audio' },
    ]

    test('search filters by name substring (case-insensitive)', () => {
      const q = 'sprite'
      const filtered = sampleAssets.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
      expect(filtered).toHaveLength(2)
    })

    test('empty search returns all assets', () => {
      const q = ''
      const filtered = q.trim() ? sampleAssets.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())) : sampleAssets
      expect(filtered).toHaveLength(3)
    })

    test('search with no matches returns empty', () => {
      const q = 'nonexistent'
      const filtered = sampleAssets.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
      expect(filtered).toHaveLength(0)
    })

    test('search combined with category filter', () => {
      const q = 'sprite'
      const category: AssetCategory = 'image'
      let result = sampleAssets
      if (category !== 'all') result = result.filter((a) => a.category === category)
      result = result.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
      expect(result).toHaveLength(2)
    })
  })
})
