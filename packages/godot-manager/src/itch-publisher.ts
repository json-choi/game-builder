import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ItchChannel =
  | "windows"
  | "linux"
  | "macos"
  | "web"
  | "android"
  | string;

export type PublishStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ItchTarget {
  /** itch.io user/game target, e.g. "myuser/mygame" */
  target: string;
  /** Channel name, e.g. "windows", "linux", "web", "macos" */
  channel: ItchChannel;
}

export interface ItchPublishConfig {
  projectId: string;
  projectPath: string;
  /** itch.io user/game, e.g. "myuser/mygame" */
  itchTarget: string;
  /** Channel-to-directory mapping */
  channels: ItchChannelConfig[];
  /** Butler binary path (default: "butler" on PATH) */
  butlerPath: string;
  /** API key for authentication (set via env or config) */
  apiKey?: string;
  /** User version string for uploads */
  userVersion?: string;
  /** Whether to skip upload if content unchanged */
  ifChanged: boolean;
  /** Fix file permissions on upload */
  fixPermissions: boolean;
  /** Timeout per push in ms */
  pushTimeout: number;
  /** Retain last N publish records (0 = unlimited) */
  publishRetention: number;
}

export interface ItchChannelConfig {
  channel: ItchChannel;
  /** Directory containing build artifacts for this channel */
  directory: string;
  enabled: boolean;
  /** Platform tags for itch.io */
  tags?: string[];
}

export interface ButlerInfo {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface ButlerLoginStatus {
  loggedIn: boolean;
  username?: string;
}

export interface ChannelPublishResult {
  channel: ItchChannel;
  status: PublishStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  buildId?: string;
  bytesUploaded?: number;
  error?: string;
  logs: string[];
}

export interface PublishRun {
  id: string;
  projectId: string;
  itchTarget: string;
  timestamp: number;
  channels: ItchChannel[];
  userVersion?: string;
  results: ChannelPublishResult[];
  status: PublishStatus;
  triggeredBy: string;
  duration: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ItchPublishState {
  config: ItchPublishConfig;
  lastRunId: string | null;
  lastRunTime: number | null;
  totalRuns: number;
  isRunning: boolean;
  currentChannel: ItchChannel | null;
  createdAt: number;
  updatedAt: number;
}

export interface PublishHistory {
  projectId: string;
  runs: PublishRun[];
  totalCount: number;
}

export interface PublishQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  channel?: ItchChannel;
  status?: PublishStatus;
  triggeredBy?: string;
  search?: string;
}

export interface PublishStats {
  projectId: string;
  totalRuns: number;
  totalPushes: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  channelCounts: Record<string, number>;
  channelSuccessRates: Record<string, number>;
  averageDuration: number;
  lastRun: number | null;
  firstRun: number | null;
}

export interface PublishValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PublishOptions {
  channels?: ItchChannel[];
  userVersion?: string;
  triggeredBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PUBLISHER_DIR = ".itch-publisher";
const RUNS_DIR = "runs";
const STATE_FILE = "state.json";
const CONFIG_FILE = "config.json";

const DEFAULT_CHANNELS: ItchChannelConfig[] = [
  { channel: "windows", directory: "exports/windows", enabled: true, tags: ["windows"] },
  { channel: "linux", directory: "exports/linux", enabled: true, tags: ["linux"] },
  { channel: "macos", directory: "exports/macos", enabled: true, tags: ["macos"] },
  { channel: "web", directory: "exports/web", enabled: true, tags: ["web"] },
];

const ALL_DEFAULT_CHANNELS: ItchChannel[] = ["windows", "linux", "macos", "web"];

const DEFAULT_PUSH_TIMEOUT = 300_000; // 5 minutes

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

function readState(projectPath: string): ItchPublishState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: ItchPublishState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readRun(projectPath: string, runId: string): PublishRun | null {
  const runPath = join(getRunsDir(projectPath), `${runId}.json`);
  if (!existsSync(runPath)) return null;
  return JSON.parse(readFileSync(runPath, "utf-8"));
}

function writeRun(projectPath: string, run: PublishRun): void {
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

function deriveOverallStatus(results: ChannelPublishResult[]): PublishStatus {
  if (results.length === 0) return "pending";

  const statuses = results.map((r) => r.status);

  if (statuses.every((s) => s === "succeeded")) return "succeeded";
  if (statuses.some((s) => s === "uploading" || s === "processing")) return "uploading";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "pending")) return "pending";

