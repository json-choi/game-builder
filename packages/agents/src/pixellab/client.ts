export interface PixelLabConfig {
  apiKey?: string
}

export interface CharacterRequest {
  description: string
  name?: string
  size?: number // 16-128, default 48
  directions?: 4 | 8
  detail?: 'low detail' | 'medium detail' | 'high detail'
  bodyType?: 'humanoid' | 'quadruped'
  template?: string // for quadruped: bear, cat, dog, horse, lion
  view?: 'low top-down' | 'high top-down' | 'side'
  outline?: 'single color black outline' | 'single color outline' | 'selective outline' | 'lineless'
  shading?: 'flat shading' | 'basic shading' | 'medium shading' | 'detailed shading'
  proportions?: string // JSON string for humanoid body proportions
}

export interface CharacterCreateResult {
  characterId: string
  jobId: string
}

export interface AnimateResult {
  jobId: string
}

export interface TileRequest {
  description: string
  size?: number // 16-64, default 32
  shape?: 'thick tile' | 'thin tile' | 'block'
  detail?: 'low detail' | 'medium detail' | 'highly detailed'
  outline?: 'single color outline' | 'selective outline' | 'lineless'
  shading?: 'flat shading' | 'basic shading' | 'medium shading' | 'detailed shading' | 'highly detailed shading'
}

export interface TileCreateResult {
  tileId: string
}

export interface TilesetRequest {
  lowerDescription: string
  upperDescription: string
  transitionDescription?: string
  tileSize?: { width: number; height: number }
  transitionSize?: number // 0, 0.25, 0.5, or 1.0
  view?: 'low top-down' | 'high top-down'
  detail?: 'low detail' | 'medium detail' | 'highly detailed'
  outline?: 'single color outline' | 'selective outline' | 'lineless'
  shading?: 'flat shading' | 'basic shading' | 'medium shading' | 'detailed shading' | 'highly detailed shading'
}

export interface TilesetCreateResult {
  tilesetId: string
}

export interface SidescrollerTilesetRequest {
  lowerDescription: string
  transitionDescription: string
  tileSize?: { width: number; height: number }
  transitionSize?: number // 0, 0.25, 0.5
  detail?: 'low detail' | 'medium detail' | 'highly detailed'
  outline?: 'single color outline' | 'selective outline' | 'lineless'
  shading?: 'flat shading' | 'basic shading' | 'medium shading' | 'detailed shading' | 'highly detailed shading'
}

function logMcp(action: string, params: Record<string, unknown>): void {
  console.log(`[PixelLab MCP] would call ${action}`, params)
}

export async function createCharacter(request: CharacterRequest): Promise<CharacterCreateResult> {
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
}

export async function getCharacter(characterId: string): Promise<unknown> {
  logMcp('get_character', { character_id: characterId })
  return { characterId, status: 'placeholder', rotations: [], animations: [] }
}

export async function animateCharacter(
  characterId: string,
  templateAnimationId: string,
  options?: { actionDescription?: string; animationName?: string },
): Promise<AnimateResult> {
  logMcp('animate_character', {
    character_id: characterId,
    template_animation_id: templateAnimationId,
    action_description: options?.actionDescription,
    animation_name: options?.animationName,
  })
  return { jobId: 'placeholder-animation-job-id' }
}

export async function createIsometricTile(request: TileRequest): Promise<TileCreateResult> {
  logMcp('create_isometric_tile', {
    description: request.description,
    size: request.size ?? 32,
    tile_shape: request.shape ?? 'block',
    detail: request.detail,
    outline: request.outline,
    shading: request.shading,
  })
  return { tileId: 'placeholder-tile-id' }
}

export async function getIsometricTile(tileId: string): Promise<unknown> {
  logMcp('get_isometric_tile', { tile_id: tileId })
  return { tileId, status: 'placeholder' }
}

export async function createTopdownTileset(request: TilesetRequest): Promise<TilesetCreateResult> {
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
}

export async function getTopdownTileset(tilesetId: string): Promise<unknown> {
  logMcp('get_topdown_tileset', { tileset_id: tilesetId })
  return { tilesetId, status: 'placeholder' }
}

export async function createSidescrollerTileset(
  request: SidescrollerTilesetRequest,
): Promise<TilesetCreateResult> {
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
}

export async function getSidescrollerTileset(tilesetId: string): Promise<unknown> {
  logMcp('get_sidescroller_tileset', { tileset_id: tilesetId })
  return { tilesetId, status: 'placeholder' }
}
