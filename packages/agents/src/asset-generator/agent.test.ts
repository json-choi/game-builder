import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'

const mockCreateCharacter = mock(() =>
  Promise.resolve({ characterId: 'char-001', jobId: 'job-001' })
)
const mockCreateIsometricTile = mock(() =>
  Promise.resolve({ tileId: 'tile-001' })
)
const mockCreateTopdownTileset = mock(() =>
  Promise.resolve({ tilesetId: 'ts-001' })
)
const mockCreateSidescrollerTileset = mock(() =>
  Promise.resolve({ tilesetId: 'ss-001' })
)

mock.module('../pixellab/client', () => ({
  createCharacter: mockCreateCharacter,
  getCharacter: mock(() => Promise.resolve({})),
  animateCharacter: mock(() => Promise.resolve({ jobId: 'j1' })),
  createIsometricTile: mockCreateIsometricTile,
  getIsometricTile: mock(() => Promise.resolve({})),
  createTopdownTileset: mockCreateTopdownTileset,
  getTopdownTileset: mock(() => Promise.resolve({})),
  createSidescrollerTileset: mockCreateSidescrollerTileset,
  getSidescrollerTileset: mock(() => Promise.resolve({})),
}))

const { AssetGeneratorAgent } = await import('./agent')

describe('AssetGeneratorAgent', () => {
  const projectPath = '/tmp/test-game'

  beforeEach(() => {
    mockCreateCharacter.mockClear()
    mockCreateIsometricTile.mockClear()
    mockCreateTopdownTileset.mockClear()
    mockCreateSidescrollerTileset.mockClear()

    mockCreateCharacter.mockImplementation(() =>
      Promise.resolve({ characterId: 'char-001', jobId: 'job-001' })
    )
    mockCreateIsometricTile.mockImplementation(() =>
      Promise.resolve({ tileId: 'tile-001' })
    )
    mockCreateTopdownTileset.mockImplementation(() =>
      Promise.resolve({ tilesetId: 'ts-001' })
    )
    mockCreateSidescrollerTileset.mockImplementation(() =>
      Promise.resolve({ tilesetId: 'ss-001' })
    )
  })

  describe('system prompt', () => {
    test('has a system prompt defined', () => {
      const agent = new AssetGeneratorAgent()
      expect(typeof agent.systemPrompt).toBe('string')
      expect(agent.systemPrompt.length).toBeGreaterThan(0)
    })

    test('system prompt mentions PixelLab', () => {
      const agent = new AssetGeneratorAgent()
      expect(agent.systemPrompt).toContain('PixelLab')
    })

    test('system prompt covers all asset types', () => {
      const agent = new AssetGeneratorAgent()
      expect(agent.systemPrompt).toContain('Characters')
      expect(agent.systemPrompt).toContain('Isometric Tiles')
      expect(agent.systemPrompt).toContain('Top-down Tilesets')
      expect(agent.systemPrompt).toContain('Sidescroller Tilesets')
    })
  })

  describe('generateCharacter()', () => {
    test('returns successful AssetResult', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('a warrior knight', projectPath)

      expect(result.success).toBe(true)
      expect(result.assetType).toBe('character')
    })

    test('calls createCharacter with description', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateCharacter('a wizard with a staff', projectPath)

      expect(mockCreateCharacter).toHaveBeenCalledTimes(1)
      const args = mockCreateCharacter.mock.calls[0][0] as { description: string }
      expect(args.description).toBe('a wizard with a staff')
    })

    test('applies default options', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateCharacter('a hero', projectPath)

      const args = mockCreateCharacter.mock.calls[0][0] as Record<string, unknown>
      expect(args.size).toBe(48)
      expect(args.directions).toBe(8)
      expect(args.detail).toBe('medium detail')
      expect(args.bodyType).toBe('humanoid')
      expect(args.view).toBe('low top-down')
      expect(args.outline).toBe('single color black outline')
      expect(args.shading).toBe('basic shading')
    })

    test('passes custom options to createCharacter', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateCharacter('a cat', projectPath, {
        name: 'Felix',
        size: 32,
        directions: 4,
        detail: 'high detail',
        bodyType: 'quadruped',
        template: 'cat',
        view: 'side',
      })

      const args = mockCreateCharacter.mock.calls[0][0] as Record<string, unknown>
      expect(args.name).toBe('Felix')
      expect(args.size).toBe(32)
      expect(args.directions).toBe(4)
      expect(args.detail).toBe('high detail')
      expect(args.bodyType).toBe('quadruped')
      expect(args.template).toBe('cat')
      expect(args.view).toBe('side')
    })

    test('constructs asset path under assets/sprites/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('a warrior knight', projectPath)

      expect(result.assetPath).toBe(join(projectPath, 'assets', 'sprites', 'a_warrior_knight.png'))
    })

    test('metadata contains characterId and jobId', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('hero', projectPath)

      expect(result.metadata.characterId).toBe('char-001')
      expect(result.metadata.jobId).toBe('job-001')
    })

    test('metadata contains Godot resource path', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('hero', projectPath)

      expect(result.metadata.godotPath).toBe('res://assets/sprites/hero.png')
    })

    test('metadata includes description, size, and directions', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('a knight', projectPath, {
        size: 64,
        directions: 4,
      })

      expect(result.metadata.description).toBe('a knight')
      expect(result.metadata.size).toBe(64)
      expect(result.metadata.directions).toBe(4)
    })
  })

  describe('generateTileset() — topdown (default)', () => {
    test('returns successful AssetResult', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('forest floor', projectPath)

      expect(result.success).toBe(true)
      expect(result.assetType).toBe('tileset')
    })

    test('calls createTopdownTileset by default', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('grass terrain', projectPath)

      expect(mockCreateTopdownTileset).toHaveBeenCalledTimes(1)
      expect(mockCreateSidescrollerTileset).not.toHaveBeenCalled()
    })

    test('passes description as both lower and upper description by default', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('grass terrain', projectPath)

      const args = mockCreateTopdownTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.lowerDescription).toBe('grass terrain')
      expect(args.upperDescription).toBe('grass terrain')
    })

    test('applies default tile size', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('dirt', projectPath)

      const args = mockCreateTopdownTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.tileSize).toEqual({ width: 16, height: 16 })
      expect(args.transitionSize).toBe(0)
      expect(args.view).toBe('high top-down')
    })

    test('passes custom tileset options', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('ocean shore', projectPath, {
        lowerDescription: 'deep water',
        upperDescription: 'sandy beach',
        transitionDescription: 'shoreline',
        tileSize: { width: 32, height: 32 },
        transitionSize: 0.5,
        view: 'low top-down',
      })

      const args = mockCreateTopdownTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.lowerDescription).toBe('deep water')
      expect(args.upperDescription).toBe('sandy beach')
      expect(args.transitionDescription).toBe('shoreline')
      expect(args.tileSize).toEqual({ width: 32, height: 32 })
      expect(args.transitionSize).toBe(0.5)
      expect(args.view).toBe('low top-down')
    })

    test('constructs asset path under assets/tilesets/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('forest floor', projectPath)

      expect(result.assetPath).toBe(join(projectPath, 'assets', 'tilesets', 'forest_floor.png'))
    })

    test('metadata contains tilesetId and variant', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('grass', projectPath)

      expect(result.metadata.tilesetId).toBe('ts-001')
      expect(result.metadata.variant).toBe('topdown')
    })

    test('metadata contains Godot resource path', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('grass', projectPath)

      expect(result.metadata.godotPath).toBe('res://assets/tilesets/grass.png')
    })
  })

  describe('generateTileset() — sidescroller variant', () => {
    test('calls createSidescrollerTileset when variant is sidescroller', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('platform ground', projectPath, {
        variant: 'sidescroller',
      })

      expect(mockCreateSidescrollerTileset).toHaveBeenCalledTimes(1)
      expect(mockCreateTopdownTileset).not.toHaveBeenCalled()
    })

    test('passes description as lowerDescription by default', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('stone platform', projectPath, {
        variant: 'sidescroller',
      })

      const args = mockCreateSidescrollerTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.lowerDescription).toBe('stone platform')
    })

    test('defaults transitionDescription to grass', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('dirt', projectPath, {
        variant: 'sidescroller',
      })

      const args = mockCreateSidescrollerTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.transitionDescription).toBe('grass')
    })

    test('passes custom sidescroller options', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTileset('cave', projectPath, {
        variant: 'sidescroller',
        sidescrollerOptions: {
          lowerDescription: 'dark rock',
          transitionDescription: 'moss',
          tileSize: { width: 32, height: 32 },
          transitionSize: 0.25,
        },
      })

      const args = mockCreateSidescrollerTileset.mock.calls[0][0] as Record<string, unknown>
      expect(args.lowerDescription).toBe('dark rock')
      expect(args.transitionDescription).toBe('moss')
      expect(args.tileSize).toEqual({ width: 32, height: 32 })
      expect(args.transitionSize).toBe(0.25)
    })

    test('metadata shows sidescroller variant', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('platform', projectPath, {
        variant: 'sidescroller',
      })

      expect(result.metadata.variant).toBe('sidescroller')
      expect(result.metadata.tilesetId).toBe('ss-001')
    })

    test('constructs asset path under assets/tilesets/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('cave ground', projectPath, {
        variant: 'sidescroller',
      })

      expect(result.assetPath).toBe(join(projectPath, 'assets', 'tilesets', 'cave_ground.png'))
    })
  })

  describe('generateTile()', () => {
    test('returns successful AssetResult', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('grass block', projectPath)

      expect(result.success).toBe(true)
      expect(result.assetType).toBe('tile')
    })

    test('calls createIsometricTile', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTile('stone slab', projectPath)

      expect(mockCreateIsometricTile).toHaveBeenCalledTimes(1)
      const args = mockCreateIsometricTile.mock.calls[0][0] as { description: string }
      expect(args.description).toBe('stone slab')
    })

    test('applies default options', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTile('dirt', projectPath)

      const args = mockCreateIsometricTile.mock.calls[0][0] as Record<string, unknown>
      expect(args.size).toBe(32)
      expect(args.shape).toBe('block')
      expect(args.detail).toBe('medium detail')
      expect(args.outline).toBe('lineless')
      expect(args.shading).toBe('basic shading')
    })

    test('passes custom options', async () => {
      const agent = new AssetGeneratorAgent()
      await agent.generateTile('water tile', projectPath, {
        size: 64,
        shape: 'thin tile',
        detail: 'highly detailed',
        outline: 'selective outline',
        shading: 'detailed shading',
      })

      const args = mockCreateIsometricTile.mock.calls[0][0] as Record<string, unknown>
      expect(args.size).toBe(64)
      expect(args.shape).toBe('thin tile')
      expect(args.detail).toBe('highly detailed')
      expect(args.outline).toBe('selective outline')
      expect(args.shading).toBe('detailed shading')
    })

    test('constructs asset path under assets/tiles/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('grass block', projectPath)

      expect(result.assetPath).toBe(join(projectPath, 'assets', 'tiles', 'grass_block.png'))
    })

    test('metadata contains tileId', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('dirt', projectPath)

      expect(result.metadata.tileId).toBe('tile-001')
    })

    test('metadata contains Godot resource path', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('stone', projectPath)

      expect(result.metadata.godotPath).toBe('res://assets/tiles/stone.png')
    })

    test('metadata includes description, size, and shape', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('water', projectPath, {
        size: 64,
        shape: 'thin tile',
      })

      expect(result.metadata.description).toBe('water')
      expect(result.metadata.size).toBe(64)
      expect(result.metadata.shape).toBe('thin tile')
    })
  })

  describe('AssetResult interface', () => {
    test('result has correct shape (success, assetPath, assetType, metadata)', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('test', projectPath)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('assetPath')
      expect(result).toHaveProperty('assetType')
      expect(result).toHaveProperty('metadata')
      expect(typeof result.success).toBe('boolean')
      expect(typeof result.assetPath).toBe('string')
      expect(typeof result.assetType).toBe('string')
      expect(typeof result.metadata).toBe('object')
    })

    test('assetType is one of character, tileset, or tile', async () => {
      const agent = new AssetGeneratorAgent()

      const charResult = await agent.generateCharacter('test', projectPath)
      const tilesetResult = await agent.generateTileset('test', projectPath)
      const tileResult = await agent.generateTile('test', projectPath)

      expect(['character', 'tileset', 'tile']).toContain(charResult.assetType)
      expect(['character', 'tileset', 'tile']).toContain(tilesetResult.assetType)
      expect(['character', 'tileset', 'tile']).toContain(tileResult.assetType)
    })
  })

  describe('filename sanitization', () => {
    test('converts description to lowercase underscore filename', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('A Warrior Knight', projectPath)

      expect(result.assetPath).toContain('a_warrior_knight.png')
    })

    test('strips special characters', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('hero @#$% test!', projectPath)

      expect(result.assetPath).toContain('hero_test.png')
    })

    test('trims leading/trailing underscores', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('  spaces around  ', projectPath)

      expect(result.assetPath).toContain('spaces_around.png')
      const filename = result.assetPath.split('/').pop()!
      expect(filename.startsWith('_')).toBe(false)
    })

    test('truncates long descriptions to 64 characters', async () => {
      const agent = new AssetGeneratorAgent()
      const longDesc = 'a'.repeat(100)
      const result = await agent.generateCharacter(longDesc, projectPath)

      const filename = result.assetPath.split('/').pop()!.replace('.png', '')
      expect(filename.length).toBeLessThanOrEqual(64)
    })

    test('handles single word descriptions', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('grass', projectPath)

      expect(result.assetPath).toContain('grass.png')
    })
  })

  describe('Godot path integration', () => {
    test('character godotPath uses res://assets/sprites/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateCharacter('hero', projectPath)

      const godotPath = result.metadata.godotPath as string
      expect(godotPath).toMatch(/^res:\/\/assets\/sprites\//)
      expect(godotPath).toEndWith('.png')
    })

    test('tileset godotPath uses res://assets/tilesets/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTileset('grass', projectPath)

      const godotPath = result.metadata.godotPath as string
      expect(godotPath).toMatch(/^res:\/\/assets\/tilesets\//)
      expect(godotPath).toEndWith('.png')
    })

    test('tile godotPath uses res://assets/tiles/', async () => {
      const agent = new AssetGeneratorAgent()
      const result = await agent.generateTile('stone', projectPath)

      const godotPath = result.metadata.godotPath as string
      expect(godotPath).toMatch(/^res:\/\/assets\/tiles\//)
      expect(godotPath).toEndWith('.png')
    })

    test('assetPath is relative to projectPath', async () => {
      const agent = new AssetGeneratorAgent()
      const customPath = '/home/user/my-game'
      const result = await agent.generateCharacter('hero', customPath)

      expect(result.assetPath.startsWith(customPath)).toBe(true)
    })
  })
})
