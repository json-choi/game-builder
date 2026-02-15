import React, { useState, useCallback, useEffect, useMemo } from 'react'

export type AssetCategory = 'all' | 'image' | 'audio' | 'script' | 'scene'

export interface AssetEntry {
  name: string
  path: string
  extension: string
  category: Exclude<AssetCategory, 'all'>
  size?: number
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.bmp', '.gif'])
const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3', '.flac', '.aac'])
const SCRIPT_EXTENSIONS = new Set(['.gd', '.gdshader', '.gdnative'])
const SCENE_EXTENSIONS = new Set(['.tscn', '.tres', '.godot'])

export function categorizeFile(ext: string): AssetEntry['category'] | null {
  const lower = ext.toLowerCase()
  if (IMAGE_EXTENSIONS.has(lower)) return 'image'
  if (AUDIO_EXTENSIONS.has(lower)) return 'audio'
  if (SCRIPT_EXTENSIONS.has(lower)) return 'script'
  if (SCENE_EXTENSIONS.has(lower)) return 'scene'
  return null
}

export function getAssetIcon(category: AssetEntry['category']): string {
  switch (category) {
    case 'image': return '\u{1F5BC}'
    case 'audio': return '\u{1F50A}'
    case 'script': return '\u{1F4DC}'
    case 'scene': return '\u{1F3AC}'
    default: return '\u{1F4C4}'
  }
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  all: 'All',
  image: 'Images',
  audio: 'Audio',
  script: 'Scripts',
  scene: 'Scenes',
}

function flattenFileTree(nodes: FileNode[]): AssetEntry[] {
  const assets: AssetEntry[] = []

  function walk(nodeList: FileNode[]): void {
    for (const node of nodeList) {
      if (node.isDirectory) {
        if (node.children) walk(node.children)
        continue
      }
      const ext = node.name.includes('.') ? `.${node.name.split('.').pop()}` : ''
      const category = categorizeFile(ext)
      if (category) {
        assets.push({
          name: node.name,
          path: node.path,
          extension: ext,
          category,
        })
      }
    }
  }

  walk(nodes)
  return assets.sort((a, b) => a.name.localeCompare(b.name))
}

interface AssetLibraryProps {
  projectPath?: string | null
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ projectPath }) => {
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadAssets = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const tree = await window.api.project.listFiles(path)
      const flatAssets = flattenFileTree(tree)
      setAssets(flatAssets)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (projectPath) {
      loadAssets(projectPath)
    }
  }, [projectPath, loadAssets])

  const filteredAssets = useMemo(() => {
    let result = assets
    if (activeCategory !== 'all') {
      result = result.filter((a) => a.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }
    return result
  }, [assets, activeCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<AssetCategory, number> = { all: assets.length, image: 0, audio: 0, script: 0, scene: 0 }
    for (const a of assets) {
      counts[a.category]++
    }
    return counts
  }, [assets])

  if (!projectPath) {
    return (
      <div className="asset-library">
        <div className="asset-library__empty">No project open</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="asset-library">
        <div className="asset-library__header">
          <span className="asset-library__title">ASSETS</span>
        </div>
        <div className="asset-library__empty">Scanning assets...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="asset-library">
        <div className="asset-library__header">
          <span className="asset-library__title">ASSETS</span>
        </div>
        <div className="asset-library__empty">{error}</div>
      </div>
    )
  }

  return (
    <div className="asset-library">
      <div className="asset-library__header">
        <span className="asset-library__title">ASSETS</span>
        <span className="asset-library__count">{filteredAssets.length}</span>
      </div>

      <div className="asset-library__search">
        <input
          type="text"
          className="asset-library__search-input"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="asset-library__categories">
        {(Object.keys(CATEGORY_LABELS) as AssetCategory[]).map((cat) => (
          <button
            key={cat}
            className={`asset-library__category-btn ${activeCategory === cat ? 'asset-library__category-btn--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
          </button>
        ))}
      </div>

      {filteredAssets.length === 0 ? (
        <div className="asset-library__empty">
          {searchQuery ? 'No matching assets' : 'No assets found'}
        </div>
      ) : (
        <div className="asset-library__grid">
          {filteredAssets.map((asset) => (
            <div key={asset.path} className={`asset-library__item asset-library__item--${asset.category}`}>
              <div className="asset-library__item-preview">
                {asset.category === 'image' ? (
                  <div className="asset-library__item-thumbnail" title={asset.name}>
                    {getAssetIcon(asset.category)}
                  </div>
                ) : (
                  <div className="asset-library__item-icon">
                    {getAssetIcon(asset.category)}
                  </div>
                )}
              </div>
              <div className="asset-library__item-name" title={asset.path}>
                {asset.name}
              </div>
              <div className="asset-library__item-ext">
                {asset.extension}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
