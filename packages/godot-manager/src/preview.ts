import { type ChildProcess } from "child_process";
import { spawnGodotPreview, type GodotCliOptions } from "./cli.js";

export type PreviewStatus = "idle" | "starting" | "running" | "stopping" | "error";

export interface PreviewState {
  status: PreviewStatus;
  pid: number | null;
  error: string | null;
  output: string[];
}

export interface PreviewManager {
  getState(): PreviewState;
  start(projectPath: string, options?: GodotCliOptions): void;
  stop(): void;
  onStateChanged(callback: (state: PreviewState) => void): () => void;
  onOutput(callback: (line: string) => void): () => void;
}

const MAX_OUTPUT_LINES = 200;
const STARTING_TIMEOUT_MS = 2000;
const STOP_GRACE_MS = 3000;

export function createPreviewManager(): PreviewManager {
  let process: ChildProcess | null = null;
  let state: PreviewState = {
    status: "idle",
    pid: null,
    error: null,
    output: [],
  };

  const stateListeners: Array<(state: PreviewState) => void> = [];
  const outputListeners: Array<(line: string) => void> = [];

  let startingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  function setState(patch: Partial<PreviewState>): void {
    state = { ...state, ...patch };
    for (const listener of stateListeners) {
      listener(state);
    }
  }

  function appendOutput(text: string): void {
    const lines = text.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      state.output.push(line);
      for (const listener of outputListeners) {
        listener(line);
      }
    }
    if (state.output.length > MAX_OUTPUT_LINES) {
      state.output = state.output.slice(-MAX_OUTPUT_LINES);
    }
  }

  function cleanup(): void {
    if (startingTimer) {
      clearTimeout(startingTimer);
      startingTimer = null;
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    process = null;
  }

  function start(projectPath: string, options?: GodotCliOptions): void {
    if (state.status === "running" || state.status === "starting") {
      return;
    }

    setState({ status: "starting", error: null, output: [], pid: null });

    let child: ChildProcess;
    try {
      child = spawnGodotPreview(projectPath, undefined, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", error: `Failed to spawn Godot: ${message}` });
      return;
    }

    process = child;
    setState({ pid: child.pid ?? null });

    let receivedData = false;

    startingTimer = setTimeout(() => {
      if (state.status === "starting") {
        setState({ status: "running" });
      }
    }, STARTING_TIMEOUT_MS);

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      appendOutput(text);
      if (!receivedData && state.status === "starting") {
        receivedData = true;
        if (startingTimer) {
          clearTimeout(startingTimer);
          startingTimer = null;
        }
        setState({ status: "running" });
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      appendOutput(text);
      if (!receivedData && state.status === "starting") {
        receivedData = true;
        if (startingTimer) {
          clearTimeout(startingTimer);
          startingTimer = null;
        }
        setState({ status: "running" });
      }
    });

    child.on("close", (code) => {
      cleanup();
      if (state.status === "stopping") {
        setState({ status: "idle", pid: null });
      } else if (code !== 0 && code !== null) {
        setState({ status: "error", pid: null, error: `Godot exited with code ${code}` });
      } else {
        setState({ status: "idle", pid: null });
      }
    });

    child.on("error", (err) => {
      cleanup();
      setState({ status: "error", pid: null, error: err.message });
    });
  }

  function stop(): void {
    if (!process || state.status === "idle" || state.status === "stopping") {
      return;
    }

    setState({ status: "stopping" });
    process.kill("SIGTERM");

    const childRef = process;
    stopTimer = setTimeout(() => {
      if (childRef && !childRef.killed) {
        childRef.kill("SIGKILL");
      }
    }, STOP_GRACE_MS);
  }

  function getState(): PreviewState {
    return { ...state, output: [...state.output] };
  }

  function onStateChanged(callback: (s: PreviewState) => void): () => void {
    stateListeners.push(callback);
    return () => {
      const idx = stateListeners.indexOf(callback);
      if (idx !== -1) stateListeners.splice(idx, 1);
    };
  }

  function onOutput(callback: (line: string) => void): () => void {
    outputListeners.push(callback);
    return () => {
      const idx = outputListeners.indexOf(callback);
      if (idx !== -1) outputListeners.splice(idx, 1);
    };
  }

  return { getState, start, stop, onStateChanged, onOutput };
}
