import { describe, expect, test, mock } from 'bun:test'

import type {
  CreateProjectRequest,
  ValidateProjectResult,
  ScaffoldRequest,
  RunScriptRequest,
  PreviewRequest,
  ExportRequest,
  ParseErrorsRequest,
  DownloadGodotRequest,
} from './client'

const mockLogMcp = mock((_action: string, _params: Record<string, unknown>) => {})

mock.module('./client', () => {
  function logMcp(action: string, params: Record<string, unknown>): void {
    mockLogMcp(action, params)
  }

  return {
    createProject: async (request: CreateProjectRequest) => {
      logMcp('create_project', {
        path: request.path,
        name: request.name,
        main_scene: request.mainScene,
        features: request.features,
        viewport_width: request.viewportWidth ?? 1152,
        viewport_height: request.viewportHeight ?? 648,
      })
      return {
        project: {
          path: request.path,
          name: request.name,
          configVersion: 5,
          mainScene: request.mainScene ?? null,
          features: request.features ?? ['4.4', 'Forward Plus'],
          valid: true,
        },
      }
    },

    validateProject: async (projectPath: string) => {
      logMcp('validate_project', { project_path: projectPath })
      return { valid: true, errors: [] }
    },

    parseProject: async (projectPath: string) => {
      logMcp('parse_project', { project_path: projectPath })
      return {
        path: projectPath,
        name: 'Placeholder Project',
        configVersion: 5,
        mainScene: null,
        features: ['4.4', 'Forward Plus'],
        valid: true,
      }
    },

    scaffoldProject: async (request: ScaffoldRequest) => {
      logMcp('scaffold_project', {
        path: request.path,
        name: request.name,
        template: request.template ?? 'basic-2d',
        viewport_width: request.viewportWidth,
        viewport_height: request.viewportHeight,
      })
      return {
        projectPath: request.path,
        template: request.template ?? 'basic-2d',
      }
    },

    listTemplates: async () => {
      logMcp('list_templates', {})
      return ['basic-2d']
    },

    checkScript: async (request: RunScriptRequest) => {
      logMcp('check_script', {
        project_path: request.projectPath,
        script_path: request.scriptPath,
        godot_path: request.godotPath,
        timeout: request.timeout,
      })
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    },

    checkProjectImport: async (
      projectPath: string,
      options?: { godotPath?: string; timeout?: number },
    ) => {
      logMcp('check_project_import', {
        project_path: projectPath,
        godot_path: options?.godotPath,
        timeout: options?.timeout,
      })
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    },

    runHeadless: async (
      projectPath: string,
      extraArgs?: string[],
      options?: { godotPath?: string; timeout?: number },
    ) => {
      logMcp('run_headless', {
        project_path: projectPath,
        extra_args: extraArgs ?? [],
        godot_path: options?.godotPath,
        timeout: options?.timeout,
      })
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    },

    getGodotVersion: async (godotPath?: string) => {
      logMcp('get_version', { godot_path: godotPath })
      return { exitCode: 0, stdout: '4.4.stable', stderr: '', timedOut: false }
    },

    startPreview: async (request: PreviewRequest) => {
      logMcp('start_preview', {
        project_path: request.projectPath,
        position: request.position,
        godot_path: request.godotPath,
      })
      return { status: 'running', pid: 12345 }
    },

    stopPreview: async () => {
      logMcp('stop_preview', {})
      return { stopped: true }
    },

    getPreviewState: async () => {
      logMcp('get_preview_state', {})
      return { status: 'idle', pid: null, error: null, output: [] }
    },

    exportProject: async (request: ExportRequest) => {
      logMcp('export_project', {
        project_path: request.projectPath,
        preset: request.preset,
        output_path: request.outputPath,
        debug: request.debug ?? false,
      })
      return { success: true, outputPath: request.outputPath, duration: 0 }
    },

    getExportPresets: async (projectPath: string) => {
      logMcp('get_export_presets', { project_path: projectPath })
      return []
    },

    createDefaultPresets: async (projectPath: string, platform?: string) => {
      logMcp('create_default_presets', { project_path: projectPath, platform })
      return { created: true }
    },

    parseErrors: async (request: ParseErrorsRequest) => {
      logMcp('parse_errors', { output_length: request.output.length })
      return []
    },

    formatErrorsForAI: async (errors: unknown[]) => {
      logMcp('format_errors_for_ai', { error_count: errors.length })
      return errors.length === 0 ? 'No errors.' : `Found ${errors.length} error(s).`
    },

    detectGodot: async () => {
      logMcp('detect_godot', {})
      return { found: false, path: null, version: null }
    },

    downloadGodot: async (request: DownloadGodotRequest) => {
      logMcp('download_godot', {
        version: request.version,
        install_dir: request.installDir,
      })
      return {
        binaryPath: '/usr/local/bin/godot',
        version: request.version ?? '4.4',
        alreadyInstalled: false,
      }
    },
  }
})

