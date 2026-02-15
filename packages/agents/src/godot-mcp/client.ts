import type {
  GodotProject,
  GodotCliResult,
  PreviewState,
  GodotError,
  ExportPreset,
  ExportResult,
  DetectionResult,
  DownloadResult,
} from '@game-builder/godot-manager'

function logMcp(action: string, params: Record<string, unknown>): void {
  console.log(`[Godot MCP] would call ${action}`, params)
}

export interface CreateProjectRequest {
  path: string
  name: string
  mainScene?: string
  features?: string[]
  viewportWidth?: number
  viewportHeight?: number
}

export interface CreateProjectResult {
  project: GodotProject
}

export async function createProject(request: CreateProjectRequest): Promise<CreateProjectResult> {
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
}

export interface ValidateProjectResult {
  valid: boolean
  errors: string[]
}

export async function validateProject(projectPath: string): Promise<ValidateProjectResult> {
  logMcp('validate_project', { project_path: projectPath })
  return { valid: true, errors: [] }
}

export async function parseProject(projectPath: string): Promise<GodotProject | null> {
  logMcp('parse_project', { project_path: projectPath })
  return {
    path: projectPath,
    name: 'Placeholder Project',
    configVersion: 5,
    mainScene: null,
    features: ['4.4', 'Forward Plus'],
    valid: true,
  }
}

export interface ScaffoldRequest {
  path: string
  name: string
  template?: string
  viewportWidth?: number
  viewportHeight?: number
}

export interface ScaffoldResult {
  projectPath: string
  template: string
}

export async function scaffoldProject(request: ScaffoldRequest): Promise<ScaffoldResult> {
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
}

export async function listTemplates(): Promise<string[]> {
  logMcp('list_templates', {})
  return ['basic-2d']
}

export interface RunScriptRequest {
  projectPath: string
  scriptPath: string
  godotPath?: string
  timeout?: number
}

export async function checkScript(request: RunScriptRequest): Promise<GodotCliResult> {
  logMcp('check_script', {
    project_path: request.projectPath,
    script_path: request.scriptPath,
    godot_path: request.godotPath,
    timeout: request.timeout,
  })
  return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
}

export async function checkProjectImport(
  projectPath: string,
  options?: { godotPath?: string; timeout?: number },
): Promise<GodotCliResult> {
  logMcp('check_project_import', {
    project_path: projectPath,
    godot_path: options?.godotPath,
    timeout: options?.timeout,
  })
  return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
}

export async function runHeadless(
  projectPath: string,
  extraArgs?: string[],
  options?: { godotPath?: string; timeout?: number },
): Promise<GodotCliResult> {
  logMcp('run_headless', {
    project_path: projectPath,
    extra_args: extraArgs ?? [],
    godot_path: options?.godotPath,
    timeout: options?.timeout,
  })
  return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
}

export async function getGodotVersion(godotPath?: string): Promise<GodotCliResult> {
  logMcp('get_version', { godot_path: godotPath })
  return { exitCode: 0, stdout: '4.4.stable', stderr: '', timedOut: false }
}

export interface PreviewRequest {
  projectPath: string
  position?: { x: number; y: number }
  godotPath?: string
}

export interface PreviewResult {
  status: string
  pid: number | null
}

export async function startPreview(request: PreviewRequest): Promise<PreviewResult> {
  logMcp('start_preview', {
    project_path: request.projectPath,
    position: request.position,
    godot_path: request.godotPath,
  })
  return { status: 'running', pid: 12345 }
}

export async function stopPreview(): Promise<{ stopped: boolean }> {
  logMcp('stop_preview', {})
  return { stopped: true }
}

export async function getPreviewState(): Promise<PreviewState> {
  logMcp('get_preview_state', {})
  return { status: 'idle', pid: null, error: null, output: [] }
}

export interface ExportRequest {
  projectPath: string
  preset: string
  outputPath: string
  debug?: boolean
}

export async function exportProject(request: ExportRequest): Promise<ExportResult> {
  logMcp('export_project', {
    project_path: request.projectPath,
    preset: request.preset,
    output_path: request.outputPath,
    debug: request.debug ?? false,
  })
  return { success: true, outputPath: request.outputPath, duration: 0 }
}

export async function getExportPresets(projectPath: string): Promise<ExportPreset[]> {
  logMcp('get_export_presets', { project_path: projectPath })
  return []
}

export async function createDefaultPresets(
  projectPath: string,
  platform?: string,
): Promise<{ created: boolean }> {
  logMcp('create_default_presets', { project_path: projectPath, platform })
  return { created: true }
}

export interface ParseErrorsRequest {
  output: string
}

export async function parseErrors(request: ParseErrorsRequest): Promise<GodotError[]> {
  logMcp('parse_errors', { output_length: request.output.length })
  return []
}

export async function formatErrorsForAI(errors: GodotError[]): Promise<string> {
  logMcp('format_errors_for_ai', { error_count: errors.length })
  return errors.length === 0 ? 'No errors.' : `Found ${errors.length} error(s).`
}

export async function detectGodot(): Promise<DetectionResult> {
  logMcp('detect_godot', {})
  return { found: false, path: null, version: null }
}

export interface DownloadGodotRequest {
  version?: string
  installDir?: string
}

export async function downloadGodot(
  request: DownloadGodotRequest,
): Promise<DownloadResult> {
  logMcp('download_godot', {
    version: request.version,
    install_dir: request.installDir,
  })
  return {
    binaryPath: '/usr/local/bin/godot',
    version: request.version ?? '4.4',
    alreadyInstalled: false,
  }
}