  return "failed";
}

/**
 * Parse butler's target string: "user/game:channel"
 */
export function parseItchTarget(full: string): { user: string; game: string; channel?: string } | null {
  const channelSep = full.indexOf(":");
  let base: string;
  let channel: string | undefined;

  if (channelSep !== -1) {
    base = full.slice(0, channelSep);
    channel = full.slice(channelSep + 1);
  } else {
    base = full;
  }

  const parts = base.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  return { user: parts[0], game: parts[1], channel };
}

/**
 * Format a target string: "user/game:channel"
 */
export function formatItchTarget(user: string, game: string, channel?: string): string {
  const base = `${user}/${game}`;
  return channel ? `${base}:${channel}` : base;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the default channel configurations.
 */
export function getDefaultChannels(): ItchChannelConfig[] {
  return DEFAULT_CHANNELS.map((c) => ({ ...c }));
}

/**
 * Get the list of all default channel names.
 */
export function getDefaultChannelNames(): ItchChannel[] {
  return [...ALL_DEFAULT_CHANNELS];
}

/**
 * Detect butler CLI installation.
 */
export function detectButler(butlerPath?: string): ButlerInfo {
  const cmd = butlerPath ?? "butler";
  try {
    const result = spawnSync(cmd, ["version"], {
      timeout: 10_000,
      encoding: "utf-8",
    });

    if (result.error) {
      return { installed: false };
    }

    const output = (result.stdout ?? "").trim();
    // butler version output: "vX.Y.Z, built ..."
    const versionMatch = output.match(/v?([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : undefined;

    return {
      installed: result.status === 0,
      version,
      path: cmd,
    };
  } catch {
    return { installed: false };
  }
}

/**
 * Check butler login status.
 */
export function checkButlerLogin(butlerPath?: string): ButlerLoginStatus {
  const cmd = butlerPath ?? "butler";
  try {
    const result = spawnSync(cmd, ["status"], {
      timeout: 10_000,
      encoding: "utf-8",
    });

    if (result.error || result.status !== 0) {
      return { loggedIn: false };
    }

    const output = (result.stdout ?? "").trim();
    // butler status output includes username when logged in
    const userMatch = output.match(/as\s+(\S+)/i);

    return {
      loggedIn: true,
      username: userMatch ? userMatch[1] : undefined,
    };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Validate an itch.io publish configuration.
 */
export function validatePublishConfig(config: Partial<ItchPublishConfig>): PublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.projectId || config.projectId.trim() === "") {
    errors.push("projectId is required");
  }

  if (!config.projectPath || config.projectPath.trim() === "") {
    errors.push("projectPath is required");
  }

  if (!config.itchTarget || config.itchTarget.trim() === "") {
    errors.push("itchTarget is required");
  } else {
    const parsed = parseItchTarget(config.itchTarget);
    if (!parsed) {
      errors.push("itchTarget must be in format 'user/game'");
    }
  }

  if (!config.channels || config.channels.length === 0) {
    errors.push("At least one channel must be configured");
  }

  if (config.channels) {
    const enabledChannels = config.channels.filter((c) => c.enabled);
    if (enabledChannels.length === 0) {
      warnings.push("No channels are enabled");
    }

    const seen = new Set<string>();
    for (const ch of config.channels) {
      if (seen.has(ch.channel)) {
        errors.push(`Duplicate channel: ${ch.channel}`);
      }
      seen.add(ch.channel);

      if (!ch.channel || ch.channel.trim() === "") {
        errors.push("Channel name cannot be empty");
      }

      if (!ch.directory || ch.directory.trim() === "") {
        errors.push(`Channel ${ch.channel}: directory is required`);
      }
    }
  }

  if (config.pushTimeout !== undefined && config.pushTimeout <= 0) {
    errors.push("pushTimeout must be positive");
  }

  if (config.publishRetention !== undefined && config.publishRetention < 0) {
    errors.push("publishRetention must be non-negative");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Initialize the itch publisher for a project. Creates .itch-publisher directory.
 * Returns true if freshly initialized, false if already exists.
 */
export function initPublisher(config: ItchPublishConfig): boolean {
  const publisherDir = getPublisherDir(config.projectPath);

  if (existsSync(publisherDir)) {
    return false;
  }

  mkdirSync(publisherDir, { recursive: true });
  mkdirSync(getRunsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");

  const state: ItchPublishState = {
    config,
    lastRunId: null,
    lastRunTime: null,
    totalRuns: 0,
    isRunning: false,
    currentChannel: null,
    createdAt: now,
    updatedAt: now,
  };
  writeState(config.projectPath, state);

  return true;
}

/**
 * Check if a project has the itch publisher initialized.
 */
export function hasPublisher(projectPath: string): boolean {
  return existsSync(getPublisherDir(projectPath));
}

/**
 * Get the current publisher state.
 */
export function getState(projectPath: string): ItchPublishState | null {
  return readState(projectPath);
}

/**
 * Update the publisher configuration.
 */
export function updateConfig(projectPath: string, updates: Partial<ItchPublishConfig>): ItchPublishConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

/**
 * Get the enabled channels from the configuration.
 */
export function getEnabledChannels(projectPath: string): ItchChannelConfig[] {
  const state = readState(projectPath);
  if (!state) return [];
  return state.config.channels.filter((c) => c.enabled);
}

/**
 * Enable or disable a specific channel.
 */
export function setChannelEnabled(projectPath: string, channel: ItchChannel, enabled: boolean): ItchChannelConfig | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  const channelConfig = state.config.channels.find((c) => c.channel === channel);
  if (!channelConfig) return null;

  channelConfig.enabled = enabled;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return channelConfig;
}

/**
 * Add a channel to the publisher configuration.
 */
export function addChannel(projectPath: string, config: ItchChannelConfig): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  if (state.config.channels.some((c) => c.channel === config.channel)) {
    return false;
  }

  state.config.channels.push(config);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Remove a channel from the publisher configuration.
 */
export function removeChannel(projectPath: string, channel: ItchChannel): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  const index = state.config.channels.findIndex((c) => c.channel === channel);
  if (index === -1) return false;

  state.config.channels.splice(index, 1);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Build the butler push arguments for a channel.
 */
export function buildPushArgs(
  config: ItchPublishConfig,
  channelConfig: ItchChannelConfig,
  options?: { userVersion?: string; dryRun?: boolean },
): string[] {
  const target = `${config.itchTarget}:${channelConfig.channel}`;
  const directory = join(resolve(config.projectPath), channelConfig.directory);

  const args: string[] = ["push"];

  if (options?.dryRun) {
    args.push("--dry-run");
  }

  if (config.fixPermissions) {
    args.push("--fix-permissions");
  }

  if (config.ifChanged) {
    args.push("--if-changed");
  }

  const version = options?.userVersion ?? config.userVersion;
  if (version) {
    args.push("--userversion", version);
  }

  args.push(directory, target);

  return args;
}

/**
 * Execute a publish run — pushes builds to itch.io via butler.
 *
 * The executor callback is called per-channel. If no executor is provided,
 * butler CLI is called directly (or dry-run if dryRun is set).
 */
export async function executePublish(
  projectPath: string,
  options?: PublishOptions,
  executor?: (
    channel: ItchChannel,
    channelConfig: ItchChannelConfig,
    pushArgs: string[],
  ) => Promise<{ success: boolean; error?: string; logs?: string[]; buildId?: string; bytesUploaded?: number }>,
  onProgress?: (channel: ItchChannel, message: string) => void,
): Promise<PublishRun> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  if (state.isRunning) {
    throw new Error("A publish is already running. Wait for it to complete.");
  }

  const now = Date.now();
  const runId = generateRunId(now, state.config.projectId);

  state.isRunning = true;
  state.updatedAt = now;
  writeState(projectPath, state);

  const enabledChannels = state.config.channels.filter((c) => c.enabled);
  const requestedChannels = options?.channels
    ? enabledChannels.filter((c) => options.channels!.includes(c.channel))
    : enabledChannels;

  const results: ChannelPublishResult[] = [];

  for (const channelConfig of requestedChannels) {
    state.currentChannel = channelConfig.channel;
    state.updatedAt = Date.now();
    writeState(projectPath, state);

    onProgress?.(channelConfig.channel, `Starting publish for ${channelConfig.channel}...`);

    const pushStart = Date.now();
    const pushArgs = buildPushArgs(state.config, channelConfig, {
      userVersion: options?.userVersion,
      dryRun: options?.dryRun,
    });

    if (!executor) {
      // Dry-run mode when no executor provided
      results.push({
        channel: channelConfig.channel,
        status: "succeeded",
        startedAt: pushStart,
        completedAt: Date.now(),
        duration: Date.now() - pushStart,
        logs: [`Dry-run push for ${channelConfig.channel}: butler ${pushArgs.join(" ")}`],
      });
      onProgress?.(channelConfig.channel, `Publish for ${channelConfig.channel} completed (dry-run)`);
      continue;
    }

    try {
      const result = await executor(channelConfig.channel, channelConfig, pushArgs);
      const pushEnd = Date.now();

      results.push({
        channel: channelConfig.channel,
        status: result.success ? "succeeded" : "failed",
        startedAt: pushStart,
        completedAt: pushEnd,
        duration: pushEnd - pushStart,
        buildId: result.buildId,
        bytesUploaded: result.bytesUploaded,
        error: result.success ? undefined : result.error,
        logs: result.logs ?? [],
      });

      onProgress?.(
        channelConfig.channel,
        result.success
          ? `Publish for ${channelConfig.channel} succeeded`
          : `Publish for ${channelConfig.channel} failed: ${result.error}`,
      );
    } catch (err) {
      const pushEnd = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.push({
        channel: channelConfig.channel,
        status: "failed",
        startedAt: pushStart,
        completedAt: pushEnd,
        duration: pushEnd - pushStart,
        error: errorMsg,
        logs: [`Error: ${errorMsg}`],
      });

      onProgress?.(channelConfig.channel, `Publish for ${channelConfig.channel} failed: ${errorMsg}`);
    }
  }

  const totalDuration = Date.now() - now;

  const run: PublishRun = {
    id: runId,
    projectId: state.config.projectId,
    itchTarget: state.config.itchTarget,
    timestamp: now,
    channels: requestedChannels.map((c) => c.channel),
    userVersion: options?.userVersion ?? state.config.userVersion,
    results,
    status: deriveOverallStatus(results),
    triggeredBy: options?.triggeredBy ?? "manual",
    duration: totalDuration,
    tags: options?.tags,
    metadata: options?.metadata,
  };

  writeRun(projectPath, run);

  state.isRunning = false;
  state.currentChannel = null;
  state.lastRunId = runId;
  state.lastRunTime = now;
  state.totalRuns += 1;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  if (state.config.publishRetention > 0) {
    pruneRuns(projectPath, state.config.publishRetention);
  }

  return run;
}

/**
 * Cancel the currently running publish. Returns true if cancelled.
 */
export function cancelPublish(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Itch publisher not initialized. Call initPublisher() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.currentChannel = null;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

/**
 * Get a single publish run by ID.
 */
export function getRun(projectPath: string, runId: string): PublishRun | null {
  return readRun(projectPath, runId);
}

/**
 * Get publish history for a project.
 */
export function getHistory(projectPath: string, query?: PublishQuery): PublishHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", runs: [], totalCount: 0 };
  }

  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    return { projectId: state.config.projectId, runs: [], totalCount: 0 };
  }

  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const allRuns: PublishRun[] = [];

  for (const file of runFiles) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), "utf-8")) as PublishRun;
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
  if (query?.channel) {
    filtered = filtered.filter((r) => r.channels.includes(query.channel!));
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
        r.itchTarget.toLowerCase().includes(searchLower) ||
        r.triggeredBy.toLowerCase().includes(searchLower) ||
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
 * Get publish statistics.
 */
export function getStats(projectPath: string): PublishStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getHistory(projectPath);

  let totalPushes = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let firstRun: number | null = null;
  let lastRun: number | null = null;
  let totalDuration = 0;
  const channelCounts: Record<string, number> = {};
  const channelSucceeded: Record<string, number> = {};
  const channelTotal: Record<string, number> = {};

  for (const run of history.runs) {
    if (firstRun === null || run.timestamp < firstRun) firstRun = run.timestamp;
    if (lastRun === null || run.timestamp > lastRun) lastRun = run.timestamp;
    totalDuration += run.duration;

    for (const result of run.results) {
      totalPushes++;
      channelCounts[result.channel] = (channelCounts[result.channel] ?? 0) + 1;
      channelTotal[result.channel] = (channelTotal[result.channel] ?? 0) + 1;

      switch (result.status) {
        case "succeeded":
          succeeded++;
          channelSucceeded[result.channel] = (channelSucceeded[result.channel] ?? 0) + 1;
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

  const channelSuccessRates: Record<string, number> = {};
  for (const channel of Object.keys(channelTotal)) {
    const total = channelTotal[channel] ?? 0;
    const succ = channelSucceeded[channel] ?? 0;
    if (total > 0) {
      channelSuccessRates[channel] = Math.round((succ / total) * 100);
    }
  }

  return {
    projectId: state.config.projectId,
    totalRuns: history.totalCount,
    totalPushes,
    succeeded,
    failed,
    cancelled,
    channelCounts,
    channelSuccessRates,
    averageDuration: history.totalCount > 0 ? Math.round(totalDuration / history.totalCount) : 0,
    lastRun,
    firstRun,
  };
}

/**
 * Get the result for a specific channel from a publish run.
 */
export function getChannelResult(run: PublishRun, channel: ItchChannel): ChannelPublishResult | null {
  return run.results.find((r) => r.channel === channel) ?? null;
}

/**
 * Check if a publish run was fully successful.
 */
export function isRunSuccessful(run: PublishRun): boolean {
  return run.results.every((r) => r.status === "succeeded");
}

/**
 * Get failed channels from a publish run.
 */
export function getFailedChannels(run: PublishRun): ItchChannel[] {
  return run.results.filter((r) => r.status === "failed").map((r) => r.channel);
}

/**
 * Get succeeded channels from a publish run.
 */
export function getSucceededChannels(run: PublishRun): ItchChannel[] {
  return run.results.filter((r) => r.status === "succeeded").map((r) => r.channel);
}

/**
 * Prune old publish runs to keep only the latest N.
 */
export function pruneRuns(projectPath: string, keepCount: number): number {
  const history = getHistory(projectPath);
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
 * Format a publish run as a one-line summary.
 */
export function formatRunOneline(run: PublishRun): string {
  const shortId = run.id.slice(0, 7);
  const channelList = run.channels.join(", ");
  const statusIcon =
    run.status === "succeeded" ? "+" :
    run.status === "failed" ? "x" :
    run.status === "cancelled" ? "-" :
    "?";
  const durationSec = (run.duration / 1000).toFixed(1);
  return `${shortId} [${statusIcon}] ${run.itchTarget} -> ${channelList} ${durationSec}s`;
}

/**
 * Format a publish run with full details.
 */
export function formatRunFull(run: PublishRun): string {
  const lines: string[] = [
    `Publish ${run.id}`,
    `Status:      ${run.status}`,
    `Target:      ${run.itchTarget}`,
    `Channels:    ${run.channels.join(", ")}`,
    `Triggered:   ${run.triggeredBy}`,
    `Date:        ${new Date(run.timestamp).toISOString()}`,
    `Duration:    ${(run.duration / 1000).toFixed(1)}s`,
  ];

  if (run.userVersion) {
    lines.push(`Version:     ${run.userVersion}`);
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
    lines.push(`    ${icon} ${result.channel}: ${result.status} (${durationSec}s)`);

    if (result.error) {
      lines.push(`      Error: ${result.error}`);
    }

    if (result.buildId) {
      lines.push(`      Build ID: ${result.buildId}`);
    }

    if (result.bytesUploaded) {
      lines.push(`      Uploaded: ${result.bytesUploaded}B`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a publish summary string for display.
 */
export function generatePublishSummary(run: PublishRun): string {
  const total = run.results.length;
  const succeeded = run.results.filter((r) => r.status === "succeeded").length;
  const failed = run.results.filter((r) => r.status === "failed").length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Publish ${run.id.slice(0, 7)}: ${parts.join(", ")} (${total} total) -> ${run.itchTarget}`;
}

/**
 * Destroy the itch publisher for a project. Removes all data.
 */
export function destroyPublisher(projectPath: string): boolean {
  const publisherDir = getPublisherDir(projectPath);
  if (!existsSync(publisherDir)) return false;

  rmSync(publisherDir, { recursive: true, force: true });
  return true;
}

/**
 * Create a butler executor that actually invokes butler CLI.
 * Use this as the executor parameter for executePublish().
 */
export function createButlerExecutor(
  butlerPath: string,
  options?: { apiKey?: string; timeout?: number },
): (
  channel: ItchChannel,
  channelConfig: ItchChannelConfig,
  pushArgs: string[],
) => Promise<{ success: boolean; error?: string; logs?: string[]; buildId?: string; bytesUploaded?: number }> {
  return async (_channel, _channelConfig, pushArgs) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (options?.apiKey) {
      env["BUTLER_API_KEY"] = options.apiKey;
    }

    const result = spawnSync(butlerPath, pushArgs, {
      timeout: options?.timeout ?? DEFAULT_PUSH_TIMEOUT,
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
        error: stderr || `butler exited with code ${result.status}`,
        logs,
      };
    }

    // Try to extract build ID from butler output
    const buildIdMatch = stdout.match(/build\s+(\d+)/i);
    const buildId = buildIdMatch ? buildIdMatch[1] : undefined;

    // Try to extract bytes from butler output
    const bytesMatch = stdout.match(/([\d,]+)\s*bytes?/i);
    const bytesUploaded = bytesMatch ? parseInt(bytesMatch[1].replace(/,/g, ""), 10) : undefined;

    return {
      success: true,
      logs,
      buildId,
      bytesUploaded,
    };
  };
}
