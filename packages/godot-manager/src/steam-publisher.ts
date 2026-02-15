import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export type SteamDepot = string;

export type SteamPublishStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type SteamBranch =
  | "default"
  | "beta"
  | "staging"
  | string;

export interface SteamDepotConfig {
  /** Depot ID (numeric string) */
  depotId: string;
  /** Directory containing build artifacts for this depot */
  directory: string;
  enabled: boolean;
  /** File exclusion patterns */
  excludePatterns?: string[];
}

export interface SteamPublishConfig {
  projectId: string;
  projectPath: string;
  /** Steam App ID */
  appId: string;
  /** Depot configurations */
  depots: SteamDepotConfig[];
  /** SteamCMD binary path (default: "steamcmd" on PATH) */
  steamCmdPath: string;
  /** Steam username for authentication */
  username?: string;
  /** Branch to set live after upload */
  branch: SteamBranch;
  /** Build description for Steamworks */
  buildDescription?: string;
  /** Whether to skip upload if content unchanged */
  ifChanged: boolean;
  /** Timeout per depot upload in ms */
  uploadTimeout: number;
  /** Retain last N publish records (0 = unlimited) */
  publishRetention: number;
  /** Whether to preview the upload before executing */
  preview: boolean;
}

export interface SteamCmdInfo {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface SteamLoginStatus {
  loggedIn: boolean;
  username?: string;
}

export interface DepotPublishResult {
  depotId: string;
  status: SteamPublishStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  manifestId?: string;
  bytesUploaded?: number;
  error?: string;
  logs: string[];
}

export interface SteamPublishRun {
  id: string;
  projectId: string;
  appId: string;
  timestamp: number;
  depots: string[];
  branch: SteamBranch;
  buildDescription?: string;
  results: DepotPublishResult[];
  status: SteamPublishStatus;
  triggeredBy: string;
  duration: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SteamPublishState {
  config: SteamPublishConfig;
  lastRunId: string | null;
  lastRunTime: number | null;
  totalRuns: number;
  isRunning: boolean;
  currentDepot: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SteamPublishHistory {
  projectId: string;
  runs: SteamPublishRun[];
  totalCount: number;
}

export interface SteamPublishQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  depotId?: string;
  status?: SteamPublishStatus;
  triggeredBy?: string;
  search?: string;
}

export interface SteamPublishStats {
  projectId: string;
  totalRuns: number;
  totalUploads: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  depotCounts: Record<string, number>;
  depotSuccessRates: Record<string, number>;
  averageDuration: number;
  lastRun: number | null;
  firstRun: number | null;
}

export interface SteamPublishValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SteamPublishOptions {
  depots?: string[];
  branch?: SteamBranch;
  buildDescription?: string;
  triggeredBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PUBLISHER_DIR = ".steam-publisher";
const RUNS_DIR = "runs";
const STATE_FILE = "state.json";
const CONFIG_FILE = "config.json";

const DEFAULT_DEPOTS: SteamDepotConfig[] = [
  { depotId: "1000001", directory: "exports/windows", enabled: true },
  { depotId: "1000002", directory: "exports/linux", enabled: true },
  { depotId: "1000003", directory: "exports/macos", enabled: true },
];

const ALL_DEFAULT_DEPOT_IDS: string[] = ["1000001", "1000002", "1000003"];

const DEFAULT_UPLOAD_TIMEOUT = 600_000; // 10 minutes

// ─── Internal Helpers ──────────────────────────────────────────────────────

function getPublisherDir(projectPath: string): string {
  return join(resolve(projectPath), PUBLISHER_DIR);
}

function getRunsDir(projectPath: string): string {
  return join(getPublisherDir(projectPath), RUNS_DIR);
}

function getStatePath(projectPath: string): string {
  return join(getPublisherDir(projectPath), STATE_FILE);
}

function getConfigPath(projectPath: string): string {
  return join(getPublisherDir(projectPath), CONFIG_FILE);
}

function readState(projectPath: string): SteamPublishState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: SteamPublishState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readRun(projectPath: string, runId: string): SteamPublishRun | null {
  const runPath = join(getRunsDir(projectPath), `${runId}.json`);
  if (!existsSync(runPath)) return null;
  return JSON.parse(readFileSync(runPath, "utf-8"));
}

function writeRun(projectPath: string, run: SteamPublishRun): void {
  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }
  writeFileSync(join(runsDir, `${run.id}.json`), JSON.stringify(run, null, 2), "utf-8");
}

function generateRunId(timestamp: number, projectId: string): string {
  const input = `${timestamp}:${projectId}:${Math.random().toString(36).slice(2)}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function deriveOverallStatus(results: DepotPublishResult[]): SteamPublishStatus {
  if (results.length === 0) return "pending";

  const statuses = results.map((r) => r.status);

  if (statuses.every((s) => s === "succeeded")) return "succeeded";
  if (statuses.some((s) => s === "uploading" || s === "processing")) return "uploading";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "pending")) return "pending";

  return "failed";
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the default depot configurations.
 */
export function getDefaultDepots(): SteamDepotConfig[] {
  return DEFAULT_DEPOTS.map((d) => ({ ...d }));
}

/**
 * Get the list of all default depot IDs.
 */
export function getDefaultDepotIds(): string[] {
  return [...ALL_DEFAULT_DEPOT_IDS];
}

/**
 * Detect SteamCMD installation.
 */
export function detectSteamCmd(steamCmdPath?: string): SteamCmdInfo {
  const cmd = steamCmdPath ?? "steamcmd";
  try {
    const result = spawnSync(cmd, ["+quit"], {
      timeout: 15_000,
      encoding: "utf-8",
    });

    if (result.error) {
      return { installed: false };
    }

    const output = (result.stdout ?? "").trim();
    // SteamCMD outputs version info on startup
    const versionMatch = output.match(/Steam\s+Console\s+Client.*?v?(\d[\d.]*)/i);
    const version = versionMatch ? versionMatch[1] : undefined;

    return {
      installed: result.status === 0 || result.status === 7,
      version,
      path: cmd,
    };
  } catch {
    return { installed: false };
  }
}

/**
 * Check SteamCMD login status.
 */
export function checkSteamLogin(username?: string, steamCmdPath?: string): SteamLoginStatus {
  if (!username) {
    return { loggedIn: false };
  }

  const cmd = steamCmdPath ?? "steamcmd";
  try {
    const result = spawnSync(cmd, ["+login", username, "+quit"], {
      timeout: 15_000,
      encoding: "utf-8",
    });

    if (result.error || (result.status !== 0 && result.status !== 7)) {
      return { loggedIn: false };
    }

    const output = (result.stdout ?? "").trim();
    const loggedIn = output.includes("Logged in OK") || output.includes("OK");

    return {
      loggedIn,
      username: loggedIn ? username : undefined,
    };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Validate a Steam publish configuration.
 */
export function validateSteamPublishConfig(config: Partial<SteamPublishConfig>): SteamPublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.projectId || config.projectId.trim() === "") {
    errors.push("projectId is required");
  }

  if (!config.projectPath || config.projectPath.trim() === "") {
    errors.push("projectPath is required");
  }

  if (!config.appId || config.appId.trim() === "") {
    errors.push("appId is required");
  } else if (!/^\d+$/.test(config.appId.trim())) {
    errors.push("appId must be a numeric string");
  }

  if (!config.depots || config.depots.length === 0) {
    errors.push("At least one depot must be configured");
  }

  if (config.depots) {
    const enabledDepots = config.depots.filter((d) => d.enabled);
    if (enabledDepots.length === 0) {
      warnings.push("No depots are enabled");
    }

    const seen = new Set<string>();
    for (const depot of config.depots) {
      if (seen.has(depot.depotId)) {
        errors.push(`Duplicate depot: ${depot.depotId}`);
      }
      seen.add(depot.depotId);

      if (!depot.depotId || depot.depotId.trim() === "") {
        errors.push("Depot ID cannot be empty");
      } else if (!/^\d+$/.test(depot.depotId.trim())) {
        errors.push(`Depot ${depot.depotId}: depot ID must be numeric`);
      }

      if (!depot.directory || depot.directory.trim() === "") {
        errors.push(`Depot ${depot.depotId}: directory is required`);
      }
    }
  }

  if (config.uploadTimeout !== undefined && config.uploadTimeout <= 0) {
    errors.push("uploadTimeout must be positive");
  }

  if (config.publishRetention !== undefined && config.publishRetention < 0) {
    errors.push("publishRetention must be non-negative");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Initialize the Steam publisher for a project.
 * Creates .steam-publisher directory.
 * Returns true if freshly initialized, false if already exists.
 */
export function initSteamPublisher(config: SteamPublishConfig): boolean {
  const publisherDir = getPublisherDir(config.projectPath);

  if (existsSync(publisherDir)) {
    return false;
  }

  mkdirSync(publisherDir, { recursive: true });
  mkdirSync(getRunsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");

  const state: SteamPublishState = {
    config,
    lastRunId: null,
    lastRunTime: null,
    totalRuns: 0,
    isRunning: false,
    currentDepot: null,
    createdAt: now,
    updatedAt: now,
  };
  writeState(config.projectPath, state);

  return true;
}

/**
 * Check if a project has the Steam publisher initialized.
 */
export function hasSteamPublisher(projectPath: string): boolean {
  return existsSync(getPublisherDir(projectPath));
}

/**
 * Get the current Steam publisher state.
 */
export function getSteamPublishState(projectPath: string): SteamPublishState | null {
  return readState(projectPath);
}

/**
 * Update the Steam publisher configuration.
 */
export function updateSteamPublishConfig(projectPath: string, updates: Partial<SteamPublishConfig>): SteamPublishConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

/**
 * Get the enabled depots from the configuration.
 */
export function getEnabledDepots(projectPath: string): SteamDepotConfig[] {
  const state = readState(projectPath);
  if (!state) return [];
  return state.config.depots.filter((d) => d.enabled);
}

/**
 * Enable or disable a specific depot.
 */
export function setDepotEnabled(projectPath: string, depotId: string, enabled: boolean): SteamDepotConfig | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  const depotConfig = state.config.depots.find((d) => d.depotId === depotId);
  if (!depotConfig) return null;

  depotConfig.enabled = enabled;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return depotConfig;
}

/**
 * Add a depot to the Steam publisher configuration.
 */
export function addDepot(projectPath: string, config: SteamDepotConfig): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  if (state.config.depots.some((d) => d.depotId === config.depotId)) {
    return false;
  }

  state.config.depots.push(config);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Remove a depot from the Steam publisher configuration.
 */
export function removeDepot(projectPath: string, depotId: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  const index = state.config.depots.findIndex((d) => d.depotId === depotId);
  if (index === -1) return false;

  state.config.depots.splice(index, 1);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Build the SteamCMD upload arguments for a depot.
 */
export function buildSteamUploadArgs(
  config: SteamPublishConfig,
  depotConfig: SteamDepotConfig,
  options?: { buildDescription?: string; branch?: SteamBranch; dryRun?: boolean },
): string[] {
  const directory = join(resolve(config.projectPath), depotConfig.directory);
  const branch = options?.branch ?? config.branch;
  const description = options?.buildDescription ?? config.buildDescription;

  const args: string[] = [];

  if (config.username) {
    args.push("+login", config.username);
  }

  args.push("+app_build");
  args.push("--app-id", config.appId);
  args.push("--depot-id", depotConfig.depotId);
  args.push("--content-dir", directory);

  if (branch && branch !== "default") {
    args.push("--branch", branch);
  }

  if (description) {
    args.push("--desc", description);
  }

  if (options?.dryRun || config.preview) {
    args.push("--preview");
  }

  args.push("+quit");

  return args;
}

/**
 * Generate a VDF app build script for SteamCMD.
 */
export function generateAppBuildVdf(
  config: SteamPublishConfig,
  options?: { buildDescription?: string; branch?: SteamBranch; preview?: boolean },
): string {
  const branch = options?.branch ?? config.branch;
  const description = options?.buildDescription ?? config.buildDescription ?? "";
  const preview = options?.preview ?? config.preview;

  const enabledDepots = config.depots.filter((d) => d.enabled);

  const lines: string[] = [
    `"AppBuild"`,
    `{`,
    `  "AppID" "${config.appId}"`,
    `  "Desc" "${description}"`,
    `  "Preview" "${preview ? "1" : "0"}"`,
    `  "SetLive" "${branch}"`,
    `  "ContentRoot" "${resolve(config.projectPath)}"`,
    `  "BuildOutput" "${join(resolve(config.projectPath), ".steam-publisher", "build-output")}"`,
    `  "Depots"`,
    `  {`,
  ];

  for (const depot of enabledDepots) {
    lines.push(`    "${depot.depotId}"`);
    lines.push(`    {`);
    lines.push(`      "FileMapping"`);
    lines.push(`      {`);
    lines.push(`        "LocalPath" "${depot.directory}/*"`);
    lines.push(`        "DepotPath" "."`);
    lines.push(`        "Recursive" "1"`);
    lines.push(`      }`);

    if (depot.excludePatterns && depot.excludePatterns.length > 0) {
      for (const pattern of depot.excludePatterns) {
        lines.push(`      "FileExclusion" "${pattern}"`);
      }
    }

    lines.push(`    }`);
  }

  lines.push(`  }`);
  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Parse a Steam App ID string and validate it.
 */
export function parseSteamAppId(appId: string): { valid: boolean; appId?: string } {
  const trimmed = appId.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { valid: false };
  }
  return { valid: true, appId: trimmed };
}

/**
 * Format a Steam App ID with depot ID: "app:depot"
 */
export function formatSteamTarget(appId: string, depotId: string): string {
  return `${appId}:${depotId}`;
}

/**
 * Execute a Steam publish run — uploads builds to Steam via SteamCMD.
 *
 * The executor callback is called per-depot. If no executor is provided,
 * a dry-run is simulated.
 */
export async function executeSteamPublish(
  projectPath: string,
  options?: SteamPublishOptions,
  executor?: (
    depotId: string,
    depotConfig: SteamDepotConfig,
    uploadArgs: string[],
  ) => Promise<{ success: boolean; error?: string; logs?: string[]; manifestId?: string; bytesUploaded?: number }>,
  onProgress?: (depotId: string, message: string) => void,
): Promise<SteamPublishRun> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  if (state.isRunning) {
    throw new Error("A publish is already running. Wait for it to complete.");
  }

  const now = Date.now();
  const runId = generateRunId(now, state.config.projectId);

  state.isRunning = true;
  state.updatedAt = now;
  writeState(projectPath, state);

  const enabledDepots = state.config.depots.filter((d) => d.enabled);
  const requestedDepots = options?.depots
    ? enabledDepots.filter((d) => options.depots!.includes(d.depotId))
    : enabledDepots;

  const results: DepotPublishResult[] = [];

  for (const depotConfig of requestedDepots) {
    state.currentDepot = depotConfig.depotId;
    state.updatedAt = Date.now();
    writeState(projectPath, state);

    onProgress?.(depotConfig.depotId, `Starting publish for depot ${depotConfig.depotId}...`);

    const uploadStart = Date.now();
    const uploadArgs = buildSteamUploadArgs(state.config, depotConfig, {
      buildDescription: options?.buildDescription,
      branch: options?.branch,
      dryRun: options?.dryRun,
    });

    if (!executor) {
      // Dry-run mode when no executor provided
      results.push({
        depotId: depotConfig.depotId,
        status: "succeeded",
        startedAt: uploadStart,
        completedAt: Date.now(),
        duration: Date.now() - uploadStart,
        logs: [`Dry-run upload for depot ${depotConfig.depotId}: steamcmd ${uploadArgs.join(" ")}`],
      });
      onProgress?.(depotConfig.depotId, `Publish for depot ${depotConfig.depotId} completed (dry-run)`);
      continue;
    }

    try {
      const result = await executor(depotConfig.depotId, depotConfig, uploadArgs);
      const uploadEnd = Date.now();

      results.push({
        depotId: depotConfig.depotId,
        status: result.success ? "succeeded" : "failed",
        startedAt: uploadStart,
        completedAt: uploadEnd,
        duration: uploadEnd - uploadStart,
        manifestId: result.manifestId,
        bytesUploaded: result.bytesUploaded,
        error: result.success ? undefined : result.error,
        logs: result.logs ?? [],
      });

      onProgress?.(
        depotConfig.depotId,
        result.success
          ? `Publish for depot ${depotConfig.depotId} succeeded`
          : `Publish for depot ${depotConfig.depotId} failed: ${result.error}`,
      );
    } catch (err) {
      const uploadEnd = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.push({
        depotId: depotConfig.depotId,
        status: "failed",
        startedAt: uploadStart,
        completedAt: uploadEnd,
        duration: uploadEnd - uploadStart,
        error: errorMsg,
        logs: [`Error: ${errorMsg}`],
      });

      onProgress?.(depotConfig.depotId, `Publish for depot ${depotConfig.depotId} failed: ${errorMsg}`);
    }
  }

  const totalDuration = Date.now() - now;

  const run: SteamPublishRun = {
    id: runId,
    projectId: state.config.projectId,
    appId: state.config.appId,
    timestamp: now,
    depots: requestedDepots.map((d) => d.depotId),
    branch: options?.branch ?? state.config.branch,
    buildDescription: options?.buildDescription ?? state.config.buildDescription,
    results,
    status: deriveOverallStatus(results),
    triggeredBy: options?.triggeredBy ?? "manual",
    duration: totalDuration,
    tags: options?.tags,
    metadata: options?.metadata,
  };

  writeRun(projectPath, run);

  state.isRunning = false;
  state.currentDepot = null;
  state.lastRunId = runId;
  state.lastRunTime = now;
  state.totalRuns += 1;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  if (state.config.publishRetention > 0) {
    pruneSteamRuns(projectPath, state.config.publishRetention);
  }

  return run;
}

/**
 * Cancel the currently running Steam publish. Returns true if cancelled.
 */
export function cancelSteamPublish(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Steam publisher not initialized. Call initSteamPublisher() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.currentDepot = null;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

/**
 * Get a single Steam publish run by ID.
 */
export function getSteamRun(projectPath: string, runId: string): SteamPublishRun | null {
  return readRun(projectPath, runId);
}

/**
 * Get Steam publish history for a project.
 */
export function getSteamHistory(projectPath: string, query?: SteamPublishQuery): SteamPublishHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", runs: [], totalCount: 0 };
  }

  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    return { projectId: state.config.projectId, runs: [], totalCount: 0 };
  }

  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const allRuns: SteamPublishRun[] = [];

  for (const file of runFiles) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), "utf-8")) as SteamPublishRun;
      allRuns.push(run);
    } catch {
      continue;
    }
  }

  allRuns.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));

  let filtered = allRuns;

  if (query?.since) {
    filtered = filtered.filter((r) => r.timestamp >= query.since!);
  }
  if (query?.until) {
    filtered = filtered.filter((r) => r.timestamp <= query.until!);
  }
  if (query?.depotId) {
    filtered = filtered.filter((r) => r.depots.includes(query.depotId!));
  }
  if (query?.status) {
    filtered = filtered.filter((r) => r.status === query.status);
  }
  if (query?.triggeredBy) {
    filtered = filtered.filter((r) => r.triggeredBy === query.triggeredBy);
  }
  if (query?.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.id.includes(searchLower) ||
        r.appId.toLowerCase().includes(searchLower) ||
        r.triggeredBy.toLowerCase().includes(searchLower) ||
        (r.buildDescription ?? "").toLowerCase().includes(searchLower) ||
        r.results.some((res) => res.logs.some((l) => l.toLowerCase().includes(searchLower))),
    );
  }

  const totalCount = filtered.length;
  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? filtered.length;

  return {
    projectId: state.config.projectId,
    runs: filtered.slice(offset, offset + limit),
    totalCount,
  };
}

/**
 * Get Steam publish statistics.
 */
export function getSteamStats(projectPath: string): SteamPublishStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getSteamHistory(projectPath);

  let totalUploads = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let firstRun: number | null = null;
  let lastRun: number | null = null;
  let totalDuration = 0;
  const depotCounts: Record<string, number> = {};
  const depotSucceeded: Record<string, number> = {};
  const depotTotal: Record<string, number> = {};

  for (const run of history.runs) {
    if (firstRun === null || run.timestamp < firstRun) firstRun = run.timestamp;
    if (lastRun === null || run.timestamp > lastRun) lastRun = run.timestamp;
    totalDuration += run.duration;

    for (const result of run.results) {
      totalUploads++;
      depotCounts[result.depotId] = (depotCounts[result.depotId] ?? 0) + 1;
      depotTotal[result.depotId] = (depotTotal[result.depotId] ?? 0) + 1;

      switch (result.status) {
        case "succeeded":
          succeeded++;
          depotSucceeded[result.depotId] = (depotSucceeded[result.depotId] ?? 0) + 1;
          break;
        case "failed":
          failed++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
    }
  }

  const depotSuccessRates: Record<string, number> = {};
  for (const depotId of Object.keys(depotTotal)) {
    const total = depotTotal[depotId] ?? 0;
    const succ = depotSucceeded[depotId] ?? 0;
    if (total > 0) {
      depotSuccessRates[depotId] = Math.round((succ / total) * 100);
    }
  }

  return {
    projectId: state.config.projectId,
    totalRuns: history.totalCount,
    totalUploads,
    succeeded,
    failed,
    cancelled,
    depotCounts,
    depotSuccessRates,
    averageDuration: history.totalCount > 0 ? Math.round(totalDuration / history.totalCount) : 0,
    lastRun,
    firstRun,
  };
}

/**
 * Get the result for a specific depot from a publish run.
 */
export function getDepotResult(run: SteamPublishRun, depotId: string): DepotPublishResult | null {
  return run.results.find((r) => r.depotId === depotId) ?? null;
}

/**
 * Check if a Steam publish run was fully successful.
 */
export function isSteamRunSuccessful(run: SteamPublishRun): boolean {
  return run.results.every((r) => r.status === "succeeded");
}

/**
 * Get failed depots from a publish run.
 */
export function getFailedDepots(run: SteamPublishRun): string[] {
  return run.results.filter((r) => r.status === "failed").map((r) => r.depotId);
}

/**
 * Get succeeded depots from a publish run.
 */
export function getSucceededDepots(run: SteamPublishRun): string[] {
  return run.results.filter((r) => r.status === "succeeded").map((r) => r.depotId);
}

/**
 * Prune old Steam publish runs to keep only the latest N.
 */
export function pruneSteamRuns(projectPath: string, keepCount: number): number {
  const history = getSteamHistory(projectPath);
  const toDelete = history.runs.slice(keepCount);

  let deleted = 0;
  const runsDir = getRunsDir(projectPath);

  for (const run of toDelete) {
    const runPath = join(runsDir, `${run.id}.json`);
    if (existsSync(runPath)) {
      rmSync(runPath);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Format a Steam publish run as a one-line summary.
 */
export function formatSteamRunOneline(run: SteamPublishRun): string {
  const shortId = run.id.slice(0, 7);
  const depotList = run.depots.join(", ");
  const statusIcon =
    run.status === "succeeded" ? "+" :
    run.status === "failed" ? "x" :
    run.status === "cancelled" ? "-" :
    "?";
  const durationSec = (run.duration / 1000).toFixed(1);
  return `${shortId} [${statusIcon}] app:${run.appId} -> ${depotList} ${durationSec}s`;
}

/**
 * Format a Steam publish run with full details.
 */
export function formatSteamRunFull(run: SteamPublishRun): string {
  const lines: string[] = [
    `Steam Publish ${run.id}`,
    `Status:      ${run.status}`,
    `App ID:      ${run.appId}`,
    `Depots:      ${run.depots.join(", ")}`,
    `Branch:      ${run.branch}`,
    `Triggered:   ${run.triggeredBy}`,
    `Date:        ${new Date(run.timestamp).toISOString()}`,
    `Duration:    ${(run.duration / 1000).toFixed(1)}s`,
  ];

  if (run.buildDescription) {
    lines.push(`Description: ${run.buildDescription}`);
  }

  if (run.tags && run.tags.length > 0) {
    lines.push(`Tags:        ${run.tags.join(", ")}`);
  }

  lines.push("", "  Results:");

  for (const result of run.results) {
    const icon =
      result.status === "succeeded" ? "+" :
      result.status === "failed" ? "x" :
      result.status === "cancelled" ? "-" :
      "?";

    const durationSec = (result.duration / 1000).toFixed(1);
    lines.push(`    ${icon} depot ${result.depotId}: ${result.status} (${durationSec}s)`);

    if (result.error) {
      lines.push(`      Error: ${result.error}`);
    }

    if (result.manifestId) {
      lines.push(`      Manifest ID: ${result.manifestId}`);
    }

    if (result.bytesUploaded) {
      lines.push(`      Uploaded: ${result.bytesUploaded}B`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a Steam publish summary string for display.
 */
export function generateSteamPublishSummary(run: SteamPublishRun): string {
  const total = run.results.length;
  const succeeded = run.results.filter((r) => r.status === "succeeded").length;
  const failed = run.results.filter((r) => r.status === "failed").length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Steam Publish ${run.id.slice(0, 7)}: ${parts.join(", ")} (${total} total) app:${run.appId}`;
}

/**
 * Destroy the Steam publisher for a project. Removes all data.
 */
export function destroySteamPublisher(projectPath: string): boolean {
  const publisherDir = getPublisherDir(projectPath);
  if (!existsSync(publisherDir)) return false;

  rmSync(publisherDir, { recursive: true, force: true });
  return true;
}

/**
 * Create a SteamCMD executor that invokes SteamCMD CLI.
 * Use this as the executor parameter for executeSteamPublish().
 */
export function createSteamCmdExecutor(
  steamCmdPath: string,
  options?: { timeout?: number },
): (
  depotId: string,
  depotConfig: SteamDepotConfig,
  uploadArgs: string[],
) => Promise<{ success: boolean; error?: string; logs?: string[]; manifestId?: string; bytesUploaded?: number }> {
  return async (_depotId, _depotConfig, uploadArgs) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = spawnSync(steamCmdPath, uploadArgs, {
      timeout: options?.timeout ?? DEFAULT_UPLOAD_TIMEOUT,
      encoding: "utf-8",
      env,
    });

    const stdout = (result.stdout ?? "").trim();
    const stderr = (result.stderr ?? "").trim();
    const logs: string[] = [];
    if (stdout) logs.push(stdout);
    if (stderr) logs.push(stderr);

    if (result.error) {
      return {
        success: false,
        error: result.error.message,
        logs,
      };
    }

    if (result.status !== 0) {
      return {
        success: false,
        error: stderr || `SteamCMD exited with code ${result.status}`,
        logs,
      };
    }

    // Try to extract manifest ID from SteamCMD output
    const manifestMatch = stdout.match(/manifest\s+(?:id|ID)[:\s]+([\d]+)/i);
    const manifestId = manifestMatch ? manifestMatch[1] : undefined;

    // Try to extract bytes from output
    const bytesMatch = stdout.match(/([\d,]+)\s*bytes?/i);
    const bytesUploaded = bytesMatch ? parseInt(bytesMatch[1].replace(/,/g, ""), 10) : undefined;

    return {
      success: true,
      logs,
      manifestId,
      bytesUploaded,
    };
  };
}
