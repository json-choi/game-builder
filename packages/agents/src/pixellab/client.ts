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

const PIXELLAB_API_BASE = 'https://api.pixellab.ai/v1'

let _config: PixelLabConfig = {}

export function configure(config: PixelLabConfig): void {
  _config = { ...config }
}

export function getConfig(): PixelLabConfig {
  return { ..._config }
}

export class PixelLabError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
  ) {
    super(message)
    this.name = 'PixelLabError'
  }
}

function getApiKey(): string | null {
  return _config.apiKey || process.env.PIXELLAB_API_KEY || null
}

function logMcp(action: string, params: Record<string, unknown>): void {
  console.log(`[PixelLab MCP] ${action}`, params)
}

async function apiRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new PixelLabError(
      'PixelLab API key not configured. Set it via configure({ apiKey }) or the PIXELLAB_API_KEY environment variable.',
      undefined,
      endpoint,
    )
  }

  const url = `${PIXELLAB_API_BASE}${endpoint}`
  logMcp(endpoint, body)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new PixelLabError(
      `PixelLab API error (${response.status}): ${errorText}`,
      response.status,
      endpoint,
    )
  }

  return response.json() as Promise<T>
}

async function apiGet<T>(endpoint: string): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new PixelLabError(
      'PixelLab API key not configured. Set it via configure({ apiKey }) or the PIXELLAB_API_KEY environment variable.',
      undefined,
      endpoint,
    )
  }

  const url = `${PIXELLAB_API_BASE}${endpoint}`
  logMcp(`GET ${endpoint}`, {})

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new PixelLabError(
      `PixelLab API error (${response.status}): ${errorText}`,
      response.status,
      endpoint,
    )
  }

  return response.json() as Promise<T>
}

export async function createCharacter(request: CharacterRequest): Promise<CharacterCreateResult> {
  const body: Record<string, unknown> = {
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
  }

  return apiRequest<CharacterCreateResult>('/characters/create', body)
}

export async function getCharacter(characterId: string): Promise<unknown> {
  return apiGet(`/characters/${characterId}`)
}

export async function animateCharacter(
  characterId: string,
  templateAnimationId: string,
  options?: { actionDescription?: string; animationName?: string },
): Promise<AnimateResult> {
  const body: Record<string, unknown> = {
    character_id: characterId,
    template_animation_id: templateAnimationId,
    action_description: options?.actionDescription,
    animation_name: options?.animationName,
  }

  return apiRequest<AnimateResult>('/characters/animate', body)
}

export async function createIsometricTile(request: TileRequest): Promise<TileCreateResult> {
  const body: Record<string, unknown> = {
    description: request.description,
    size: request.size ?? 32,
    tile_shape: request.shape ?? 'block',
    detail: request.detail,
    outline: request.outline,
    shading: request.shading,
  }

  return apiRequest<TileCreateResult>('/tiles/isometric/create', body)
}

export async function getIsometricTile(tileId: string): Promise<unknown> {
  return apiGet(`/tiles/isometric/${tileId}`)
}

export async function createTopdownTileset(request: TilesetRequest): Promise<TilesetCreateResult> {
  const body: Record<string, unknown> = {
    lower_description: request.lowerDescription,
    upper_description: request.upperDescription,
    transition_description: request.transitionDescription,
    tile_size: request.tileSize ?? { width: 16, height: 16 },
    transition_size: request.transitionSize ?? 0,
    view: request.view ?? 'high top-down',
    detail: request.detail,
    outline: request.outline,
    shading: request.shading,
  }

  return apiRequest<TilesetCreateResult>('/tilesets/topdown/create', body)
}

export async function getTopdownTileset(tilesetId: string): Promise<unknown> {
  return apiGet(`/tilesets/topdown/${tilesetId}`)
}

export async function createSidescrollerTileset(
  request: SidescrollerTilesetRequest,
): Promise<TilesetCreateResult> {
  const body: Record<string, unknown> = {
    lower_description: request.lowerDescription,
    transition_description: request.transitionDescription,
    tile_size: request.tileSize ?? { width: 16, height: 16 },
    transition_size: request.transitionSize ?? 0,
    detail: request.detail,
    outline: request.outline,
    shading: request.shading,
  }

  return apiRequest<TilesetCreateResult>('/tilesets/sidescroller/create', body)
}

export async function getSidescrollerTileset(tilesetId: string): Promise<unknown> {
  return apiGet(`/tilesets/sidescroller/${tilesetId}`)
}
