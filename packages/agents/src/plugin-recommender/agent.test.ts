import { afterEach, describe, expect, mock, test } from 'bun:test'
import { parseRecommendationResponse } from './agent'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_recommender_123', title: 'Plugin Recommender' })
)

const VALID_RESPONSE_JSON = JSON.stringify({
  recommendations: [
    {
      pluginId: 'phantom_camera',
      name: 'Phantom Camera',
      description: 'Smooth camera system with follow and look-at',
      category: 'physics',
      relevance: 'high',
      reason: 'Platformer games need smooth camera following the player',
      assetLibUrl: 'https://godotengine.org/asset-library/asset/1234',
      tags: ['camera', 'platformer'],
    },
    {
      pluginId: 'smart_shape_2d',
      name: 'SmartShape2D',
      description: 'Terrain generation tool for 2D games',
      category: 'physics',
      relevance: 'medium',
      reason: 'Useful for creating organic terrain shapes',
      assetLibUrl: 'https://godotengine.org/asset-library/asset/5678',
      tags: ['terrain', '2d'],
    },
  ],
  summary: 'Recommended camera and terrain plugins for your platformer game.',
})

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: VALID_RESPONSE_JSON,
    parts: [],
    raw: {},
  })
)

const mockGetDefaultModel = mock(() => ({
  providerID: 'openrouter',
  modelID: 'openai/gpt-5.2',
}))

mock.module('../opencode/client', () => ({
  createSession: mockCreateSession,
  sendPrompt: mockSendPrompt,
  setDirectory: () => {},
  getDirectory: () => '',
  getClient: () => ({}),
  resetClient: () => {},
  listSessions: async () => [],
  deleteSession: async () => {},
  sendPromptAsync: async () => {},
  listAgents: async () => [],
  respondToPermission: async () => {},
  replyToQuestion: async () => {},
  rejectQuestion: async () => {},
  subscribeEvents: async () => ({ error: null }),
}))

mock.module('../opencode/config', () => ({
  OPENCODE_PORT: 4096,
  OPENCODE_BASE_URL: 'http://localhost:4096',
  OPENCODE_HEALTH_URL: 'http://localhost:4096/global/health',
  OPENCODE_CONFIG_DIR: '/tmp/mock-opencode-config',
  OPENCODE_CONFIG_PATH: '/tmp/mock-opencode-config/opencode.json',
  ensureConfig: () => ({ $schema: 'https://opencode.ai/config.json', provider: {} }),
  readConfig: () => null,
  getDefaultModel: mockGetDefaultModel,
}))

const { PluginRecommenderAgent } = await import('./agent')

