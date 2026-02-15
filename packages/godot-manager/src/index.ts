export {
  type GodotVersion,
  MIN_SUPPORTED_VERSION,
  MAX_SUPPORTED_MINOR,
  parseGodotVersion,
  formatVersion,
  compareVersions,
  isVersionCompatible,
  versionCompatibilityMessage,
  getBinaryName,
  getDownloadFilename,
} from "./version.js";

export {
  type DetectionResult,
  detectGodot,
  getArchitecture,
  clearQuarantine,
} from "./detect.js";

export {
  type DownloadOptions,
  type DownloadResult,
  downloadGodot,
  verifySha512,
  computeSha512,
} from "./download.js";

export {
  type GodotCliResult,
  type GodotCliOptions,
  checkOnly,
  runHeadless,
  exportProject,
  getVersion,
  spawnGodotEditor,
  spawnGodotPreview,
} from "./cli.js";

export {
  type GodotProject,
  type CreateProjectOptions,
  isGodotProject,
  parseProjectGodot,
  createProject,
  validateProjectStructure,
} from "./project.js";

export {
  type PreviewStatus,
  type PreviewState,
  type PreviewManager,
  createPreviewManager,
} from "./preview.js";

export {
  parseGodotErrors,
  formatErrorsForAI,
  type GodotError,
} from "./error-parser.js";

export {
  scaffoldProject,
  getAvailableTemplates,
  type ScaffoldOptions,
} from "./scaffold.js";

export {
  type ExportPreset,
  type ExportOptions,
  type ExportResult,
  getExportPresets,
  createDefaultPresets,
  exportProject as exportGodotProject,
  checkExportTemplates,
  getExportTemplateUrl,
} from "./export.js";

export {
  type PluginConfig,
  type GodotPlugin,
  type InstallPluginOptions,
  type PluginInstallResult,
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
} from "./plugin-manager.js";
