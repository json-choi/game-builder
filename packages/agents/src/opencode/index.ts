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
  createSession,
  listSessions,
  deleteSession,
  sendPrompt,
  listAgents,
  subscribeEvents,
  type OpencodeClient,
  type SessionInfo,
  type PromptOptions,
  type PromptResponse,
  type SSEEvent,
} from "./client";
