import { join } from 'path'
import {
  createCharacter,
  createIsometricTile,
  createTopdownTileset,
  createSidescrollerTileset,
  type CharacterRequest,
  type TileRequest,
  type TilesetRequest,
  type SidescrollerTilesetRequest,
} from '../pixellab/client'
import { ASSET_GENERATOR_SYSTEM_PROMPT } from './system-prompt'

export interface AssetResult {
  success: boolean
  assetPath: string
  assetType: 'character' | 'tileset' | 'tile'
  metadata: Record<string, unknown>
}

export interface AssetGeneratorEvent {
  type: 'generating' | 'polling' | 'saving' | 'complete' | 'error'
  message: string
  assetType?: string
}

export class AssetGeneratorAgent {
  readonly systemPrompt = ASSET_GENERATOR_SYSTEM_PROMPT

  async generateCharacter(
    description: string,
    projectPath: string,
    options?: Partial<CharacterRequest>,
  ): Promise<AssetResult> {
    const request: CharacterRequest = {
      description,
      name: options?.name,
      size: options?.size ?? 48,
      directions: options?.directions ?? 8,
      detail: options?.detail ?? 'medium detail',
      bodyType: options?.bodyType ?? 'humanoid',
      template: options?.template,
      view: options?.view ?? 'low top-down',
      outline: options?.outline ?? 'single color black outline',
      shading: options?.shading ?? 'basic shading',
    }

    const result = await createCharacter(request)
    const filename = sanitizeFilename(description)
    const assetPath = join('assets', 'sprites', `${filename}.png`)

    return {
      success: true,
      assetPath: join(projectPath, assetPath),
      assetType: 'character',
      metadata: {
        characterId: result.characterId,
        jobId: result.jobId,
        godotPath: `res://${assetPath}`,
        description,
        size: request.size,
        directions: request.directions,
      },
    }
  }

  async generateTileset(
    description: string,
    projectPath: string,
    options?: Partial<TilesetRequest> & { variant?: 'topdown' | 'sidescroller'; sidescrollerOptions?: Partial<SidescrollerTilesetRequest> },
  ): Promise<AssetResult> {
    const filename = sanitizeFilename(description)
    const assetPath = join('assets', 'tilesets', `${filename}.png`)

    if (options?.variant === 'sidescroller') {
      const request: SidescrollerTilesetRequest = {
        lowerDescription: options.sidescrollerOptions?.lowerDescription ?? description,
        transitionDescription: options.sidescrollerOptions?.transitionDescription ?? 'grass',
        tileSize: options.sidescrollerOptions?.tileSize ?? options.tileSize ?? { width: 16, height: 16 },
        transitionSize: options.sidescrollerOptions?.transitionSize ?? options.transitionSize ?? 0,
      }

      const result = await createSidescrollerTileset(request)

      return {
        success: true,
        assetPath: join(projectPath, assetPath),
        assetType: 'tileset',
        metadata: {
          tilesetId: result.tilesetId,
          godotPath: `res://${assetPath}`,
          variant: 'sidescroller',
          description,
        },
      }
    }

    const request: TilesetRequest = {
      lowerDescription: options?.lowerDescription ?? description,
      upperDescription: options?.upperDescription ?? description,
      transitionDescription: options?.transitionDescription,
      tileSize: options?.tileSize ?? { width: 16, height: 16 },
      transitionSize: options?.transitionSize ?? 0,
      view: options?.view ?? 'high top-down',
    }

    const result = await createTopdownTileset(request)

    return {
      success: true,
      assetPath: join(projectPath, assetPath),
      assetType: 'tileset',
      metadata: {
        tilesetId: result.tilesetId,
        godotPath: `res://${assetPath}`,
        variant: 'topdown',
        description,
      },
    }
  }

  async generateTile(
    description: string,
    projectPath: string,
    options?: Partial<TileRequest>,
  ): Promise<AssetResult> {
    const request: TileRequest = {
      description,
      size: options?.size ?? 32,
      shape: options?.shape ?? 'block',
      detail: options?.detail ?? 'medium detail',
      outline: options?.outline ?? 'lineless',
      shading: options?.shading ?? 'basic shading',
    }

    const result = await createIsometricTile(request)
    const filename = sanitizeFilename(description)
    const assetPath = join('assets', 'tiles', `${filename}.png`)

    return {
      success: true,
      assetPath: join(projectPath, assetPath),
      assetType: 'tile',
      metadata: {
        tileId: result.tileId,
        godotPath: `res://${assetPath}`,
        description,
        size: request.size,
        shape: request.shape,
      },
    }
  }
}

function sanitizeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}
