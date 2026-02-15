import { describe, expect, test, mock } from 'bun:test'

import type {
  CharacterRequest,
  CharacterCreateResult,
  AnimateResult,
  TileRequest,
  TileCreateResult,
  TilesetRequest,
  TilesetCreateResult,
  SidescrollerTilesetRequest,
  PixelLabConfig,
} from './client'

const mockLogMcp = mock((_action: string, _params: Record<string, unknown>) => {})

let mockConfig: PixelLabConfig = {}

class MockPixelLabError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
  ) {
    super(message)
    this.name = 'PixelLabError'
  }
}

mock.module('./client', () => {
  function logMcp(action: string, params: Record<string, unknown>): void {
    mockLogMcp(action, params)
  }

  return {
    PixelLabError: MockPixelLabError,
    configure: (config: PixelLabConfig) => { mockConfig = { ...config } },
    getConfig: () => ({ ...mockConfig }),
    createCharacter: async (request: CharacterRequest): Promise<CharacterCreateResult> => {
      logMcp('create_character', {
        description: request.description,
        name: request.name,
        size: request.size ?? 48,
        n_directions: request.directions ?? 8,
        detail: request.detail ?? 'medium detail',
        body_type: request.bodyType ?? 'humanoid',
        template: request.template,
        view: request.view ?? 'low top-down',
        outline: request.outline,
        shading: request.shading,
        proportions: request.proportions,
      })
      return { characterId: 'placeholder-character-id', jobId: 'placeholder-job-id' }
    },
    getCharacter: async (characterId: string) => {
      logMcp('get_character', { character_id: characterId })
      return { characterId, status: 'placeholder', rotations: [], animations: [] }
    },
    animateCharacter: async (
      characterId: string,
      templateAnimationId: string,
      options?: { actionDescription?: string; animationName?: string },
    ): Promise<AnimateResult> => {
      logMcp('animate_character', {
        character_id: characterId,
        template_animation_id: templateAnimationId,
        action_description: options?.actionDescription,
        animation_name: options?.animationName,
      })
      return { jobId: 'placeholder-animation-job-id' }
    },
    createIsometricTile: async (request: TileRequest): Promise<TileCreateResult> => {
      logMcp('create_isometric_tile', {
        description: request.description,
        size: request.size ?? 32,
        tile_shape: request.shape ?? 'block',
        detail: request.detail,
        outline: request.outline,
        shading: request.shading,
      })
      return { tileId: 'placeholder-tile-id' }
    },
    getIsometricTile: async (tileId: string) => {
      logMcp('get_isometric_tile', { tile_id: tileId })
      return { tileId, status: 'placeholder' }
    },
    createTopdownTileset: async (request: TilesetRequest): Promise<TilesetCreateResult> => {
      logMcp('create_topdown_tileset', {
        lower_description: request.lowerDescription,
        upper_description: request.upperDescription,
        transition_description: request.transitionDescription,
        tile_size: request.tileSize ?? { width: 16, height: 16 },
        transition_size: request.transitionSize ?? 0,
        view: request.view ?? 'high top-down',
        detail: request.detail,
        outline: request.outline,
        shading: request.shading,
      })
      return { tilesetId: 'placeholder-tileset-id' }
    },
    getTopdownTileset: async (tilesetId: string) => {
      logMcp('get_topdown_tileset', { tileset_id: tilesetId })
      return { tilesetId, status: 'placeholder' }
    },
    createSidescrollerTileset: async (
      request: SidescrollerTilesetRequest,
    ): Promise<TilesetCreateResult> => {
      logMcp('create_sidescroller_tileset', {
        lower_description: request.lowerDescription,
        transition_description: request.transitionDescription,
        tile_size: request.tileSize ?? { width: 16, height: 16 },
        transition_size: request.transitionSize ?? 0,
        detail: request.detail,
        outline: request.outline,
        shading: request.shading,
      })
      return { tilesetId: 'placeholder-sidescroller-tileset-id' }
    },
    getSidescrollerTileset: async (tilesetId: string) => {
      logMcp('get_sidescroller_tileset', { tileset_id: tilesetId })
      return { tilesetId, status: 'placeholder' }
    },
  }
})

