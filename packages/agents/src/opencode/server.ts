import { type ChildProcess, spawn } from "node:child_process";
import { OPENCODE_HEALTH_URL, OPENCODE_PORT, ensureConfig } from "./config";

export type ServerStatus = "stopped" | "starting" | "healthy" | "error";

interface ServerState {
  process: ChildProcess | null;
  status: ServerStatus;
  version: string | null;
  error: string | null;
}

const state: ServerState = {
  process: null,
  status: "stopped",
  version: null,
  error: null,
};

export function getServerState(): Readonly<ServerState> {
  return { ...state };
}

export async function checkHealth(): Promise<{
  healthy: boolean;
  version: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(OPENCODE_HEALTH_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return { healthy: false, version: null };

    const data = (await response.json()) as {
      healthy?: boolean;
      version?: string;
    };
    return {
      healthy: data.healthy === true,
      version: data.version ?? null,
    };
  } catch {
    return { healthy: false, version: null };
  }
}

async function waitForHealthy(
  maxAttempts = 30,
  intervalMs = 1000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const { healthy, version } = await checkHealth();
    if (healthy) {
      state.status = "healthy";
      state.version = version;
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Starts server or connects to existing one if already running on port. */
export async function startServer(): Promise<{
  success: boolean;
  alreadyRunning: boolean;
  error?: string;
}> {
  ensureConfig();

  const existingHealth = await checkHealth();
  if (existingHealth.healthy) {
    state.status = "healthy";
    state.version = existingHealth.version;
    console.log(
      `[opencode/server] Already running (v${existingHealth.version})`
    );
    return { success: true, alreadyRunning: true };
  }

  state.status = "starting";
  state.error = null;

  try {
    const proc = spawn("opencode", ["server", "--port", String(OPENCODE_PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      env: { ...process.env },
    });

    state.process = proc;

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[opencode/server] ${data.toString().trim()}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[opencode/server] ${data.toString().trim()}`);
    });

    proc.on("error", (err) => {
      state.status = "error";
      state.error = err.message;
      state.process = null;
      console.error(`[opencode/server] Process error: ${err.message}`);
    });

    proc.on("exit", (code) => {
      if (state.status !== "error") {
        state.status = "stopped";
      }
      state.process = null;
      console.log(`[opencode/server] Exited with code ${code}`);
    });

    const healthy = await waitForHealthy();
    if (!healthy) {
      proc.kill();
      state.process = null;
      state.status = "error";
      state.error = "Server failed to become healthy within 30s";
      return { success: false, alreadyRunning: false, error: state.error };
    }

    console.log(`[opencode/server] Started (v${state.version})`);
    return { success: true, alreadyRunning: false };
  } catch (err) {
    state.status = "error";
    state.error = err instanceof Error ? err.message : String(err);
    return { success: false, alreadyRunning: false, error: state.error };
  }
}

export async function stopServer(): Promise<void> {
  if (state.process) {
    state.process.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (state.process) {
          state.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      state.process?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    state.process = null;
  }
  state.status = "stopped";
  state.version = null;
  state.error = null;
  console.log("[opencode/server] Stopped");
}
