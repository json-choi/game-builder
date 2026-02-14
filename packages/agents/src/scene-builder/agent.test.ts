import { afterEach, describe, expect, mock, test } from 'bun:test'

const mockCreateSession = mock(() =>
  Promise.resolve({ id: 'ses_scene_123', title: 'Scene Builder' })
)

const mockSendPrompt = mock(() =>
  Promise.resolve({
    text: [
      '```tscn',
      '# filename: scenes/Player.tscn',
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://scripts/player.gd" id="1"]',
      '',
      '[node name="Player" type="CharacterBody2D"]',
      'script = ExtResource("1")',
      '',
      '[node name="Sprite2D" type="Sprite2D" parent="."]',
      '',
      '[node name="CollisionShape2D" type="CollisionShape2D" parent="."]',
      '```',
    ].join('\n'),
    parts: [],
    raw: {},
  })
)

const mockGetDefaultModel = mock(() => ({
  providerID: 'openrouter',
  modelID: 'anthropic/claude-sonnet-4.5',
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

const { SceneBuilderAgent } = await import('./agent')

describe('SceneBuilderAgent', () => {
  afterEach(() => {
    mockCreateSession.mockClear()
    mockSendPrompt.mockClear()
    mockGetDefaultModel.mockClear()

    mockCreateSession.mockImplementation(() =>
      Promise.resolve({ id: 'ses_scene_123', title: 'Scene Builder' })
    )
    mockSendPrompt.mockImplementation(() =>
      Promise.resolve({
        text: [
          '```tscn',
          '# filename: scenes/Player.tscn',
          '[gd_scene load_steps=2 format=3]',
          '',
          '[ext_resource type="Script" path="res://scripts/player.gd" id="1"]',
          '',
          '[node name="Player" type="CharacterBody2D"]',
          'script = ExtResource("1")',
          '',
          '[node name="Sprite2D" type="Sprite2D" parent="."]',
          '',
          '[node name="CollisionShape2D" type="CollisionShape2D" parent="."]',
          '```',
        ].join('\n'),
        parts: [],
        raw: {},
      })
    )
    mockGetDefaultModel.mockImplementation(() => ({
      providerID: 'openrouter',
      modelID: 'anthropic/claude-sonnet-4.5',
    }))
  })

  describe('buildScenes() — success cases', () => {
    test('returns success with extracted .tscn scenes', async () => {
      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a player scene', '/tmp/test-project')

      expect(result.success).toBe(true)
      expect(result.scenes).toHaveLength(1)
      expect(result.scenes[0].path).toBe('scenes/Player.tscn')
      expect(result.scenes[0].type).toBe('tscn')
      expect(result.scenes[0].content).toContain('[gd_scene load_steps=2 format=3]')
      expect(result.scenes[0].content).toContain('[node name="Player" type="CharacterBody2D"]')
    })

    test('creates a session on first call', async () => {
      const agent = new SceneBuilderAgent()
      await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith('Scene Builder')
    })

    test('reuses session on subsequent calls', async () => {
      const agent = new SceneBuilderAgent()
      await agent.buildScenes('Create player scene', '/tmp/test-project')
      await agent.buildScenes('Create enemy scene', '/tmp/test-project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(2)
    })

    test('sends prompt with system prompt, project path, and design spec', async () => {
      const agent = new SceneBuilderAgent()
      await agent.buildScenes('Create a level scene with platforms', '/tmp/my-project')

      expect(mockSendPrompt).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        sessionId: string
        text: string
        model: { providerID: string; modelID: string }
      }
      expect(args.sessionId).toBe('ses_scene_123')
      expect(args.text).toContain('You are the Scene Builder Agent')
      expect(args.text).toContain('Project path: /tmp/my-project')
      expect(args.text).toContain('Design specification:\nCreate a level scene with platforms')
    })

    test('uses default model from config', async () => {
      const agent = new SceneBuilderAgent()
      await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(mockGetDefaultModel).toHaveBeenCalledTimes(1)
      const args = mockSendPrompt.mock.calls[0][0] as {
        model: { providerID: string; modelID: string }
      }
      expect(args.model).toEqual({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.5',
      })
    })

    test('prompt sections are separated by ---', async () => {
      const agent = new SceneBuilderAgent()
      await agent.buildScenes('Create a scene', '/tmp/test-project')

      const args = mockSendPrompt.mock.calls[0][0] as { text: string }
      const text = args.text
      const separatorIdx = text.indexOf('---')
      expect(separatorIdx).toBeGreaterThan(0)

      const afterSeparator = text.slice(separatorIdx + 3)
      expect(afterSeparator).toContain('Project path:')
      expect(afterSeparator).toContain('Design specification:')
    })

    test('raw field contains full response text', async () => {
      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(result.raw).toContain('[gd_scene load_steps=2 format=3]')
      expect(result.raw).toContain('scenes/Player.tscn')
    })

    test('extracts multiple .tscn scenes from response', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```tscn',
            '# filename: scenes/Main.tscn',
            '[gd_scene format=3]',
            '[node name="Main" type="Node2D"]',
            '```',
            '',
            '```tscn',
            '# filename: scenes/Player.tscn',
            '[gd_scene load_steps=2 format=3]',
            '[node name="Player" type="CharacterBody2D"]',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create main and player scenes', '/tmp/test-project')

      expect(result.success).toBe(true)
      expect(result.scenes).toHaveLength(2)
      expect(result.scenes[0].path).toBe('scenes/Main.tscn')
      expect(result.scenes[1].path).toBe('scenes/Player.tscn')
    })

    test('includes .tres resource files in scenes output', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```tscn',
            '# filename: scenes/Player.tscn',
            '[gd_scene format=3]',
            '[node name="Player" type="CharacterBody2D"]',
            '```',
            '',
            '```tres',
            '# filename: resources/theme.tres',
            '[gd_resource type="Theme" format=3]',
            '[resource]',
            'default_font_size = 16',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create player scene with theme', '/tmp/test-project')

      expect(result.success).toBe(true)
      expect(result.scenes).toHaveLength(2)
      expect(result.scenes[0].path).toBe('scenes/Player.tscn')
      expect(result.scenes[0].type).toBe('tscn')
      expect(result.scenes[1].path).toBe('resources/theme.tres')
      expect(result.scenes[1].type).toBe('tres')
    })

    test('filters out non-scene files like .gd scripts', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```tscn',
            '# filename: scenes/Player.tscn',
            '[gd_scene format=3]',
            '[node name="Player" type="CharacterBody2D"]',
            '```',
            '',
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '',
            'func _ready():',
            '    pass',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create player with script', '/tmp/test-project')

      expect(result.success).toBe(true)
      expect(result.scenes).toHaveLength(1)
      expect(result.scenes[0].path).toBe('scenes/Player.tscn')
      expect(result.scenes.every((s) => s.path.endsWith('.tscn') || s.path.endsWith('.tres'))).toBe(
        true
      )
    })
  })

  describe('buildScenes() — failure cases', () => {
    test('returns failure when response text is null', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: null, parts: [], raw: {} })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.scenes).toHaveLength(0)
      expect(result.raw).toBe('')
    })

    test('returns failure when response text is empty', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: '', parts: [], raw: {} })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.scenes).toHaveLength(0)
      expect(result.raw).toBe('')
    })

    test('returns failure when response has no scene/resource files', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: [
            '```gdscript',
            '# filename: scripts/player.gd',
            'extends CharacterBody2D',
            '```',
          ].join('\n'),
          parts: [],
          raw: {},
        })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.scenes).toHaveLength(0)
      expect(result.raw).toContain('extends CharacterBody2D')
    })

    test('returns failure when response is plain text without code', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({
          text: 'Here is a description of how to create a scene in Godot. You should use CharacterBody2D for the player.',
          parts: [],
          raw: {},
        })
      )

      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test-project')

      expect(result.success).toBe(false)
      expect(result.scenes).toHaveLength(0)
    })

    test('propagates error when createSession fails', async () => {
      mockCreateSession.mockImplementation(() =>
        Promise.reject(new Error('Session creation failed'))
      )

      const agent = new SceneBuilderAgent()
      await expect(
        agent.buildScenes('Create a scene', '/tmp/test-project')
      ).rejects.toThrow('Session creation failed')
    })

    test('propagates error when sendPrompt fails', async () => {
      mockSendPrompt.mockImplementation(() =>
        Promise.reject(new Error('API timeout'))
      )

      const agent = new SceneBuilderAgent()
      await expect(
        agent.buildScenes('Create a scene', '/tmp/test-project')
      ).rejects.toThrow('API timeout')
    })
  })

  describe('buildScenes() — session management', () => {
    test('creates new session for each agent instance', async () => {
      const agent1 = new SceneBuilderAgent()
      await agent1.buildScenes('Scene 1', '/tmp/p1')

      const agent2 = new SceneBuilderAgent()
      await agent2.buildScenes('Scene 2', '/tmp/p2')

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    test('does not create session again after first call', async () => {
      const agent = new SceneBuilderAgent()

      await agent.buildScenes('First scene', '/tmp/project')
      await agent.buildScenes('Second scene', '/tmp/project')
      await agent.buildScenes('Third scene', '/tmp/project')

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendPrompt).toHaveBeenCalledTimes(3)

      for (let i = 0; i < 3; i++) {
        const args = mockSendPrompt.mock.calls[i][0] as { sessionId: string }
        expect(args.sessionId).toBe('ses_scene_123')
      }
    })
  })

  describe('buildScenes() — SceneBuildResult interface', () => {
    test('result has correct shape with success, scenes, and raw fields', async () => {
      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test')

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('scenes')
      expect(result).toHaveProperty('raw')
      expect(typeof result.success).toBe('boolean')
      expect(Array.isArray(result.scenes)).toBe(true)
      expect(typeof result.raw).toBe('string')
    })

    test('each scene has path, content, and type fields', async () => {
      const agent = new SceneBuilderAgent()
      const result = await agent.buildScenes('Create a scene', '/tmp/test')

      for (const scene of result.scenes) {
        expect(scene).toHaveProperty('path')
        expect(scene).toHaveProperty('content')
        expect(scene).toHaveProperty('type')
        expect(typeof scene.path).toBe('string')
        expect(typeof scene.content).toBe('string')
        expect(typeof scene.type).toBe('string')
      }
    })

    test('success is true only when scenes array is non-empty', async () => {
      const agent = new SceneBuilderAgent()

      const successResult = await agent.buildScenes('Create a scene', '/tmp/test')
      expect(successResult.success).toBe(true)
      expect(successResult.scenes.length).toBeGreaterThan(0)

      mockSendPrompt.mockImplementation(() =>
        Promise.resolve({ text: 'No code here', parts: [], raw: {} })
      )
      const agent2 = new SceneBuilderAgent()
      const failResult = await agent2.buildScenes('Create a scene', '/tmp/test')
      expect(failResult.success).toBe(false)
      expect(failResult.scenes).toHaveLength(0)
    })
  })
})