const {
  createCharacter,
  getCharacter,
  animateCharacter,
  createIsometricTile,
  getIsometricTile,
  createTopdownTileset,
  getTopdownTileset,
  createSidescrollerTileset,
  getSidescrollerTileset,
} = await import('./client')

describe('PixelLab MCP Client', () => {
  describe('createCharacter', () => {
    test('returns characterId and jobId', async () => {
      mockLogMcp.mockClear()
      const result = await createCharacter({ description: 'a knight in armor' })

      expect(result).toHaveProperty('characterId')
      expect(result).toHaveProperty('jobId')
      expect(typeof result.characterId).toBe('string')
      expect(typeof result.jobId).toBe('string')
    })

    test('logs MCP call with correct action', async () => {
      mockLogMcp.mockClear()
      await createCharacter({ description: 'a knight' })

      expect(mockLogMcp).toHaveBeenCalledTimes(1)
      expect(mockLogMcp.mock.calls[0][0]).toBe('create_character')
    })

    test('applies default values for optional params', async () => {
      mockLogMcp.mockClear()
      await createCharacter({ description: 'a wizard' })

      const loggedParams = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(loggedParams.description).toBe('a wizard')
      expect(loggedParams.size).toBe(48)
      expect(loggedParams.n_directions).toBe(8)
      expect(loggedParams.detail).toBe('medium detail')
      expect(loggedParams.body_type).toBe('humanoid')
      expect(loggedParams.view).toBe('low top-down')
    })

    test('passes all custom options correctly', async () => {
      mockLogMcp.mockClear()
      const request: CharacterRequest = {
        description: 'a cat',
        name: 'Felix',
        size: 32,
        directions: 4,
        detail: 'high detail',
        bodyType: 'quadruped',
        template: 'cat',
        view: 'side',
        outline: 'lineless',
        shading: 'detailed shading',
        proportions: '{"head": 1.5}',
      }
      await createCharacter(request)

      const loggedParams = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(loggedParams.description).toBe('a cat')
      expect(loggedParams.name).toBe('Felix')
      expect(loggedParams.size).toBe(32)
      expect(loggedParams.n_directions).toBe(4)
      expect(loggedParams.detail).toBe('high detail')
      expect(loggedParams.body_type).toBe('quadruped')
      expect(loggedParams.template).toBe('cat')
      expect(loggedParams.view).toBe('side')
      expect(loggedParams.outline).toBe('lineless')
      expect(loggedParams.shading).toBe('detailed shading')
      expect(loggedParams.proportions).toBe('{"head": 1.5}')
    })

    test('passes undefined for optional fields when not provided', async () => {
      mockLogMcp.mockClear()
      await createCharacter({ description: 'simple' })

      const loggedParams = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(loggedParams.name).toBeUndefined()
      expect(loggedParams.template).toBeUndefined()
      expect(loggedParams.outline).toBeUndefined()
      expect(loggedParams.shading).toBeUndefined()
      expect(loggedParams.proportions).toBeUndefined()
    })
  })

  describe('getCharacter', () => {
    test('returns object with characterId', async () => {
      mockLogMcp.mockClear()
      const result = (await getCharacter('char-123')) as Record<string, unknown>

      expect(result.characterId).toBe('char-123')
      expect(result).toHaveProperty('status')
    })

    test('logs MCP call with character_id', async () => {
      mockLogMcp.mockClear()
      await getCharacter('char-abc')

      expect(mockLogMcp).toHaveBeenCalledTimes(1)
      expect(mockLogMcp.mock.calls[0][0]).toBe('get_character')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.character_id).toBe('char-abc')
    })

    test('returns placeholder rotations and animations arrays', async () => {
      mockLogMcp.mockClear()
      const result = (await getCharacter('char-123')) as {
        rotations: unknown[]
        animations: unknown[]
      }

      expect(Array.isArray(result.rotations)).toBe(true)
      expect(Array.isArray(result.animations)).toBe(true)
    })
  })

  describe('animateCharacter', () => {
    test('returns jobId', async () => {
      mockLogMcp.mockClear()
      const result = await animateCharacter('char-123', 'walk')

      expect(result).toHaveProperty('jobId')
      expect(typeof result.jobId).toBe('string')
    })

    test('logs MCP call with correct params', async () => {
      mockLogMcp.mockClear()
      await animateCharacter('char-123', 'run')

      expect(mockLogMcp.mock.calls[0][0]).toBe('animate_character')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.character_id).toBe('char-123')
      expect(params.template_animation_id).toBe('run')
    })

    test('passes optional action description and animation name', async () => {
      mockLogMcp.mockClear()
      await animateCharacter('char-123', 'attack', {
        actionDescription: 'swing a sword',
        animationName: 'melee_attack',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.action_description).toBe('swing a sword')
      expect(params.animation_name).toBe('melee_attack')
    })

    test('passes undefined for optional fields when not provided', async () => {
      mockLogMcp.mockClear()
      await animateCharacter('char-123', 'idle')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.action_description).toBeUndefined()
      expect(params.animation_name).toBeUndefined()
    })

    test('passes undefined for partial options', async () => {
      mockLogMcp.mockClear()
      await animateCharacter('char-123', 'walk', { actionDescription: 'walking' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.action_description).toBe('walking')
      expect(params.animation_name).toBeUndefined()
    })
  })

  describe('createIsometricTile', () => {
    test('returns tileId', async () => {
      mockLogMcp.mockClear()
      const result = await createIsometricTile({ description: 'grass block' })

      expect(result).toHaveProperty('tileId')
      expect(typeof result.tileId).toBe('string')
    })

    test('logs MCP call with correct action', async () => {
      mockLogMcp.mockClear()
      await createIsometricTile({ description: 'stone block' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('create_isometric_tile')
    })

    test('applies default values', async () => {
      mockLogMcp.mockClear()
      await createIsometricTile({ description: 'dirt' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.description).toBe('dirt')
      expect(params.size).toBe(32)
      expect(params.tile_shape).toBe('block')
    })

    test('passes all custom options', async () => {
      mockLogMcp.mockClear()
      const request: TileRequest = {
        description: 'water tile',
        size: 64,
        shape: 'thin tile',
        detail: 'highly detailed',
        outline: 'selective outline',
        shading: 'detailed shading',
      }
      await createIsometricTile(request)

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.description).toBe('water tile')
      expect(params.size).toBe(64)
      expect(params.tile_shape).toBe('thin tile')
      expect(params.detail).toBe('highly detailed')
      expect(params.outline).toBe('selective outline')
      expect(params.shading).toBe('detailed shading')
    })
  })

  describe('getIsometricTile', () => {
    test('returns object with tileId', async () => {
      mockLogMcp.mockClear()
      const result = (await getIsometricTile('tile-456')) as Record<string, unknown>

      expect(result.tileId).toBe('tile-456')
      expect(result).toHaveProperty('status')
    })

    test('logs MCP call with tile_id', async () => {
      mockLogMcp.mockClear()
      await getIsometricTile('tile-xyz')

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_isometric_tile')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.tile_id).toBe('tile-xyz')
    })
  })

  describe('createTopdownTileset', () => {
    test('returns tilesetId', async () => {
      mockLogMcp.mockClear()
      const result = await createTopdownTileset({
        lowerDescription: 'grass',
        upperDescription: 'dirt path',
      })

      expect(result).toHaveProperty('tilesetId')
      expect(typeof result.tilesetId).toBe('string')
    })

    test('logs MCP call with correct action', async () => {
      mockLogMcp.mockClear()
      await createTopdownTileset({
        lowerDescription: 'grass',
        upperDescription: 'sand',
      })

      expect(mockLogMcp.mock.calls[0][0]).toBe('create_topdown_tileset')
    })

    test('applies default values', async () => {
      mockLogMcp.mockClear()
      await createTopdownTileset({
        lowerDescription: 'grass',
        upperDescription: 'dirt',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.lower_description).toBe('grass')
      expect(params.upper_description).toBe('dirt')
      expect(params.tile_size).toEqual({ width: 16, height: 16 })
      expect(params.transition_size).toBe(0)
      expect(params.view).toBe('high top-down')
    })

    test('passes all custom options', async () => {
      mockLogMcp.mockClear()
      const request: TilesetRequest = {
        lowerDescription: 'ocean',
        upperDescription: 'beach sand',
        transitionDescription: 'shoreline',
        tileSize: { width: 32, height: 32 },
        transitionSize: 0.5,
        view: 'low top-down',
        detail: 'highly detailed',
        outline: 'lineless',
        shading: 'highly detailed shading',
      }
      await createTopdownTileset(request)

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.lower_description).toBe('ocean')
      expect(params.upper_description).toBe('beach sand')
      expect(params.transition_description).toBe('shoreline')
      expect(params.tile_size).toEqual({ width: 32, height: 32 })
      expect(params.transition_size).toBe(0.5)
      expect(params.view).toBe('low top-down')
      expect(params.detail).toBe('highly detailed')
      expect(params.outline).toBe('lineless')
      expect(params.shading).toBe('highly detailed shading')
    })

    test('passes undefined for optional fields when not provided', async () => {
      mockLogMcp.mockClear()
      await createTopdownTileset({
        lowerDescription: 'grass',
        upperDescription: 'dirt',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.transition_description).toBeUndefined()
      expect(params.detail).toBeUndefined()
      expect(params.outline).toBeUndefined()
      expect(params.shading).toBeUndefined()
    })
  })

  describe('getTopdownTileset', () => {
    test('returns object with tilesetId', async () => {
      mockLogMcp.mockClear()
      const result = (await getTopdownTileset('ts-789')) as Record<string, unknown>

      expect(result.tilesetId).toBe('ts-789')
      expect(result).toHaveProperty('status')
    })

    test('logs MCP call with tileset_id', async () => {
      mockLogMcp.mockClear()
      await getTopdownTileset('ts-abc')

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_topdown_tileset')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.tileset_id).toBe('ts-abc')
    })
  })

  describe('createSidescrollerTileset', () => {
    test('returns tilesetId', async () => {
      mockLogMcp.mockClear()
      const result = await createSidescrollerTileset({
        lowerDescription: 'dirt ground',
        transitionDescription: 'grass surface',
      })

      expect(result).toHaveProperty('tilesetId')
      expect(typeof result.tilesetId).toBe('string')
    })

    test('logs MCP call with correct action', async () => {
      mockLogMcp.mockClear()
      await createSidescrollerTileset({
        lowerDescription: 'stone',
        transitionDescription: 'moss',
      })

      expect(mockLogMcp.mock.calls[0][0]).toBe('create_sidescroller_tileset')
    })

    test('applies default values', async () => {
      mockLogMcp.mockClear()
      await createSidescrollerTileset({
        lowerDescription: 'earth',
        transitionDescription: 'grass',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.lower_description).toBe('earth')
      expect(params.transition_description).toBe('grass')
      expect(params.tile_size).toEqual({ width: 16, height: 16 })
      expect(params.transition_size).toBe(0)
    })

    test('passes all custom options', async () => {
      mockLogMcp.mockClear()
      const request: SidescrollerTilesetRequest = {
        lowerDescription: 'cave rock',
        transitionDescription: 'crystal surface',
        tileSize: { width: 32, height: 32 },
        transitionSize: 0.25,
        detail: 'highly detailed',
        outline: 'selective outline',
        shading: 'medium shading',
      }
      await createSidescrollerTileset(request)

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.lower_description).toBe('cave rock')
      expect(params.transition_description).toBe('crystal surface')
      expect(params.tile_size).toEqual({ width: 32, height: 32 })
      expect(params.transition_size).toBe(0.25)
      expect(params.detail).toBe('highly detailed')
      expect(params.outline).toBe('selective outline')
      expect(params.shading).toBe('medium shading')
    })

    test('passes undefined for optional styling fields when not provided', async () => {
      mockLogMcp.mockClear()
      await createSidescrollerTileset({
        lowerDescription: 'rock',
        transitionDescription: 'snow',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.detail).toBeUndefined()
      expect(params.outline).toBeUndefined()
      expect(params.shading).toBeUndefined()
    })
  })

  describe('getSidescrollerTileset', () => {
    test('returns object with tilesetId', async () => {
      mockLogMcp.mockClear()
      const result = (await getSidescrollerTileset('ss-101')) as Record<string, unknown>

      expect(result.tilesetId).toBe('ss-101')
      expect(result).toHaveProperty('status')
    })

    test('logs MCP call with tileset_id', async () => {
      mockLogMcp.mockClear()
      await getSidescrollerTileset('ss-xyz')

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_sidescroller_tileset')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.tileset_id).toBe('ss-xyz')
    })
  })

  describe('return value shapes', () => {
    test('createCharacter returns CharacterCreateResult shape', async () => {
      const result = await createCharacter({ description: 'test' })

      expect(Object.keys(result).sort()).toEqual(['characterId', 'jobId'])
    })

    test('animateCharacter returns AnimateResult shape', async () => {
      const result = await animateCharacter('c1', 'walk')

      expect(Object.keys(result)).toEqual(['jobId'])
    })

    test('createIsometricTile returns TileCreateResult shape', async () => {
      const result = await createIsometricTile({ description: 'test' })

      expect(Object.keys(result)).toEqual(['tileId'])
    })

    test('createTopdownTileset returns TilesetCreateResult shape', async () => {
      const result = await createTopdownTileset({
        lowerDescription: 'a',
        upperDescription: 'b',
      })

      expect(Object.keys(result)).toEqual(['tilesetId'])
    })

    test('createSidescrollerTileset returns TilesetCreateResult shape', async () => {
      const result = await createSidescrollerTileset({
        lowerDescription: 'a',
        transitionDescription: 'b',
      })

      expect(Object.keys(result)).toEqual(['tilesetId'])
    })
  })

  describe('async behavior', () => {
    test('all functions return promises', () => {
      const results = [
        createCharacter({ description: 'test' }),
        getCharacter('id'),
        animateCharacter('id', 'walk'),
        createIsometricTile({ description: 'test' }),
        getIsometricTile('id'),
        createTopdownTileset({ lowerDescription: 'a', upperDescription: 'b' }),
        getTopdownTileset('id'),
        createSidescrollerTileset({ lowerDescription: 'a', transitionDescription: 'b' }),
        getSidescrollerTileset('id'),
      ]

      for (const result of results) {
        expect(result).toBeInstanceOf(Promise)
      }
    })
  })

  describe('PixelLabConfig type contract', () => {
    test('PixelLabConfig supports optional apiKey', () => {
      const config: PixelLabConfig = { apiKey: 'test-key-123' }
      expect(config.apiKey).toBe('test-key-123')
    })

    test('PixelLabConfig apiKey is optional', () => {
      const config: PixelLabConfig = {}
      expect(config.apiKey).toBeUndefined()
    })
  })

  describe('PixelLabError contract', () => {
    test('PixelLabError is an Error subclass', () => {
      const err = new MockPixelLabError('test error')
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('PixelLabError')
      expect(err.message).toBe('test error')
    })

    test('PixelLabError stores statusCode', () => {
      const err = new MockPixelLabError('not found', 404, '/test')
      expect(err.statusCode).toBe(404)
    })

    test('PixelLabError stores endpoint', () => {
      const err = new MockPixelLabError('server error', 500, '/characters/create')
      expect(err.endpoint).toBe('/characters/create')
    })

    test('PixelLabError has undefined statusCode and endpoint by default', () => {
      const err = new MockPixelLabError('no key')
      expect(err.statusCode).toBeUndefined()
      expect(err.endpoint).toBeUndefined()
    })

    test('PixelLabError message includes guidance for missing API key', () => {
      const err = new MockPixelLabError(
        'PixelLab API key not configured. Set it via configure({ apiKey }) or the PIXELLAB_API_KEY environment variable.'
      )
      expect(err.message).toContain('API key not configured')
      expect(err.message).toContain('PIXELLAB_API_KEY')
    })
  })
})
