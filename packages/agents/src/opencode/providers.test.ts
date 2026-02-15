import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), `providers-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const configDir = join(testDir, '.config', 'opencode')
const settingsPath = join(configDir, 'game-builder-settings.json')

mock.module('node:os', () => ({
  homedir: () => testDir,
  tmpdir,
}))

mock.module('./config', () => ({
  OPENCODE_PORT: 4096,
  OPENCODE_BASE_URL: 'http://localhost:4096',
  OPENCODE_HEALTH_URL: 'http://localhost:4096/global/health',
  OPENCODE_CONFIG_DIR: configDir,
  OPENCODE_CONFIG_PATH: join(configDir, 'opencode.json'),
  ensureConfig: () => ({ $schema: 'https://opencode.ai/config.json', provider: {} }),
  readConfig: () => null,
  getDefaultModel: () => ({ providerID: 'openrouter', modelID: 'anthropic/claude-sonnet-4.5' }),
}))

mock.module('@opencode-ai/sdk', () => ({
  createOpencodeClient: () => ({
    auth: { set: mock(() => Promise.resolve()), remove: mock(() => Promise.resolve()) },
  }),
}))

mock.module('./client', () => ({
  getClient: () => ({
    auth: { set: mock(() => Promise.resolve()), remove: mock(() => Promise.resolve()) },
  }),
  getDirectory: () => '/tmp',
  setDirectory: () => {},
  resetClient: () => {},
  createSession: mock(() => Promise.resolve({ id: 'ses_mock', title: '' })),
  listSessions: mock(() => Promise.resolve([])),
  deleteSession: mock(() => Promise.resolve()),
  sendPrompt: mock(() => Promise.resolve({ text: null, parts: [], raw: {} })),
  sendPromptAsync: mock(() => Promise.resolve()),
  listAgents: mock(() => Promise.resolve([])),
  respondToPermission: mock(() => Promise.resolve()),
  replyToQuestion: mock(() => Promise.resolve()),
  rejectQuestion: mock(() => Promise.resolve()),
  subscribeEvents: mock(() => Promise.resolve({ stream: [] })),
}))

const {
  PROVIDER_PRESETS,
  getProviders,
  getAuthStatus,
  getActiveProvider,
  setActiveProvider,
  getStoredKey,
  getAgentConfigs,
  setAgentConfigs,
  setAuthKey,
  removeAuth,
} = await import('./providers')

describe('providers', () => {
  beforeEach(() => {
    mkdirSync(configDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('PROVIDER_PRESETS', () => {
    test('is a non-empty array', () => {
      expect(Array.isArray(PROVIDER_PRESETS)).toBe(true)
      expect(PROVIDER_PRESETS.length).toBeGreaterThan(0)
    })

    test('each preset has required fields', () => {
      for (const preset of PROVIDER_PRESETS) {
        expect(typeof preset.id).toBe('string')
        expect(typeof preset.name).toBe('string')
        expect(typeof preset.envVar).toBe('string')
        expect(Array.isArray(preset.models)).toBe(true)
        expect(preset.models.length).toBeGreaterThan(0)
      }
    })

    test('each model has required fields', () => {
      for (const preset of PROVIDER_PRESETS) {
        for (const model of preset.models) {
          expect(typeof model.id).toBe('string')
          expect(typeof model.name).toBe('string')
        }
      }
    })

    test('contains openrouter preset', () => {
      const openrouter = PROVIDER_PRESETS.find((p) => p.id === 'openrouter')
      expect(openrouter).toBeDefined()
      expect(openrouter!.envVar).toBe('OPENROUTER_API_KEY')
    })

    test('contains anthropic preset', () => {
      const anthropic = PROVIDER_PRESETS.find((p) => p.id === 'anthropic')
      expect(anthropic).toBeDefined()
      expect(anthropic!.envVar).toBe('ANTHROPIC_API_KEY')
    })
  })

  describe('getProviders', () => {
    test('returns PROVIDER_PRESETS', () => {
      const providers = getProviders()
      expect(providers).toBe(PROVIDER_PRESETS)
    })
  })

  describe('getAuthStatus', () => {
    test('returns empty object when no settings exist', () => {
      const status = getAuthStatus()
      expect(status).toEqual({})
    })

    test('returns truthy entries for stored API keys', () => {
      const settings = {
        activeProvider: null,
        activeModel: null,
        apiKeys: { openrouter: 'sk-test-key', anthropic: 'sk-ant-key' },
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      const status = getAuthStatus()
      expect(status.openrouter).toBe(true)
      expect(status.anthropic).toBe(true)
    })
  })

  describe('getActiveProvider', () => {
    test('returns nulls when no settings exist', () => {
      const { providerId, modelId } = getActiveProvider()
      expect(providerId).toBeNull()
      expect(modelId).toBeNull()
    })

    test('returns stored active provider and model', () => {
      const settings = {
        activeProvider: 'openrouter',
        activeModel: 'anthropic/claude-sonnet-4.5',
        apiKeys: {},
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      const { providerId, modelId } = getActiveProvider()
      expect(providerId).toBe('openrouter')
      expect(modelId).toBe('anthropic/claude-sonnet-4.5')
    })
  })

  describe('setActiveProvider', () => {
    test('persists active provider and model', () => {
      setActiveProvider('anthropic', 'claude-sonnet-4-5')

      const { providerId, modelId } = getActiveProvider()
      expect(providerId).toBe('anthropic')
      expect(modelId).toBe('claude-sonnet-4-5')
    })

    test('preserves other settings', () => {
      const settings = {
        activeProvider: null,
        activeModel: null,
        apiKeys: { openrouter: 'key123' },
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      setActiveProvider('google', 'gemini-2.5-pro')

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.apiKeys.openrouter).toBe('key123')
      expect(raw.activeProvider).toBe('google')
    })
  })

  describe('getStoredKey', () => {
    test('returns null when no settings exist', () => {
      expect(getStoredKey('openrouter')).toBeNull()
    })

    test('returns stored key for provider', () => {
      const settings = {
        activeProvider: null,
        activeModel: null,
        apiKeys: { openrouter: 'sk-test' },
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      expect(getStoredKey('openrouter')).toBe('sk-test')
    })

    test('returns null for non-existent provider key', () => {
      const settings = {
        activeProvider: null,
        activeModel: null,
        apiKeys: { openrouter: 'sk-test' },
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      expect(getStoredKey('anthropic')).toBeNull()
    })
  })

  describe('getAgentConfigs / setAgentConfigs', () => {
    test('returns empty array when no settings exist', () => {
      expect(getAgentConfigs()).toEqual([])
    })

    test('persists and retrieves agent configs', () => {
      const configs = [
        { name: 'game-coder', modelId: 'claude-sonnet-4-5' },
        { name: 'reviewer', modelId: 'gpt-4o' },
      ]
      setAgentConfigs(configs)

      const retrieved = getAgentConfigs()
      expect(retrieved).toEqual(configs)
    })

    test('overwrites previous configs', () => {
      setAgentConfigs([{ name: 'a', modelId: 'x' }])
      setAgentConfigs([{ name: 'b', modelId: 'y' }])

      const retrieved = getAgentConfigs()
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].name).toBe('b')
    })

    test('preserves other settings when updating configs', () => {
      const settings = {
        activeProvider: 'anthropic',
        activeModel: 'claude-sonnet-4-5',
        apiKeys: { openrouter: 'key-abc' },
        agentConfigs: [],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      setAgentConfigs([{ name: 'game-coder', modelId: 'gpt-4o' }])

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.activeProvider).toBe('anthropic')
      expect(raw.apiKeys.openrouter).toBe('key-abc')
      expect(raw.agentConfigs).toHaveLength(1)
    })

    test('can set empty configs array', () => {
      setAgentConfigs([{ name: 'a', modelId: 'x' }])
      setAgentConfigs([])

      expect(getAgentConfigs()).toEqual([])
    })
  })

  describe('setAuthKey', () => {
    test('saves API key locally and calls client.auth.set', async () => {
      await setAuthKey('openrouter', 'sk-or-test-123')

      expect(getStoredKey('openrouter')).toBe('sk-or-test-123')
    })

    test('overwrites existing key for same provider', async () => {
      await setAuthKey('anthropic', 'sk-ant-old')
      await setAuthKey('anthropic', 'sk-ant-new')

      expect(getStoredKey('anthropic')).toBe('sk-ant-new')
    })

    test('stores keys for multiple providers independently', async () => {
      await setAuthKey('openrouter', 'sk-or-key')
      await setAuthKey('anthropic', 'sk-ant-key')
      await setAuthKey('openai', 'sk-oai-key')

      expect(getStoredKey('openrouter')).toBe('sk-or-key')
      expect(getStoredKey('anthropic')).toBe('sk-ant-key')
      expect(getStoredKey('openai')).toBe('sk-oai-key')
    })

    test('preserves other settings when saving key', async () => {
      const settings = {
        activeProvider: 'google',
        activeModel: 'gemini-2.5-pro',
        apiKeys: {},
        agentConfigs: [{ name: 'reviewer', modelId: 'gpt-4o' }],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      await setAuthKey('openrouter', 'sk-test')

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.activeProvider).toBe('google')
      expect(raw.activeModel).toBe('gemini-2.5-pro')
      expect(raw.agentConfigs).toHaveLength(1)
      expect(raw.apiKeys.openrouter).toBe('sk-test')
    })

    test('reflects in auth status after saving', async () => {
      await setAuthKey('openrouter', 'sk-test')

      const status = getAuthStatus()
      expect(status.openrouter).toBe(true)
    })
  })

  describe('removeAuth', () => {
    test('removes stored key for provider', async () => {
      await setAuthKey('openrouter', 'sk-test-key')
      expect(getStoredKey('openrouter')).toBe('sk-test-key')

      await removeAuth('openrouter')
      expect(getStoredKey('openrouter')).toBeNull()
    })

    test('does not affect other provider keys', async () => {
      await setAuthKey('openrouter', 'sk-or')
      await setAuthKey('anthropic', 'sk-ant')

      await removeAuth('openrouter')

      expect(getStoredKey('openrouter')).toBeNull()
      expect(getStoredKey('anthropic')).toBe('sk-ant')
    })

    test('is idempotent for non-existent provider', async () => {
      await removeAuth('nonexistent')
      expect(getStoredKey('nonexistent')).toBeNull()
    })

    test('removes provider from auth status', async () => {
      await setAuthKey('anthropic', 'sk-ant')
      expect(getAuthStatus().anthropic).toBe(true)

      await removeAuth('anthropic')
      expect(getAuthStatus().anthropic).toBeUndefined()
    })

    test('preserves other settings when removing key', async () => {
      const settings = {
        activeProvider: 'anthropic',
        activeModel: 'claude-sonnet-4-5',
        apiKeys: { anthropic: 'sk-ant', openrouter: 'sk-or' },
        agentConfigs: [{ name: 'coder', modelId: 'gpt-4o' }],
      }
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8')

      await removeAuth('anthropic')

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.activeProvider).toBe('anthropic')
      expect(raw.agentConfigs).toHaveLength(1)
      expect(raw.apiKeys.openrouter).toBe('sk-or')
      expect(raw.apiKeys.anthropic).toBeUndefined()
    })
  })

  describe('settings persistence', () => {
    test('creates settings file on first write', () => {
      setActiveProvider('google', 'gemini-2.5-pro')

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.activeProvider).toBe('google')
      expect(raw.activeModel).toBe('gemini-2.5-pro')
    })

    test('settings file contains all default fields after write', () => {
      setActiveProvider('openai', 'gpt-4o')

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw).toHaveProperty('activeProvider')
      expect(raw).toHaveProperty('activeModel')
      expect(raw).toHaveProperty('apiKeys')
      expect(raw).toHaveProperty('agentConfigs')
    })

    test('settings file is valid JSON', () => {
      setActiveProvider('anthropic', 'claude-sonnet-4-5')
      const content = readFileSync(settingsPath, 'utf-8')
      expect(() => JSON.parse(content)).not.toThrow()
    })

    test('multiple operations preserve all data', async () => {
      setActiveProvider('openrouter', 'anthropic/claude-sonnet-4.5')
      await setAuthKey('openrouter', 'sk-or-123')
      setAgentConfigs([{ name: 'game-coder', modelId: 'gpt-4o' }])

      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.activeProvider).toBe('openrouter')
      expect(raw.activeModel).toBe('anthropic/claude-sonnet-4.5')
      expect(raw.apiKeys.openrouter).toBe('sk-or-123')
      expect(raw.agentConfigs).toHaveLength(1)
      expect(raw.agentConfigs[0].name).toBe('game-coder')
    })

    test('setAuthKey then removeAuth results in clean state for that provider', async () => {
      await setAuthKey('google', 'sk-goog-test')
      expect(getStoredKey('google')).toBe('sk-goog-test')
      expect(getAuthStatus().google).toBe(true)

      await removeAuth('google')
      expect(getStoredKey('google')).toBeNull()
      expect(getAuthStatus().google).toBeUndefined()
    })
  })

  describe('PROVIDER_PRESETS structure', () => {
    test('contains google preset', () => {
      const google = PROVIDER_PRESETS.find((p) => p.id === 'google')
      expect(google).toBeDefined()
      expect(google!.envVar).toBe('GOOGLE_API_KEY')
    })

    test('contains openai preset', () => {
      const openai = PROVIDER_PRESETS.find((p) => p.id === 'openai')
      expect(openai).toBeDefined()
      expect(openai!.envVar).toBe('OPENAI_API_KEY')
    })

    test('all preset IDs are unique', () => {
      const ids = PROVIDER_PRESETS.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    test('all model IDs within a preset are unique', () => {
      for (const preset of PROVIDER_PRESETS) {
        const modelIds = preset.models.map((m) => m.id)
        expect(new Set(modelIds).size).toBe(modelIds.length)
      }
    })

    test('models with thinking flag are explicitly set', () => {
      for (const preset of PROVIDER_PRESETS) {
        for (const model of preset.models) {
          if (model.thinking !== undefined) {
            expect(typeof model.thinking).toBe('boolean')
          }
        }
      }
    })

    test('models with limits have valid numbers', () => {
      for (const preset of PROVIDER_PRESETS) {
        for (const model of preset.models) {
          if (model.limit) {
            if (model.limit.context !== undefined) {
              expect(model.limit.context).toBeGreaterThan(0)
            }
            if (model.limit.output !== undefined) {
              expect(model.limit.output).toBeGreaterThan(0)
            }
          }
        }
      }
    })
  })
})