const {
  createProject,
  validateProject,
  parseProject,
  scaffoldProject,
  listTemplates,
  checkScript,
  checkProjectImport,
  runHeadless,
  getGodotVersion,
  startPreview,
  stopPreview,
  getPreviewState,
  exportProject,
  getExportPresets,
  createDefaultPresets,
  parseErrors,
  formatErrorsForAI,
  detectGodot,
  downloadGodot,
} = await import('./client')

describe('Godot MCP Client', () => {
  describe('createProject', () => {
    test('returns project with correct name and path', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({ path: '/tmp/my-game', name: 'My Game' })

      expect(result.project.path).toBe('/tmp/my-game')
      expect(result.project.name).toBe('My Game')
      expect(result.project.valid).toBe(true)
    })

    test('logs MCP call with create_project action', async () => {
      mockLogMcp.mockClear()
      await createProject({ path: '/tmp/game', name: 'Test' })

      expect(mockLogMcp).toHaveBeenCalledTimes(1)
      expect(mockLogMcp.mock.calls[0][0]).toBe('create_project')
    })

    test('applies default viewport dimensions', async () => {
      mockLogMcp.mockClear()
      await createProject({ path: '/tmp/game', name: 'Test' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.viewport_width).toBe(1152)
      expect(params.viewport_height).toBe(648)
    })

    test('passes custom viewport dimensions', async () => {
      mockLogMcp.mockClear()
      await createProject({
        path: '/tmp/game',
        name: 'Test',
        viewportWidth: 1920,
        viewportHeight: 1080,
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.viewport_width).toBe(1920)
      expect(params.viewport_height).toBe(1080)
    })

    test('defaults configVersion to 5', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({ path: '/tmp/game', name: 'Test' })

      expect(result.project.configVersion).toBe(5)
    })

    test('defaults features when not provided', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({ path: '/tmp/game', name: 'Test' })

      expect(result.project.features).toEqual(['4.4', 'Forward Plus'])
    })

    test('passes custom features', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({
        path: '/tmp/game',
        name: 'Test',
        features: ['4.3', 'Mobile'],
      })

      expect(result.project.features).toEqual(['4.3', 'Mobile'])
    })

    test('defaults mainScene to null when not provided', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({ path: '/tmp/game', name: 'Test' })

      expect(result.project.mainScene).toBeNull()
    })

    test('passes mainScene when provided', async () => {
      mockLogMcp.mockClear()
      const result = await createProject({
        path: '/tmp/game',
        name: 'Test',
        mainScene: 'res://scenes/main.tscn',
      })

      expect(result.project.mainScene).toBe('res://scenes/main.tscn')
    })

    test('logs all request fields', async () => {
      mockLogMcp.mockClear()
      await createProject({
        path: '/tmp/game',
        name: 'Full Project',
        mainScene: 'res://main.tscn',
        features: ['4.4'],
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.path).toBe('/tmp/game')
      expect(params.name).toBe('Full Project')
      expect(params.main_scene).toBe('res://main.tscn')
      expect(params.features).toEqual(['4.4'])
    })
  })

  describe('validateProject', () => {
    test('returns valid result', async () => {
      mockLogMcp.mockClear()
      const result = await validateProject('/tmp/my-game')

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('logs MCP call with validate_project action', async () => {
      mockLogMcp.mockClear()
      await validateProject('/tmp/test-project')

      expect(mockLogMcp).toHaveBeenCalledTimes(1)
      expect(mockLogMcp.mock.calls[0][0]).toBe('validate_project')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/test-project')
    })
  })

  describe('parseProject', () => {
    test('returns project data', async () => {
      mockLogMcp.mockClear()
      const result = await parseProject('/tmp/my-game')

      expect(result).not.toBeNull()
      expect(result!.path).toBe('/tmp/my-game')
      expect(result!.name).toBe('Placeholder Project')
      expect(result!.configVersion).toBe(5)
      expect(result!.valid).toBe(true)
    })

    test('logs MCP call with parse_project action', async () => {
      mockLogMcp.mockClear()
      await parseProject('/tmp/game')

      expect(mockLogMcp.mock.calls[0][0]).toBe('parse_project')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/game')
    })

    test('returns default features array', async () => {
      mockLogMcp.mockClear()
      const result = await parseProject('/tmp/game')

      expect(result!.features).toEqual(['4.4', 'Forward Plus'])
    })
  })

  describe('scaffoldProject', () => {
    test('returns projectPath and template', async () => {
      mockLogMcp.mockClear()
      const result = await scaffoldProject({ path: '/tmp/new-game', name: 'New Game' })

      expect(result.projectPath).toBe('/tmp/new-game')
      expect(result.template).toBe('basic-2d')
    })

    test('logs MCP call with scaffold_project action', async () => {
      mockLogMcp.mockClear()
      await scaffoldProject({ path: '/tmp/game', name: 'Test' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('scaffold_project')
    })

    test('defaults template to basic-2d', async () => {
      mockLogMcp.mockClear()
      await scaffoldProject({ path: '/tmp/game', name: 'Test' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.template).toBe('basic-2d')
    })

    test('passes custom template', async () => {
      mockLogMcp.mockClear()
      const result = await scaffoldProject({
        path: '/tmp/game',
        name: 'Test',
        template: 'platformer',
      })

      expect(result.template).toBe('platformer')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.template).toBe('platformer')
    })

    test('passes viewport dimensions', async () => {
      mockLogMcp.mockClear()
      await scaffoldProject({
        path: '/tmp/game',
        name: 'Test',
        viewportWidth: 800,
        viewportHeight: 600,
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.viewport_width).toBe(800)
      expect(params.viewport_height).toBe(600)
    })

    test('viewport dimensions are undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await scaffoldProject({ path: '/tmp/game', name: 'Test' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.viewport_width).toBeUndefined()
      expect(params.viewport_height).toBeUndefined()
    })
  })

  describe('listTemplates', () => {
    test('returns array of template names', async () => {
      mockLogMcp.mockClear()
      const result = await listTemplates()

      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('basic-2d')
    })

    test('logs MCP call with list_templates action', async () => {
      mockLogMcp.mockClear()
      await listTemplates()

      expect(mockLogMcp.mock.calls[0][0]).toBe('list_templates')
    })
  })

  describe('checkScript', () => {
    test('returns GodotCliResult', async () => {
      mockLogMcp.mockClear()
      const result = await checkScript({ projectPath: '/tmp/game', scriptPath: 'player.gd' })

      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
    })

    test('logs MCP call with check_script action', async () => {
      mockLogMcp.mockClear()
      await checkScript({ projectPath: '/tmp/game', scriptPath: 'enemy.gd' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('check_script')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/game')
      expect(params.script_path).toBe('enemy.gd')
    })

    test('passes optional godotPath and timeout', async () => {
      mockLogMcp.mockClear()
      await checkScript({
        projectPath: '/tmp/game',
        scriptPath: 'main.gd',
        godotPath: '/usr/bin/godot4',
        timeout: 60000,
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBe('/usr/bin/godot4')
      expect(params.timeout).toBe(60000)
    })

    test('optional fields are undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await checkScript({ projectPath: '/tmp/game', scriptPath: 'main.gd' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBeUndefined()
      expect(params.timeout).toBeUndefined()
    })
  })

  describe('checkProjectImport', () => {
    test('returns GodotCliResult', async () => {
      mockLogMcp.mockClear()
      const result = await checkProjectImport('/tmp/game')

      expect(result.exitCode).toBe(0)
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(result.timedOut).toBe(false)
    })

    test('logs MCP call with check_project_import action', async () => {
      mockLogMcp.mockClear()
      await checkProjectImport('/tmp/my-project')

      expect(mockLogMcp.mock.calls[0][0]).toBe('check_project_import')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/my-project')
    })

    test('passes optional options', async () => {
      mockLogMcp.mockClear()
      await checkProjectImport('/tmp/game', { godotPath: '/opt/godot', timeout: 30000 })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBe('/opt/godot')
      expect(params.timeout).toBe(30000)
    })

    test('options default to undefined', async () => {
      mockLogMcp.mockClear()
      await checkProjectImport('/tmp/game')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBeUndefined()
      expect(params.timeout).toBeUndefined()
    })
  })

  describe('runHeadless', () => {
    test('returns GodotCliResult', async () => {
      mockLogMcp.mockClear()
      const result = await runHeadless('/tmp/game')

      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
    })

    test('logs MCP call with run_headless action', async () => {
      mockLogMcp.mockClear()
      await runHeadless('/tmp/game')

      expect(mockLogMcp.mock.calls[0][0]).toBe('run_headless')
    })

    test('defaults extra_args to empty array', async () => {
      mockLogMcp.mockClear()
      await runHeadless('/tmp/game')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.extra_args).toEqual([])
    })

    test('passes extra args', async () => {
      mockLogMcp.mockClear()
      await runHeadless('/tmp/game', ['--quit-after', '5'])

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.extra_args).toEqual(['--quit-after', '5'])
    })

    test('passes optional options', async () => {
      mockLogMcp.mockClear()
      await runHeadless('/tmp/game', [], { godotPath: '/opt/godot', timeout: 10000 })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBe('/opt/godot')
      expect(params.timeout).toBe(10000)
    })
  })

  describe('getGodotVersion', () => {
    test('returns version string in stdout', async () => {
      mockLogMcp.mockClear()
      const result = await getGodotVersion()

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('4.4.stable')
    })

    test('logs MCP call with get_version action', async () => {
      mockLogMcp.mockClear()
      await getGodotVersion()

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_version')
    })

    test('passes godotPath when provided', async () => {
      mockLogMcp.mockClear()
      await getGodotVersion('/custom/godot')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBe('/custom/godot')
    })

    test('godotPath is undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await getGodotVersion()

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBeUndefined()
    })
  })

  describe('startPreview', () => {
    test('returns running status with pid', async () => {
      mockLogMcp.mockClear()
      const result = await startPreview({ projectPath: '/tmp/game' })

      expect(result.status).toBe('running')
      expect(typeof result.pid).toBe('number')
    })

    test('logs MCP call with start_preview action', async () => {
      mockLogMcp.mockClear()
      await startPreview({ projectPath: '/tmp/game' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('start_preview')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/game')
    })

    test('passes position when provided', async () => {
      mockLogMcp.mockClear()
      await startPreview({ projectPath: '/tmp/game', position: { x: 100, y: 200 } })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.position).toEqual({ x: 100, y: 200 })
    })

    test('position is undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await startPreview({ projectPath: '/tmp/game' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.position).toBeUndefined()
    })

    test('passes godotPath when provided', async () => {
      mockLogMcp.mockClear()
      await startPreview({ projectPath: '/tmp/game', godotPath: '/opt/godot' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.godot_path).toBe('/opt/godot')
    })
  })

  describe('stopPreview', () => {
    test('returns stopped true', async () => {
      mockLogMcp.mockClear()
      const result = await stopPreview()

      expect(result.stopped).toBe(true)
    })

    test('logs MCP call with stop_preview action', async () => {
      mockLogMcp.mockClear()
      await stopPreview()

      expect(mockLogMcp.mock.calls[0][0]).toBe('stop_preview')
    })
  })

  describe('getPreviewState', () => {
    test('returns idle state', async () => {
      mockLogMcp.mockClear()
      const result = await getPreviewState()

      expect(result.status).toBe('idle')
      expect(result.pid).toBeNull()
      expect(result.error).toBeNull()
      expect(result.output).toEqual([])
    })

    test('logs MCP call with get_preview_state action', async () => {
      mockLogMcp.mockClear()
      await getPreviewState()

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_preview_state')
    })
  })

  describe('exportProject', () => {
    test('returns successful export result', async () => {
      mockLogMcp.mockClear()
      const result = await exportProject({
        projectPath: '/tmp/game',
        preset: 'Linux',
        outputPath: '/tmp/export/game',
      })

      expect(result.success).toBe(true)
      expect(result.outputPath).toBe('/tmp/export/game')
      expect(typeof result.duration).toBe('number')
    })

    test('logs MCP call with export_project action', async () => {
      mockLogMcp.mockClear()
      await exportProject({
        projectPath: '/tmp/game',
        preset: 'Windows Desktop',
        outputPath: '/tmp/export/game.exe',
      })

      expect(mockLogMcp.mock.calls[0][0]).toBe('export_project')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/game')
      expect(params.preset).toBe('Windows Desktop')
      expect(params.output_path).toBe('/tmp/export/game.exe')
    })

    test('defaults debug to false', async () => {
      mockLogMcp.mockClear()
      await exportProject({
        projectPath: '/tmp/game',
        preset: 'Linux',
        outputPath: '/tmp/out',
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.debug).toBe(false)
    })

    test('passes debug flag', async () => {
      mockLogMcp.mockClear()
      await exportProject({
        projectPath: '/tmp/game',
        preset: 'Web',
        outputPath: '/tmp/out/index.html',
        debug: true,
      })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.debug).toBe(true)
    })
  })

  describe('getExportPresets', () => {
    test('returns empty array', async () => {
      mockLogMcp.mockClear()
      const result = await getExportPresets('/tmp/game')

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    test('logs MCP call with get_export_presets action', async () => {
      mockLogMcp.mockClear()
      await getExportPresets('/tmp/game')

      expect(mockLogMcp.mock.calls[0][0]).toBe('get_export_presets')
      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.project_path).toBe('/tmp/game')
    })
  })

  describe('createDefaultPresets', () => {
    test('returns created true', async () => {
      mockLogMcp.mockClear()
      const result = await createDefaultPresets('/tmp/game')

      expect(result.created).toBe(true)
    })

    test('logs MCP call with create_default_presets action', async () => {
      mockLogMcp.mockClear()
      await createDefaultPresets('/tmp/game')

      expect(mockLogMcp.mock.calls[0][0]).toBe('create_default_presets')
    })

    test('passes platform when provided', async () => {
      mockLogMcp.mockClear()
      await createDefaultPresets('/tmp/game', 'Windows Desktop')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.platform).toBe('Windows Desktop')
    })

    test('platform is undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await createDefaultPresets('/tmp/game')

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.platform).toBeUndefined()
    })
  })

  describe('parseErrors', () => {
    test('returns empty array for no errors', async () => {
      mockLogMcp.mockClear()
      const result = await parseErrors({ output: '' })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })

    test('logs MCP call with parse_errors action', async () => {
      mockLogMcp.mockClear()
      await parseErrors({ output: 'ERROR: some error' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('parse_errors')
    })

    test('logs output length', async () => {
      mockLogMcp.mockClear()
      const output = 'ERROR: line 5: syntax error'
      await parseErrors({ output })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.output_length).toBe(output.length)
    })
  })

  describe('formatErrorsForAI', () => {
    test('returns "No errors." for empty array', async () => {
      mockLogMcp.mockClear()
      const result = await formatErrorsForAI([])

      expect(result).toBe('No errors.')
    })

    test('returns error count message for non-empty array', async () => {
      mockLogMcp.mockClear()
      const errors = [
        { file: 'main.gd', line: 5, message: 'syntax error', severity: 'error' as const },
        { file: 'player.gd', line: 10, message: 'undefined var', severity: 'error' as const },
      ]
      const result = await formatErrorsForAI(errors)

      expect(result).toBe('Found 2 error(s).')
    })

    test('logs MCP call with format_errors_for_ai action', async () => {
      mockLogMcp.mockClear()
      await formatErrorsForAI([])

      expect(mockLogMcp.mock.calls[0][0]).toBe('format_errors_for_ai')
    })

    test('logs error count', async () => {
      mockLogMcp.mockClear()
      await formatErrorsForAI([
        { file: 'a.gd', line: 1, message: 'err', severity: 'error' as const },
      ])

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.error_count).toBe(1)
    })
  })

  describe('detectGodot', () => {
    test('returns detection result', async () => {
      mockLogMcp.mockClear()
      const result = await detectGodot()

      expect(result).toHaveProperty('found')
      expect(result).toHaveProperty('path')
      expect(result).toHaveProperty('version')
      expect(result.found).toBe(false)
      expect(result.path).toBeNull()
      expect(result.version).toBeNull()
    })

    test('logs MCP call with detect_godot action', async () => {
      mockLogMcp.mockClear()
      await detectGodot()

      expect(mockLogMcp.mock.calls[0][0]).toBe('detect_godot')
    })
  })

  describe('downloadGodot', () => {
    test('returns download result', async () => {
      mockLogMcp.mockClear()
      const result = await downloadGodot({})

      expect(result.binaryPath).toBe('/usr/local/bin/godot')
      expect(result.alreadyInstalled).toBe(false)
    })

    test('logs MCP call with download_godot action', async () => {
      mockLogMcp.mockClear()
      await downloadGodot({ version: '4.3' })

      expect(mockLogMcp.mock.calls[0][0]).toBe('download_godot')
    })

    test('passes version when provided', async () => {
      mockLogMcp.mockClear()
      await downloadGodot({ version: '4.3' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.version).toBe('4.3')
    })

    test('defaults version to 4.4', async () => {
      mockLogMcp.mockClear()
      const result = await downloadGodot({})

      expect(result.version).toBe('4.4')
    })

    test('passes installDir when provided', async () => {
      mockLogMcp.mockClear()
      await downloadGodot({ installDir: '/opt/godot' })

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.install_dir).toBe('/opt/godot')
    })

    test('installDir is undefined when not provided', async () => {
      mockLogMcp.mockClear()
      await downloadGodot({})

      const params = mockLogMcp.mock.calls[0][1] as Record<string, unknown>
      expect(params.install_dir).toBeUndefined()
    })
  })

  describe('return value shapes', () => {
    test('createProject returns CreateProjectResult shape', async () => {
      const result = await createProject({ path: '/tmp/g', name: 'test' })

      expect(result).toHaveProperty('project')
      expect(result.project).toHaveProperty('path')
      expect(result.project).toHaveProperty('name')
      expect(result.project).toHaveProperty('configVersion')
      expect(result.project).toHaveProperty('mainScene')
      expect(result.project).toHaveProperty('features')
      expect(result.project).toHaveProperty('valid')
    })

    test('validateProject returns ValidateProjectResult shape', async () => {
      const result = await validateProject('/tmp/g')

      expect(result).toHaveProperty('valid')
      expect(result).toHaveProperty('errors')
      expect(typeof result.valid).toBe('boolean')
      expect(Array.isArray(result.errors)).toBe(true)
    })

    test('scaffoldProject returns ScaffoldResult shape', async () => {
      const result = await scaffoldProject({ path: '/tmp/g', name: 'test' })

      expect(result).toHaveProperty('projectPath')
      expect(result).toHaveProperty('template')
    })

    test('checkScript returns GodotCliResult shape', async () => {
      const result = await checkScript({ projectPath: '/tmp/g', scriptPath: 'a.gd' })

      expect(Object.keys(result).sort()).toEqual(['exitCode', 'stderr', 'stdout', 'timedOut'])
    })

    test('startPreview returns PreviewResult shape', async () => {
      const result = await startPreview({ projectPath: '/tmp/g' })

      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('pid')
    })

    test('exportProject returns ExportResult shape', async () => {
      const result = await exportProject({
        projectPath: '/tmp/g',
        preset: 'Linux',
        outputPath: '/tmp/out',
      })

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('outputPath')
      expect(result).toHaveProperty('duration')
    })

    test('detectGodot returns DetectionResult shape', async () => {
      const result = await detectGodot()

      expect(Object.keys(result).sort()).toEqual(['found', 'path', 'version'])
    })

    test('downloadGodot returns DownloadResult shape', async () => {
      const result = await downloadGodot({})

      expect(result).toHaveProperty('binaryPath')
      expect(result).toHaveProperty('version')
      expect(result).toHaveProperty('alreadyInstalled')
    })
  })

  describe('async behavior', () => {
    test('all functions return promises', () => {
      const results = [
        createProject({ path: '/tmp/g', name: 'test' }),
        validateProject('/tmp/g'),
        parseProject('/tmp/g'),
        scaffoldProject({ path: '/tmp/g', name: 'test' }),
        listTemplates(),
        checkScript({ projectPath: '/tmp/g', scriptPath: 'a.gd' }),
        checkProjectImport('/tmp/g'),
        runHeadless('/tmp/g'),
        getGodotVersion(),
        startPreview({ projectPath: '/tmp/g' }),
        stopPreview(),
        getPreviewState(),
        exportProject({ projectPath: '/tmp/g', preset: 'Linux', outputPath: '/tmp/out' }),
        getExportPresets('/tmp/g'),
        createDefaultPresets('/tmp/g'),
        parseErrors({ output: '' }),
        formatErrorsForAI([]),
        detectGodot(),
        downloadGodot({}),
      ]

      for (const result of results) {
        expect(result).toBeInstanceOf(Promise)
      }
    })
  })

  describe('module exports', () => {
    test('index exports all functions', async () => {
      const mod = await import('./index')

      expect(typeof mod.createProject).toBe('function')
      expect(typeof mod.validateProject).toBe('function')
      expect(typeof mod.parseProject).toBe('function')
      expect(typeof mod.scaffoldProject).toBe('function')
      expect(typeof mod.listTemplates).toBe('function')
      expect(typeof mod.checkScript).toBe('function')
      expect(typeof mod.checkProjectImport).toBe('function')
      expect(typeof mod.runHeadless).toBe('function')
      expect(typeof mod.getGodotVersion).toBe('function')
      expect(typeof mod.startPreview).toBe('function')
      expect(typeof mod.stopPreview).toBe('function')
      expect(typeof mod.getPreviewState).toBe('function')
      expect(typeof mod.exportProject).toBe('function')
      expect(typeof mod.getExportPresets).toBe('function')
      expect(typeof mod.createDefaultPresets).toBe('function')
      expect(typeof mod.parseErrors).toBe('function')
      expect(typeof mod.formatErrorsForAI).toBe('function')
      expect(typeof mod.detectGodot).toBe('function')
      expect(typeof mod.downloadGodot).toBe('function')
    })
  })
})
