import { describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import {
  OPENCODE_PORT,
  OPENCODE_BASE_URL,
  OPENCODE_HEALTH_URL,
  OPENCODE_CONFIG_DIR,
  OPENCODE_CONFIG_PATH,
  ensureConfig,
  readConfig,
  getDefaultModel,
} from './config'

describe('config', () => {
  describe('constants', () => {
    test('OPENCODE_PORT is 4096', () => {
      expect(OPENCODE_PORT).toBe(4096)
    })

    test('OPENCODE_BASE_URL includes port', () => {
      expect(OPENCODE_BASE_URL).toContain('4096')
      expect(OPENCODE_BASE_URL).toContain('localhost')
    })

    test('OPENCODE_HEALTH_URL ends with /global/health', () => {
      expect(OPENCODE_HEALTH_URL).toContain('/global/health')
    })

    test('OPENCODE_CONFIG_DIR contains opencode', () => {
      expect(OPENCODE_CONFIG_DIR).toContain('opencode')
    })

    test('OPENCODE_CONFIG_PATH contains opencode.json', () => {
      expect(OPENCODE_CONFIG_PATH).toContain('opencode.json')
    })
  })

  describe('ensureConfig', () => {
    test('returns an object with $schema and provider', () => {
      const config = ensureConfig()
      expect(config).toBeDefined()
      expect(typeof config).toBe('object')
      expect(config.$schema).toBeDefined()
      expect(config.provider).toBeDefined()
    })
  })

  describe('readConfig', () => {
    test('returns config or null', () => {
      const config = readConfig()
      if (existsSync(OPENCODE_CONFIG_PATH)) {
        expect(config).not.toBeNull()
        expect(typeof config).toBe('object')
      }
    })
  })

  describe('getDefaultModel', () => {
    test('returns object with providerID and modelID', () => {
      const model = getDefaultModel()
      expect(typeof model.providerID).toBe('string')
      expect(typeof model.modelID).toBe('string')
      expect(model.providerID.length).toBeGreaterThan(0)
      expect(model.modelID.length).toBeGreaterThan(0)
    })
  })
})
