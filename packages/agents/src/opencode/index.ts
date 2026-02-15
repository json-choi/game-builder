export {
  OPENCODE_PORT,
  OPENCODE_BASE_URL,
  OPENCODE_HEALTH_URL,
  OPENCODE_CONFIG_DIR,
  OPENCODE_CONFIG_PATH,
  ensureConfig,
  readConfig,
  getDefaultModel,
  type OpencodeConfig,
} from "./config";

export {
  startServer,
  stopServer,
  checkHealth,
  getServerState,
  type ServerStatus,
} from "./server";

export {
  getClient,
  resetClient,
  setDirectory,
  getDirectory,
  createSession,
  listSessions,
  deleteSession,
  sendPrompt,
  sendPromptAsync,
  respondToPermission,
  replyToQuestion,
  rejectQuestion,
  listAgents,
  subscribeEvents,
  type OpencodeClient,
  type SessionInfo,
  type ImageAttachment,
  type PromptOptions,
  type PromptResponse,
  type SSEEvent,
} from "./client";

export {
  getProviders,
  setAuthKey,
  getAuthStatus,
  removeAuth,
  getActiveProvider,
  setActiveProvider,
  getStoredKey,
  getAgentConfigs,
  setAgentConfigs,
  PROVIDER_PRESETS,
  type ProviderPreset,
  type ProviderModel,
} from "./providers";

export {
  GameCoderAgent,
  type GenerateOptions,
  type GenerateResult,
  type GameCoderEvent,
  extractFiles,
  type ExtractedFile,
  createProjectTools,
  type ProjectTool,
} from "../game-coder/index";

export {
  type AgentDefinition,
  type AgentExecutionContext,
  type AgentProgressEvent,
  type OrchestrationPlan,
  type PlanStep,
  type AgentResult,
  registerAgent,
  getAgent,
  listRegisteredAgents,
  clearRegistry,
  executeAgent,
  getToolsForAgent,
  isToolAllowed,
  getOrCreateAgentSession,
  clearAgentSessions,
  acquireFileLock,
  createProgressReporter,
  type ProgressReporter,
  orchestrate,
} from "../framework/index";

export { initializeAgents } from "../agents-init";

export {
  VisionAgent,
  type ImageAttachment as VisionImageAttachment,
  type VisionCategory,
  type VisionSeverity,
  type VisionQuality,
  type VisionFinding,
  type VisionResult,
  VISION_AGENT_SYSTEM_PROMPT,
} from "../vision/index";
