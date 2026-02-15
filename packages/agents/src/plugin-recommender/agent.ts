import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { PLUGIN_RECOMMENDER_SYSTEM_PROMPT } from './system-prompt'

export type PluginCategory =
  | 'physics'
  | 'ui'
  | 'audio'
  | 'visual'
  | 'networking'
  | 'ai'
  | 'input'
  | 'tools'
  | 'shaders'
  | 'other'

export type PluginRelevance = 'high' | 'medium' | 'low'

export interface PluginRecommendation {
  pluginId: string
  name: string
  description: string
  category: PluginCategory
  relevance: PluginRelevance
  reason: string
  assetLibUrl: string
  tags: string[]
}

export interface RecommendationResult {
  recommendations: PluginRecommendation[]
  summary: string
  success: boolean
}

export interface RecommendOptions {
  gameDescription: string
  projectPath: string
  installedPlugins?: string[]
}

export class PluginRecommenderAgent {
  private sessionId: string | null = null

  async recommend(options: RecommendOptions): Promise<RecommendationResult> {
    if (!this.sessionId) {
      const session = await createSession('Plugin Recommender')
      this.sessionId = session.id
    }

    const installedSection = options.installedPlugins?.length
      ? `Currently installed plugins: ${options.installedPlugins.join(', ')}`
      : 'No plugins currently installed.'

    const fullPrompt = [
      PLUGIN_RECOMMENDER_SYSTEM_PROMPT,
      '---',
      `Project path: ${options.projectPath}`,
      installedSection,
      `Game Requirements:\n${options.gameDescription}`,
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
    })

    if (!response.text) {
      return { recommendations: [], summary: '', success: false }
    }

    return parseRecommendationResponse(response.text)
  }
}

export function parseRecommendationResponse(text: string): RecommendationResult {
  const jsonMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/)
  if (!jsonMatch) {
    return { recommendations: [], summary: text, success: false }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      recommendations?: unknown[]
      summary?: string
    }

    if (!Array.isArray(parsed.recommendations)) {
      return { recommendations: [], summary: parsed.summary ?? '', success: false }
    }

    const validCategories: PluginCategory[] = [
      'physics', 'ui', 'audio', 'visual', 'networking', 'ai', 'input', 'tools', 'shaders', 'other',
    ]
    const validRelevances: PluginRelevance[] = ['high', 'medium', 'low']

    const recommendations: PluginRecommendation[] = parsed.recommendations
      .filter((r): r is Record<string, unknown> =>
        typeof r === 'object' && r !== null && typeof (r as Record<string, unknown>).pluginId === 'string',
      )
      .map((r) => ({
        pluginId: String(r.pluginId),
        name: String(r.name ?? r.pluginId),
        description: String(r.description ?? ''),
        category: validCategories.includes(r.category as PluginCategory)
          ? (r.category as PluginCategory)
          : 'other',
        relevance: validRelevances.includes(r.relevance as PluginRelevance)
          ? (r.relevance as PluginRelevance)
          : 'medium',
        reason: String(r.reason ?? ''),
        assetLibUrl: String(r.assetLibUrl ?? ''),
        tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
      }))

    return {
      recommendations,
      summary: String(parsed.summary ?? ''),
      success: recommendations.length > 0,
    }
  } catch {
    return { recommendations: [], summary: '', success: false }
  }
}
