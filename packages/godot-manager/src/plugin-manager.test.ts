import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  parsePluginCfg,
  readPluginConfig,
  getEnabledPlugins,
  listPlugins,
  getPlugin,
  installPlugin,
  removePlugin,
  enablePlugin,
  disablePlugin,
  validatePluginStructure,
} from './plugin-manager'

let testDir: string

beforeEach(() => {
  const id = `plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  testDir = join(tmpdir(), id)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
})

const VALID_PLUGIN_CFG = `[plugin]

name="Test Plugin"
description="A test plugin for unit testing"
author="Test Author"
version="1.0.0"
script="plugin.gd"
`

const VALID_PROJECT_GODOT = `; Engine configuration file.
config_version=5

[application]

config/name="Test Game"
config/features=PackedStringArray("4.4", "Forward Plus")

[display]

window/size/viewport_width=1152
window/size/viewport_height=648
`

const PROJECT_WITH_PLUGINS = `; Engine configuration file.
config_version=5

[application]

config/name="Test Game"

[editor_plugins]

enabled=PackedStringArray("res://addons/my_plugin/plugin.gd", "res://addons/other_plugin/main.gd")
`

function createProjectDir(): string {
  writeFileSync(join(testDir, 'project.godot'), VALID_PROJECT_GODOT)
  return testDir
}

function createPluginSource(name: string, overrides: Partial<{ cfg: string; script: string; scriptContent: string }> = {}): string {
  const pluginDir = join(testDir, 'sources', name)
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(join(pluginDir, 'plugin.cfg'), overrides.cfg ?? VALID_PLUGIN_CFG)
  writeFileSync(join(pluginDir, overrides.script ?? 'plugin.gd'), overrides.scriptContent ?? '@tool\nextends EditorPlugin\n')
  return pluginDir
}

function installTestPlugin(projectPath: string, pluginId: string, cfg?: string): void {
  const addonsDir = join(projectPath, 'addons', pluginId)
  mkdirSync(addonsDir, { recursive: true })
  writeFileSync(join(addonsDir, 'plugin.cfg'), cfg ?? VALID_PLUGIN_CFG)
  writeFileSync(join(addonsDir, 'plugin.gd'), '@tool\nextends EditorPlugin\n')
}

describe('plugin-manager', () => {
  describe('parsePluginCfg', () => {
    test('parses valid plugin.cfg content', () => {
      const config = parsePluginCfg(VALID_PLUGIN_CFG)
      expect(config).not.toBeNull()
      expect(config!.name).toBe('Test Plugin')
      expect(config!.description).toBe('A test plugin for unit testing')
      expect(config!.author).toBe('Test Author')
      expect(config!.version).toBe('1.0.0')
      expect(config!.script).toBe('plugin.gd')
    })

    test('returns null when [plugin] section is missing', () => {
      expect(parsePluginCfg('name="No Section"\nscript="plugin.gd"')).toBeNull()
    })

    test('returns null when name is missing', () => {
      expect(parsePluginCfg('[plugin]\nscript="plugin.gd"')).toBeNull()
    })

    test('returns null when script is missing', () => {
      expect(parsePluginCfg('[plugin]\nname="No Script"')).toBeNull()
    })

    test('defaults description to empty string when absent', () => {
      const cfg = '[plugin]\nname="Minimal"\nscript="plugin.gd"'
      const config = parsePluginCfg(cfg)
      expect(config!.description).toBe('')
    })

    test('defaults author to empty string when absent', () => {
      const cfg = '[plugin]\nname="Minimal"\nscript="plugin.gd"'
      const config = parsePluginCfg(cfg)
      expect(config!.author).toBe('')
    })

    test('defaults version to empty string when absent', () => {
      const cfg = '[plugin]\nname="Minimal"\nscript="plugin.gd"'
      const config = parsePluginCfg(cfg)
      expect(config!.version).toBe('')
    })

    test('returns null for empty string', () => {
      expect(parsePluginCfg('')).toBeNull()
    })

    test('parses plugin.cfg with extra whitespace and sections', () => {
      const cfg = `[gd_resource]

some_data=123

[plugin]

name="Spaced Plugin"
description="Has spaces"
author="Someone"
version="2.0.0"
script="main.gd"

[dependencies]

other="thing"
`
      const config = parsePluginCfg(cfg)
      expect(config!.name).toBe('Spaced Plugin')
      expect(config!.script).toBe('main.gd')
      expect(config!.version).toBe('2.0.0')
    })
  })

  describe('readPluginConfig', () => {
    test('reads and parses plugin.cfg from directory', () => {
      const pluginDir = join(testDir, 'my_plugin')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(pluginDir, 'plugin.cfg'), VALID_PLUGIN_CFG)

      const config = readPluginConfig(pluginDir)
      expect(config).not.toBeNull()
      expect(config!.name).toBe('Test Plugin')
    })

    test('returns null when plugin.cfg does not exist', () => {
      expect(readPluginConfig(testDir)).toBeNull()
    })

    test('returns null for non-existent directory', () => {
      expect(readPluginConfig(join(testDir, 'nonexistent'))).toBeNull()
    })

    test('returns null when plugin.cfg is invalid', () => {
      const pluginDir = join(testDir, 'bad_plugin')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(pluginDir, 'plugin.cfg'), 'not a valid config')

      expect(readPluginConfig(pluginDir)).toBeNull()
    })
  })

  describe('getEnabledPlugins', () => {
    test('returns empty array when project.godot does not exist', () => {
      expect(getEnabledPlugins(testDir)).toEqual([])
    })

    test('returns empty array when no [editor_plugins] section', () => {
      createProjectDir()
      expect(getEnabledPlugins(testDir)).toEqual([])
    })

    test('returns plugin IDs from [editor_plugins] section', () => {
      writeFileSync(join(testDir, 'project.godot'), PROJECT_WITH_PLUGINS)
      const ids = getEnabledPlugins(testDir)
      expect(ids).toEqual(['my_plugin', 'other_plugin'])
    })

    test('returns empty array when enabled line is empty', () => {
      const content = `${VALID_PROJECT_GODOT}\n[editor_plugins]\n\nenabled=PackedStringArray()\n`
      writeFileSync(join(testDir, 'project.godot'), content)
      expect(getEnabledPlugins(testDir)).toEqual([])
    })

    test('handles single enabled plugin', () => {
      const content = `${VALID_PROJECT_GODOT}\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/single_plugin/plugin.gd")\n`
      writeFileSync(join(testDir, 'project.godot'), content)
      expect(getEnabledPlugins(testDir)).toEqual(['single_plugin'])
    })
  })

  describe('listPlugins', () => {
    test('returns empty array when no addons directory', () => {
      createProjectDir()
      expect(listPlugins(testDir)).toEqual([])
    })

    test('returns empty array when addons directory is empty', () => {
      createProjectDir()
      mkdirSync(join(testDir, 'addons'))
      expect(listPlugins(testDir)).toEqual([])
    })

    test('lists installed plugins with correct metadata', () => {
      createProjectDir()
      installTestPlugin(testDir, 'test_plugin')

      const plugins = listPlugins(testDir)
      expect(plugins).toHaveLength(1)
      expect(plugins[0].id).toBe('test_plugin')
      expect(plugins[0].config.name).toBe('Test Plugin')
      expect(plugins[0].enabled).toBe(false)
    })

    test('marks enabled plugins correctly', () => {
      writeFileSync(join(testDir, 'project.godot'), PROJECT_WITH_PLUGINS)
      installTestPlugin(testDir, 'my_plugin')
      installTestPlugin(testDir, 'other_plugin', VALID_PLUGIN_CFG.replace('plugin.gd', 'main.gd'))
      writeFileSync(join(testDir, 'addons', 'other_plugin', 'main.gd'), '@tool\n')

      const plugins = listPlugins(testDir)
      const myPlugin = plugins.find((p) => p.id === 'my_plugin')
      const otherPlugin = plugins.find((p) => p.id === 'other_plugin')
      expect(myPlugin!.enabled).toBe(true)
      expect(otherPlugin!.enabled).toBe(true)
    })

    test('lists multiple plugins sorted alphabetically', () => {
      createProjectDir()
      installTestPlugin(testDir, 'zebra_plugin')
      installTestPlugin(testDir, 'alpha_plugin')
      installTestPlugin(testDir, 'middle_plugin')

      const plugins = listPlugins(testDir)
      expect(plugins.map((p) => p.id)).toEqual(['alpha_plugin', 'middle_plugin', 'zebra_plugin'])
    })

    test('skips directories without valid plugin.cfg', () => {
      createProjectDir()
      installTestPlugin(testDir, 'valid_plugin')
      mkdirSync(join(testDir, 'addons', 'not_a_plugin'), { recursive: true })
      writeFileSync(join(testDir, 'addons', 'not_a_plugin', 'readme.txt'), 'hi')

      const plugins = listPlugins(testDir)
      expect(plugins).toHaveLength(1)
      expect(plugins[0].id).toBe('valid_plugin')
    })

    test('skips files in addons directory (non-directories)', () => {
      createProjectDir()
      installTestPlugin(testDir, 'valid_plugin')
      writeFileSync(join(testDir, 'addons', '.gitkeep'), '')

      const plugins = listPlugins(testDir)
      expect(plugins).toHaveLength(1)
    })
  })

  describe('getPlugin', () => {
    test('returns plugin by ID', () => {
      createProjectDir()
      installTestPlugin(testDir, 'my_plugin')

      const plugin = getPlugin(testDir, 'my_plugin')
      expect(plugin).not.toBeNull()
      expect(plugin!.id).toBe('my_plugin')
      expect(plugin!.config.name).toBe('Test Plugin')
    })

    test('returns null for non-installed plugin', () => {
      createProjectDir()
      expect(getPlugin(testDir, 'nonexistent')).toBeNull()
    })

    test('includes enabled status', () => {
      writeFileSync(join(testDir, 'project.godot'), PROJECT_WITH_PLUGINS)
      installTestPlugin(testDir, 'my_plugin')

      const plugin = getPlugin(testDir, 'my_plugin')
      expect(plugin!.enabled).toBe(true)
    })

    test('returns disabled status when not in enabled list', () => {
      createProjectDir()
      installTestPlugin(testDir, 'disabled_plugin')

      const plugin = getPlugin(testDir, 'disabled_plugin')
      expect(plugin!.enabled).toBe(false)
    })
  })

  describe('installPlugin', () => {
    test('installs plugin from source directory', () => {
      createProjectDir()
      const source = createPluginSource('my_plugin')

      const result = installPlugin(testDir, 'my_plugin', { sourcePath: source })
      expect(result.success).toBe(true)
      expect(result.pluginId).toBe('my_plugin')
      expect(existsSync(join(testDir, 'addons', 'my_plugin', 'plugin.cfg'))).toBe(true)
      expect(existsSync(join(testDir, 'addons', 'my_plugin', 'plugin.gd'))).toBe(true)
    })

    test('creates addons directory if it does not exist', () => {
      createProjectDir()
      const source = createPluginSource('new_plugin')

      expect(existsSync(join(testDir, 'addons'))).toBe(false)
      installPlugin(testDir, 'new_plugin', { sourcePath: source })
      expect(existsSync(join(testDir, 'addons', 'new_plugin'))).toBe(true)
    })

    test('fails when source has no valid plugin.cfg', () => {
      createProjectDir()
      const badSource = join(testDir, 'sources', 'bad')
      mkdirSync(badSource, { recursive: true })
      writeFileSync(join(badSource, 'readme.txt'), 'not a plugin')

      const result = installPlugin(testDir, 'bad', { sourcePath: badSource })
      expect(result.success).toBe(false)
      expect(result.error).toContain('valid plugin.cfg')
    })

    test('fails when plugin already installed and overwrite is false', () => {
      createProjectDir()
      const source = createPluginSource('dupe_plugin')
      installPlugin(testDir, 'dupe_plugin', { sourcePath: source })

      const result = installPlugin(testDir, 'dupe_plugin', { sourcePath: source })
      expect(result.success).toBe(false)
      expect(result.error).toContain('already installed')
    })

    test('overwrites existing plugin when overwrite is true', () => {
      createProjectDir()
      const source = createPluginSource('upgrade_plugin')
      installPlugin(testDir, 'upgrade_plugin', { sourcePath: source })

      const updatedCfg = VALID_PLUGIN_CFG.replace('version="1.0.0"', 'version="2.0.0"')
      writeFileSync(join(source, 'plugin.cfg'), updatedCfg)

      const result = installPlugin(testDir, 'upgrade_plugin', { sourcePath: source, overwrite: true })
      expect(result.success).toBe(true)

      const config = readPluginConfig(join(testDir, 'addons', 'upgrade_plugin'))
      expect(config!.version).toBe('2.0.0')
    })

    test('copies nested directory structure', () => {
      createProjectDir()
      const source = createPluginSource('nested_plugin')
      mkdirSync(join(source, 'icons'), { recursive: true })
      writeFileSync(join(source, 'icons', 'icon.svg'), '<svg/>')
      mkdirSync(join(source, 'scripts', 'helpers'), { recursive: true })
      writeFileSync(join(source, 'scripts', 'helpers', 'util.gd'), 'extends Node\n')

      installPlugin(testDir, 'nested_plugin', { sourcePath: source })

      expect(existsSync(join(testDir, 'addons', 'nested_plugin', 'icons', 'icon.svg'))).toBe(true)
      expect(existsSync(join(testDir, 'addons', 'nested_plugin', 'scripts', 'helpers', 'util.gd'))).toBe(true)
    })
  })

  describe('removePlugin', () => {
    test('removes installed plugin directory', () => {
      createProjectDir()
      installTestPlugin(testDir, 'to_remove')

      expect(removePlugin(testDir, 'to_remove')).toBe(true)
      expect(existsSync(join(testDir, 'addons', 'to_remove'))).toBe(false)
    })

    test('returns false for non-installed plugin', () => {
      createProjectDir()
      expect(removePlugin(testDir, 'nonexistent')).toBe(false)
    })

    test('disables plugin in project.godot before removing', () => {
      writeFileSync(join(testDir, 'project.godot'), PROJECT_WITH_PLUGINS)
      installTestPlugin(testDir, 'my_plugin')

      expect(getEnabledPlugins(testDir)).toContain('my_plugin')
      removePlugin(testDir, 'my_plugin')
      expect(getEnabledPlugins(testDir)).not.toContain('my_plugin')
    })

    test('does not affect other enabled plugins when removing one', () => {
      writeFileSync(join(testDir, 'project.godot'), PROJECT_WITH_PLUGINS)
      installTestPlugin(testDir, 'my_plugin')
      installTestPlugin(testDir, 'other_plugin', VALID_PLUGIN_CFG.replace('plugin.gd', 'main.gd'))
      writeFileSync(join(testDir, 'addons', 'other_plugin', 'main.gd'), '@tool\n')

      removePlugin(testDir, 'my_plugin')
      expect(getEnabledPlugins(testDir)).toContain('other_plugin')
    })
  })

  describe('enablePlugin', () => {
    test('enables an installed plugin', () => {
      createProjectDir()
      installTestPlugin(testDir, 'to_enable')

      expect(enablePlugin(testDir, 'to_enable')).toBe(true)
      expect(getEnabledPlugins(testDir)).toContain('to_enable')
    })

    test('returns false for non-installed plugin', () => {
      createProjectDir()
      expect(enablePlugin(testDir, 'nonexistent')).toBe(false)
    })

    test('returns false when plugin is already enabled', () => {
      createProjectDir()
      installTestPlugin(testDir, 'already_on')
      enablePlugin(testDir, 'already_on')

      expect(enablePlugin(testDir, 'already_on')).toBe(false)
    })

    test('writes [editor_plugins] section to project.godot', () => {
      createProjectDir()
      installTestPlugin(testDir, 'new_enabled')
      enablePlugin(testDir, 'new_enabled')

      const content = readFileSync(join(testDir, 'project.godot'), 'utf-8')
      expect(content).toContain('[editor_plugins]')
      expect(content).toContain('res://addons/new_enabled/plugin.gd')
    })

    test('enables multiple plugins', () => {
      createProjectDir()
      installTestPlugin(testDir, 'plugin_a')
      installTestPlugin(testDir, 'plugin_b')

      enablePlugin(testDir, 'plugin_a')
      enablePlugin(testDir, 'plugin_b')

      const enabled = getEnabledPlugins(testDir)
      expect(enabled).toContain('plugin_a')
      expect(enabled).toContain('plugin_b')
    })

    test('preserves existing project.godot content', () => {
      createProjectDir()
      installTestPlugin(testDir, 'preserve_test')
      enablePlugin(testDir, 'preserve_test')

      const content = readFileSync(join(testDir, 'project.godot'), 'utf-8')
      expect(content).toContain('config/name="Test Game"')
      expect(content).toContain('config_version=5')
    })
  })

  describe('disablePlugin', () => {
    test('disables an enabled plugin', () => {
      createProjectDir()
      installTestPlugin(testDir, 'to_disable')
      enablePlugin(testDir, 'to_disable')

      expect(disablePlugin(testDir, 'to_disable')).toBe(true)
      expect(getEnabledPlugins(testDir)).not.toContain('to_disable')
    })

    test('returns false when plugin is not enabled', () => {
      createProjectDir()
      expect(disablePlugin(testDir, 'not_enabled')).toBe(false)
    })

    test('does not affect other enabled plugins', () => {
      createProjectDir()
      installTestPlugin(testDir, 'keep_enabled')
      installTestPlugin(testDir, 'to_disable')
      enablePlugin(testDir, 'keep_enabled')
      enablePlugin(testDir, 'to_disable')

      disablePlugin(testDir, 'to_disable')
      expect(getEnabledPlugins(testDir)).toContain('keep_enabled')
      expect(getEnabledPlugins(testDir)).not.toContain('to_disable')
    })
  })

  describe('validatePluginStructure', () => {
    test('returns valid for correct plugin structure', () => {
      const pluginDir = join(testDir, 'valid_plugin')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(pluginDir, 'plugin.cfg'), VALID_PLUGIN_CFG)
      writeFileSync(join(pluginDir, 'plugin.gd'), '@tool\nextends EditorPlugin\n')

      const result = validatePluginStructure(pluginDir)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('returns invalid for non-existent directory', () => {
      const result = validatePluginStructure(join(testDir, 'nonexistent'))
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('does not exist')
    })

    test('returns error for missing plugin.cfg', () => {
      const pluginDir = join(testDir, 'no_cfg')
      mkdirSync(pluginDir, { recursive: true })

      const result = validatePluginStructure(pluginDir)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing plugin.cfg')
    })

    test('returns error for invalid plugin.cfg', () => {
      const pluginDir = join(testDir, 'bad_cfg')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(pluginDir, 'plugin.cfg'), 'garbage data')

      const result = validatePluginStructure(pluginDir)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid plugin.cfg'))).toBe(true)
    })

    test('returns error when referenced script does not exist', () => {
      const pluginDir = join(testDir, 'missing_script')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(pluginDir, 'plugin.cfg'), VALID_PLUGIN_CFG)

      const result = validatePluginStructure(pluginDir)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Referenced script not found'))).toBe(true)
    })

    test('returns error when version is empty', () => {
      const pluginDir = join(testDir, 'no_version')
      mkdirSync(pluginDir, { recursive: true })
      const cfg = '[plugin]\nname="No Version"\nscript="plugin.gd"\nversion=""'
      writeFileSync(join(pluginDir, 'plugin.cfg'), cfg)
      writeFileSync(join(pluginDir, 'plugin.gd'), '@tool\n')

      const result = validatePluginStructure(pluginDir)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('version is empty'))).toBe(true)
    })
  })

  describe('integration: install → enable → disable → remove', () => {
    test('full lifecycle works end-to-end', () => {
      createProjectDir()
      const source = createPluginSource('lifecycle_plugin')

      const installResult = installPlugin(testDir, 'lifecycle_plugin', { sourcePath: source })
      expect(installResult.success).toBe(true)

      let plugins = listPlugins(testDir)
      expect(plugins).toHaveLength(1)
      expect(plugins[0].enabled).toBe(false)

      expect(enablePlugin(testDir, 'lifecycle_plugin')).toBe(true)
      plugins = listPlugins(testDir)
      expect(plugins[0].enabled).toBe(true)

      expect(disablePlugin(testDir, 'lifecycle_plugin')).toBe(true)
      plugins = listPlugins(testDir)
      expect(plugins[0].enabled).toBe(false)

      expect(removePlugin(testDir, 'lifecycle_plugin')).toBe(true)
      expect(listPlugins(testDir)).toEqual([])
    })

    test('install and enable multiple plugins then remove one', () => {
      createProjectDir()
      const sourceA = createPluginSource('plugin_a')
      const sourceB = createPluginSource('plugin_b')

      installPlugin(testDir, 'plugin_a', { sourcePath: sourceA })
      installPlugin(testDir, 'plugin_b', { sourcePath: sourceB })
      enablePlugin(testDir, 'plugin_a')
      enablePlugin(testDir, 'plugin_b')

      expect(listPlugins(testDir)).toHaveLength(2)
      expect(getEnabledPlugins(testDir)).toHaveLength(2)

      removePlugin(testDir, 'plugin_a')
      expect(listPlugins(testDir)).toHaveLength(1)
      expect(getEnabledPlugins(testDir)).toEqual(['plugin_b'])
    })
  })
})