describe('PluginRecommenderAgent', () => {
  afterEach(() => {
    mockCreateSession.mockClear()
    mockSendPrompt.mockClear()
    mockGetDefaultModel.mockClear()

    mockCreateSession.mockImplementation(() =>
      Promise.resolve({ id: 'ses_recommender_123', title: 'Plugin Recommender' })
    )
    mockSendPrompt.mockImplementation(() =>
      Promise.resolve({
        text: VALID_RESPONSE_JSON,
        parts: [],
        raw: {},
      })
    )
    mockGetDefaultModel.mockImplementation(() => ({
      providerID: 'openrouter',
      modelID: 'openai/gpt-5.2',
    }))
  })

  describe('recommend() - success cases', () => {
    test('returns success with recommendations', async () => {
      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A 2D platformer with smooth camera and terrain',
        projectPath: '/tmp/test-project',
      })

      expect(result.success).toBe(true)
      expect(result.recommendations).toHaveLength(2)
    })

    test('returns recommendations with correct structure', async () => {
      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A platformer',
        projectPath: '/tmp/test-project',
      })

      const rec = result.recommendations[0]
      expect(rec.pluginId).toBe('phantom_camera')
      expect(rec.name).toBe('Phantom Camera')
      expect(rec.category).toBe('physics')
      expect(rec.relevance).toBe('high')
      expect(rec.reason).toContain('Platformer')
      expect(rec.assetLibUrl).toContain('godotengine.org')
      expect(rec.tags).toEqual(['camera', 'platformer'])
    })

    test('returns summary from AI response', async () => {
      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A platformer',
        projectPath: '/tmp/test-project',
      })

      expect(result.summary).toContain('platformer')
    })

    test('creates a session on first call', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Plugin Recommender')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'First game',
        projectPath: '/tmp/test-project',
      })
      await agent.recommend({
        gameDescription: 'Second game',
        projectPath: '/tmp/test-project',
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt, project path, and game description', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'Create a puzzle game',
        projectPath: '/tmp/my-project',
      })

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_recommender_123')
      expect(args.text).toContain('Plugin Recommender Agent')
      expect(args.text).toContain('Project path: /tmp/my-project')
      expect(args.text).toContain('Game Requirements:')
      expect(args.text).toContain('Create a puzzle game')
    })

    test('includes installed plugins in prompt when provided', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
        installedPlugins: ['phantom_camera', 'beehave'],
      })

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('Currently installed plugins: phantom_camera, beehave')
    })

    test('shows no plugins message when installedPlugins is empty', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
        installedPlugins: [],
      })

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('No plugins currently installed')
    })

    test('shows no plugins message when installedPlugins is not provided', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      expect(args.text).toContain('No plugins currently installed')
    })

    test('uses default model from config', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      expect(mockGetDefaultModel).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        model: { providerID: string; modelID: string }
      }
      expect(args.model).toEqual({
        providerID: 'openrouter',
        modelID: 'openai/gpt-5.2',
      })
    })

    test('prompt sections are separated by ---', async () => {
      const agent = new PluginRecommenderAgent()
      await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const sysPromptEnd = text.indexOf('---')
      expect(sysPromptEnd).toBeGreaterThan(0)

      const afterSeparator = text.slice(sysPromptEnd + 3)
      expect(afterSeparator).toContain('Project path:')
      expect(afterSeparator).toContain('Game Requirements:')
    })
  })

  describe('recommend() - failure cases', () => {
    test('returns empty recommendations when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })

    test('returns empty recommendations when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test-project',
      })

      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new PluginRecommenderAgent()
      await expect(
        agent.recommend({ gameDescription: 'A game', projectPath: '/tmp/test' })
      ).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new PluginRecommenderAgent()
      await expect(
        agent.recommend({ gameDescription: 'A game', projectPath: '/tmp/test' })
      ).rejects.toThrow('API timeout')
    })
  })

  describe('recommend() - session management', () => {
    test('creates new session after fresh instantiation', async () => {
      const agent1 = new PluginRecommenderAgent()
      await agent1.recommend({ gameDescription: 'Game 1', projectPath: '/tmp/p1' })

      const agent2 = new PluginRecommenderAgent()
      await agent2.recommend({ gameDescription: 'Game 2', projectPath: '/tmp/p2' })

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again if first call set it', async () => {
      const agent = new PluginRecommenderAgent()

      await agent.recommend({ gameDescription: 'First', projectPath: '/tmp/p' })
      await agent.recommend({ gameDescription: 'Second', projectPath: '/tmp/p' })
      await agent.recommend({ gameDescription: 'Third', projectPath: '/tmp/p' })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_recommender_123')
      }
    })
  })

  describe('RecommendationResult interface', () => {
    test('result has correct shape with recommendations, summary, success', async () => {
      const agent = new PluginRecommenderAgent()
      const result = await agent.recommend({
        gameDescription: 'A game',
        projectPath: '/tmp/test',
      })

      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('success')
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(typeof result.summary).toBe('string')
      expect(typeof result.success).toBe('boolean')
    })
  })
})

