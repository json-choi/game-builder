import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPENCODE_CONFIG_DIR } from "./config";
import { getClient } from "./client";

export interface ProviderModel {
  id: string;
  name: string;
  thinking?: boolean;
  attachment?: boolean;
  limit?: { context?: number; output?: number };
}

export interface ProviderPreset {
  id: string;
  name: string;
  envVar: string;
  models: ProviderModel[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    models: [
      {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        thinking: true,
        attachment: true,
        limit: { context: 1000000, output: 64000 },
      },
      {
        id: "anthropic/claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        thinking: true,
        limit: { context: 200000, output: 8192 },
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        thinking: true,
        attachment: true,
        limit: { context: 200000, output: 32000 },
      },
      {
        id: "openai/gpt-5.2",
        name: "GPT 5.2",
        thinking: true,
        limit: { context: 272000, output: 128000 },
      },
      {
        id: "google/gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        thinking: true,
        attachment: true,
        limit: { context: 1048576, output: 65536 },
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      {
        id: "claude-sonnet-4-5-20250514",
        name: "Claude Sonnet 4.5",
        thinking: true,
        attachment: true,
        limit: { context: 200000, output: 64000 },
      },
      {
        id: "claude-haiku-4-5-20250514",
        name: "Claude Haiku 4.5",
        thinking: true,
        limit: { context: 200000, output: 8192 },
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        limit: { context: 128000, output: 16384 },
      },
      {
        id: "o3-mini",
        name: "o3-mini",
        thinking: true,
        limit: { context: 200000, output: 100000 },
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    envVar: "GOOGLE_API_KEY",
    models: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        thinking: true,
        attachment: true,
        limit: { context: 1048576, output: 65536 },
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        attachment: true,
        limit: { context: 1048576, output: 65536 },
      },
    ],
  },
];

export function getProviders(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

export async function setAuthKey(providerId: string, apiKey: string): Promise<void> {
  saveKeyLocally(providerId, apiKey);
  const client = getClient();
  await client.auth.set({
    providerID: providerId,
    auth: { type: "api", key: apiKey },
  });
}

export function getAuthStatus(): Record<string, boolean> {
  const settings = readSettings();
  const status: Record<string, boolean> = {};
  for (const [id, key] of Object.entries(settings.apiKeys)) {
    if (key) status[id] = true;
  }
  return status;
}

export async function removeAuth(providerId: string): Promise<void> {
  saveKeyLocally(providerId, "");
  const client = getClient();
  await client.auth.remove({
    providerID: providerId,
  });
}

const SETTINGS_PATH = join(OPENCODE_CONFIG_DIR, "game-builder-settings.json");

interface AgentModelConfig {
  name: string;
  modelId: string;
}

interface AppSettings {
  activeProvider: string | null;
  activeModel: string | null;
  apiKeys: Record<string, string>;
  agentConfigs: AgentModelConfig[];
}

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: null,
  activeModel: null,
  apiKeys: {},
  agentConfigs: [],
};

function readSettings(): AppSettings {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: AppSettings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function getActiveProvider(): { providerId: string | null; modelId: string | null } {
  const settings = readSettings();
  return {
    providerId: settings.activeProvider,
    modelId: settings.activeModel,
  };
}

export function setActiveProvider(providerId: string, modelId: string): void {
  const settings = readSettings();
  settings.activeProvider = providerId;
  settings.activeModel = modelId;
  writeSettings(settings);
}

export function getStoredKey(providerId: string): string | null {
  const settings = readSettings();
  return settings.apiKeys[providerId] ?? null;
}

function saveKeyLocally(providerId: string, apiKey: string): void {
  const settings = readSettings();
  if (apiKey) {
    settings.apiKeys[providerId] = apiKey;
  } else {
    delete settings.apiKeys[providerId];
  }
  writeSettings(settings);
}

export function getAgentConfigs(): AgentModelConfig[] {
  const settings = readSettings();
  return settings.agentConfigs;
}

export function setAgentConfigs(configs: AgentModelConfig[]): void {
  const settings = readSettings();
  settings.agentConfigs = configs;
  writeSettings(settings);
}
