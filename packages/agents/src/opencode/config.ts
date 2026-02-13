import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const OPENCODE_PORT = 4096;
export const OPENCODE_BASE_URL = `http://localhost:${OPENCODE_PORT}`;
export const OPENCODE_HEALTH_URL = `${OPENCODE_BASE_URL}/global/health`;
export const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
export const OPENCODE_CONFIG_PATH = join(OPENCODE_CONFIG_DIR, "opencode.json");

export interface OpencodeConfig {
  $schema?: string;
  provider?: Record<
    string,
    {
      models?: Record<
        string,
        {
          name?: string;
          thinking?: boolean;
          attachment?: boolean;
          limit?: { context?: number; output?: number };
          modalities?: { input?: string[]; output?: string[] };
        }
      >;
    }
  >;
  mcp?: Record<
    string,
    {
      type: string;
      command?: string[];
      url?: string;
      headers?: Record<string, string>;
      environment?: Record<string, string>;
      enabled?: boolean;
    }
  >;
  plugin?: string[];
}

const DEFAULT_CONFIG: OpencodeConfig = {
  $schema: "https://opencode.ai/config.json",
  provider: {
    openrouter: {
      models: {
        "anthropic/claude-sonnet-4.5": {
          name: "Claude Sonnet 4.5",
          thinking: true,
          attachment: true,
          limit: { context: 1000000, output: 64000 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "anthropic/claude-haiku-4.5": {
          name: "Claude Haiku 4.5",
          thinking: true,
          limit: { context: 200000, output: 8192 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      },
    },
  },
};

/** Creates default config at ~/.config/opencode/opencode.json if missing. Returns current config. */
export function ensureConfig(): OpencodeConfig {
  if (existsSync(OPENCODE_CONFIG_PATH)) {
    try {
      const raw = readFileSync(OPENCODE_CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as OpencodeConfig;
    } catch {
      console.warn(
        `[opencode/config] Config at ${OPENCODE_CONFIG_PATH} is invalid, using defaults`
      );
      return DEFAULT_CONFIG;
    }
  }

  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  writeFileSync(
    OPENCODE_CONFIG_PATH,
    JSON.stringify(DEFAULT_CONFIG, null, 2),
    "utf-8"
  );
  console.log(`[opencode/config] Created default config at ${OPENCODE_CONFIG_PATH}`);
  return DEFAULT_CONFIG;
}

export function readConfig(): OpencodeConfig | null {
  if (!existsSync(OPENCODE_CONFIG_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(OPENCODE_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as OpencodeConfig;
  } catch {
    return null;
  }
}

export function getDefaultModel(): { providerID: string; modelID: string } {
  const config = readConfig();
  if (config?.provider) {
    for (const [providerID, provider] of Object.entries(config.provider)) {
      if (provider.models) {
        const modelID = Object.keys(provider.models)[0];
        if (modelID) {
          return { providerID, modelID };
        }
      }
    }
  }
  return {
    providerID: "anthropic",
    modelID: "claude-3-5-haiku-20241022",
  };
}