describe('parseRecommendationResponse', () => {
  describe('valid JSON parsing', () => {
    test('parses valid JSON response with recommendations', () => {
      const json = JSON.stringify({
        recommendations: [
          {
            pluginId: 'beehave',
            name: 'Beehave',
            description: 'Behavior trees for AI',
            category: 'ai',
            relevance: 'high',
            reason: 'Game needs enemy AI',
            assetLibUrl: 'https://godotengine.org/asset-library/asset/999',
            tags: ['ai', 'behavior-tree'],
          },
        ],
        summary: 'AI plugin recommended.',
      })

      const result = parseRecommendationResponse(json)
      expect(result.success).toBe(true)
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].pluginId).toBe('beehave')
      expect(result.summary).toBe('AI plugin recommended.')
    })

    test('parses multiple recommendations', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'a', name: 'A', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
          { pluginId: 'b', name: 'B', description: '', category: 'audio', relevance: 'low', reason: '', assetLibUrl: '', tags: [] },
          { pluginId: 'c', name: 'C', description: '', category: 'input', relevance: 'medium', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: 'Three plugins.',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations).toHaveLength(3)
    })

    test('extracts JSON from surrounding text', () => {
      const text = `Here are my recommendations:\n${JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'tools', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: 'One plugin.',
      })}\n\nHope this helps!`

      const result = parseRecommendationResponse(text)
      expect(result.success).toBe(true)
      expect(result.recommendations).toHaveLength(1)
    })
  })

  describe('invalid input handling', () => {
    test('returns failure for non-JSON text', () => {
      const result = parseRecommendationResponse('This is just plain text with no JSON.')
      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })

    test('returns failure for empty string', () => {
      const result = parseRecommendationResponse('')
      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })

    test('returns failure for malformed JSON', () => {
      const result = parseRecommendationResponse('{"recommendations": [broken}')
      expect(result.success).toBe(false)
    })

    test('returns failure when recommendations is not an array', () => {
      const json = JSON.stringify({ recommendations: 'not an array', summary: 'bad' })
      const result = parseRecommendationResponse(json)
      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })

    test('returns failure for empty recommendations array', () => {
      const json = JSON.stringify({ recommendations: [], summary: 'None found' })
      const result = parseRecommendationResponse(json)
      expect(result.success).toBe(false)
      expect(result.recommendations).toEqual([])
    })
  })

  describe('field validation and defaults', () => {
    test('defaults category to other for invalid category', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'invalid_cat', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].category).toBe('other')
    })

    test('defaults relevance to medium for invalid relevance', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'super_high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].relevance).toBe('medium')
    })

    test('defaults name to pluginId when name is missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'my_plugin', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].name).toBe('my_plugin')
    })

    test('defaults description to empty string when missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].description).toBe('')
    })

    test('defaults reason to empty string when missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'high', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].reason).toBe('')
    })

    test('defaults assetLibUrl to empty string when missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'high', reason: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].assetLibUrl).toBe('')
    })

    test('defaults tags to empty array when missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '' },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].tags).toEqual([])
    })

    test('filters non-string tags', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: ['valid', 123, null, 'also_valid'] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations[0].tags).toEqual(['valid', 'also_valid'])
    })

    test('skips recommendations missing pluginId', () => {
      const json = JSON.stringify({
        recommendations: [
          { name: 'No ID', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
          { pluginId: 'has_id', name: 'Has ID', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].pluginId).toBe('has_id')
    })

    test('skips null entries in recommendations array', () => {
      const json = JSON.stringify({
        recommendations: [
          null,
          { pluginId: 'valid', name: 'Valid', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
          42,
          'string',
        ],
        summary: '',
      })

      const result = parseRecommendationResponse(json)
      expect(result.recommendations).toHaveLength(1)
    })

    test('defaults summary to empty string when missing', () => {
      const json = JSON.stringify({
        recommendations: [
          { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
        ],
      })

      const result = parseRecommendationResponse(json)
      expect(result.summary).toBe('')
    })
  })

  describe('category validation', () => {
    const validCategories = ['physics', 'ui', 'audio', 'visual', 'networking', 'ai', 'input', 'tools', 'shaders', 'other']

    for (const cat of validCategories) {
      test(`accepts valid category: ${cat}`, () => {
        const json = JSON.stringify({
          recommendations: [
            { pluginId: 'test', name: 'Test', description: '', category: cat, relevance: 'high', reason: '', assetLibUrl: '', tags: [] },
          ],
          summary: '',
        })

        const result = parseRecommendationResponse(json)
        expect(result.recommendations[0].category).toBe(cat)
      })
    }
  })

  describe('relevance validation', () => {
    const validRelevances = ['high', 'medium', 'low']

    for (const rel of validRelevances) {
      test(`accepts valid relevance: ${rel}`, () => {
        const json = JSON.stringify({
          recommendations: [
            { pluginId: 'test', name: 'Test', description: '', category: 'ui', relevance: rel, reason: '', assetLibUrl: '', tags: [] },
          ],
          summary: '',
        })

        const result = parseRecommendationResponse(json)
        expect(result.recommendations[0].relevance).toBe(rel)
      })
    }
  })
})

describe('module exports', () => {
  test('index exports PluginRecommenderAgent class', async () => {
    const mod = await import('./index')
    expect(mod.PluginRecommenderAgent).toBeDefined()
    expect(typeof mod.PluginRecommenderAgent).toBe('function')
  })

  test('index exports parseRecommendationResponse function', async () => {
    const mod = await import('./index')
    expect(mod.parseRecommendationResponse).toBeDefined()
    expect(typeof mod.parseRecommendationResponse).toBe('function')
  })

  test('index exports PLUGIN_RECOMMENDER_SYSTEM_PROMPT', async () => {
    const mod = await import('./index')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toBeDefined()
    expect(typeof mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toBe('string')
  })

  test('exported PluginRecommenderAgent is instantiable', async () => {
    const mod = await import('./index')
    const agent = new mod.PluginRecommenderAgent()
    expect(agent).toBeInstanceOf(mod.PluginRecommenderAgent)
  })

  test('system prompt mentions Plugin Recommender Agent', async () => {
    const mod = await import('./index')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Plugin Recommender Agent')
  })

  test('system prompt contains plugin knowledge base', async () => {
    const mod = await import('./index')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Plugin Knowledge Base')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Phantom Camera')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('DialogueManager')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Beehave')
  })

  test('system prompt contains genre-to-plugin mapping', async () => {
    const mod = await import('./index')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Genre-to-Plugin Mapping')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('Platformer')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('RPG')
  })

  test('system prompt defines JSON output format', async () => {
    const mod = await import('./index')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('"recommendations"')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('"pluginId"')
    expect(mod.PLUGIN_RECOMMENDER_SYSTEM_PROMPT).toContain('"relevance"')
  })
})
