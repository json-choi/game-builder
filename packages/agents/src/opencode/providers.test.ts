import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), `providers-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const configDir = join(testDir, '.config', 'opencode')
const settingsPath = join(configDir, 'game-builder-settings.json')

mock.module('node:os', () => ({
  homedir: () => testDir,
}))

mock.module('@opencode-ai/sdk', () => ({
  createOpencodeClient: () => ({
    auth: { set: mock(() => Promise.resolve()) },
  }),
}))

mock.module('./client', () => ({
  getClient: () => ({
    auth: { set: mock(() => Promise.resolve()) },
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
  })
})
