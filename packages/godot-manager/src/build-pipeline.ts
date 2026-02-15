import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────

export type BuildPlatform = "web" | "windows" | "linux" | "macos";

export type BuildStatus =
  | "pending"
  | "queued"
  | "building"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped";

export type BuildProfile = "debug" | "release" | "release-debug";

export type ArtifactType = "executable" | "archive" | "installer" | "web-bundle";

export interface PlatformConfig {
  platform: BuildPlatform;
  enabled: boolean;
  preset: string;
  profile: BuildProfile;
  outputDir: string;
  fileExtension: string;
  exportArgs?: string[];
  timeout?: number;
  env?: Record<string, string>;
}

export interface BuildArtifact {
  platform: BuildPlatform;
  path: string;
  size: number;
  hash: string;
  type: ArtifactType;
  createdAt: number;
}

export interface PlatformBuildResult {
  platform: BuildPlatform;
  status: BuildStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  artifact?: BuildArtifact;
  error?: string;
  logs: string[];
}

export interface BuildRun {
  id: string;
  projectId: string;
  timestamp: number;
  platforms: BuildPlatform[];
  profile: BuildProfile;
  results: PlatformBuildResult[];
  status: BuildStatus;
  triggeredBy: string;
  duration: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface BuildPipelineConfig {
  projectId: string;
  projectPath: string;
  platforms: PlatformConfig[];
  defaultProfile: BuildProfile;
  parallelBuilds: boolean;
  maxRetries: number;
  artifactRetention: number;
  cleanBefore: boolean;
}

export interface BuildPipelineState {
  config: BuildPipelineConfig;
  lastRunId: string | null;
  lastRunTime: number | null;
  totalRuns: number;
  isRunning: boolean;
  currentPlatform: BuildPlatform | null;
  createdAt: number;
  updatedAt: number;
}

export interface BuildHistory {
  projectId: string;
  runs: BuildRun[];
  totalCount: number;
}

export interface BuildQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  platform?: BuildPlatform;
  status?: BuildStatus;
  profile?: BuildProfile;
  triggeredBy?: string;
  search?: string;
}

export interface BuildStats {
  projectId: string;
  totalRuns: number;
  totalBuilds: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  skipped: number;
  platformCounts: Partial<Record<BuildPlatform, number>>;
  platformSuccessRates: Partial<Record<BuildPlatform, number>>;
  averageDuration: number;
  lastRun: number | null;
  firstRun: number | null;
}

export interface BuildMatrix {
  platforms: BuildPlatform[];
  profile: BuildProfile;
  triggeredBy: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Override per-platform configs */
  overrides?: Partial<Record<BuildPlatform, Partial<PlatformConfig>>>;
}

export interface PipelineValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PIPELINE_DIR = ".build-pipeline";
const RUNS_DIR = "runs";
const ARTIFACTS_DIR = "artifacts";
const STATE_FILE = "state.json";
const CONFIG_FILE = "config.json";

const DEFAULT_PLATFORM_CONFIGS: Record<BuildPlatform, Omit<PlatformConfig, "enabled">> = {
  web: {
    platform: "web",
    preset: "Web",
    profile: "release",
    outputDir: "exports/web",
    fileExtension: ".html",
    timeout: 120_000,
  },
  windows: {
    platform: "windows",
    preset: "Windows Desktop",
    profile: "release",
    outputDir: "exports/windows",
    fileExtension: ".exe",
    timeout: 180_000,
  },
  linux: {
    platform: "linux",
    preset: "Linux",
    profile: "release",
    outputDir: "exports/linux",
    fileExtension: "",
    timeout: 180_000,
  },
  macos: {
    platform: "macos",
    preset: "macOS",
    profile: "release",
    outputDir: "exports/macos",
    fileExtension: ".dmg",
    timeout: 180_000,
  },
};

const PLATFORM_ARTIFACT_TYPES: Record<BuildPlatform, ArtifactType> = {
  web: "web-bundle",
  windows: "executable",
  linux: "executable",
  macos: "installer",
};

const ALL_PLATFORMS: BuildPlatform[] = ["web", "windows", "linux", "macos"];

// ─── Internal Helpers ──────────────────────────────────────────────────────

function getPipelineDir(projectPath: string): string {
  return join(resolve(projectPath), PIPELINE_DIR);
}

function getRunsDir(projectPath: string): string {
  return join(getPipelineDir(projectPath), RUNS_DIR);
}

function getArtifactsDir(projectPath: string): string {
  return join(getPipelineDir(projectPath), ARTIFACTS_DIR);
}

function getStatePath(projectPath: string): string {
  return join(getPipelineDir(projectPath), STATE_FILE);
}

function getConfigPath(projectPath: string): string {
  return join(getPipelineDir(projectPath), CONFIG_FILE);
}

function readState(projectPath: string): BuildPipelineState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: BuildPipelineState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readRun(projectPath: string, runId: string): BuildRun | null {
  const runPath = join(getRunsDir(projectPath), `${runId}.json`);
  if (!existsSync(runPath)) return null;
  return JSON.parse(readFileSync(runPath, "utf-8"));
}

function writeRun(projectPath: string, run: BuildRun): void {
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

function computeArtifactHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function deriveOverallStatus(results: PlatformBuildResult[]): BuildStatus {
  if (results.length === 0) return "pending";

  const statuses = results.map((r) => r.status);

  if (statuses.every((s) => s === "succeeded" || s === "skipped")) return "succeeded";
  if (statuses.some((s) => s === "building")) return "building";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "pending" || s === "queued")) return "queued";

  return "failed";
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the default platform configurations for all supported platforms.
 */
export function getDefaultPlatformConfigs(): PlatformConfig[] {
  return ALL_PLATFORMS.map((platform) => ({
    ...DEFAULT_PLATFORM_CONFIGS[platform],
    enabled: true,
  }));
}

/**
 * Get the default config for a specific platform.
 */
export function getDefaultPlatformConfig(platform: BuildPlatform): PlatformConfig {
  return {
    ...DEFAULT_PLATFORM_CONFIGS[platform],
    enabled: true,
  };
}

/**
 * Get the list of all supported platforms.
 */
export function getSupportedPlatforms(): BuildPlatform[] {
  return [...ALL_PLATFORMS];
}

/**
 * Get the artifact type for a platform.
 */
export function getArtifactType(platform: BuildPlatform): ArtifactType {
  return PLATFORM_ARTIFACT_TYPES[platform];
}

/**
 * Validate a pipeline configuration. Returns errors and warnings.
 */
export function validatePipelineConfig(config: Partial<BuildPipelineConfig>): PipelineValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.projectId || config.projectId.trim() === "") {
    errors.push("projectId is required");
  }

  if (!config.projectPath || config.projectPath.trim() === "") {
    errors.push("projectPath is required");
  }

  if (!config.platforms || config.platforms.length === 0) {
    errors.push("At least one platform must be configured");
  }

  if (config.platforms) {
    const enabledPlatforms = config.platforms.filter((p) => p.enabled);
    if (enabledPlatforms.length === 0) {
      warnings.push("No platforms are enabled");
    }

    const seen = new Set<BuildPlatform>();
    for (const p of config.platforms) {
      if (seen.has(p.platform)) {
        errors.push(`Duplicate platform: ${p.platform}`);
      }
      seen.add(p.platform);

      if (!ALL_PLATFORMS.includes(p.platform)) {
        errors.push(`Unsupported platform: ${p.platform}`);
      }

      if (!p.preset || p.preset.trim() === "") {
        errors.push(`Platform ${p.platform}: preset is required`);
      }

      if (!p.outputDir || p.outputDir.trim() === "") {
        errors.push(`Platform ${p.platform}: outputDir is required`);
      }

      if (p.timeout !== undefined && p.timeout <= 0) {
        errors.push(`Platform ${p.platform}: timeout must be positive`);
      }
    }
  }

  if (config.maxRetries !== undefined && config.maxRetries < 0) {
    errors.push("maxRetries must be non-negative");
  }

  if (config.artifactRetention !== undefined && config.artifactRetention < 0) {
    errors.push("artifactRetention must be non-negative");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Initialize the build pipeline for a project. Creates .build-pipeline directory structure.
 * Returns true if freshly initialized, false if already exists.
 */
export function initPipeline(config: BuildPipelineConfig): boolean {
  const pipelineDir = getPipelineDir(config.projectPath);

  if (existsSync(pipelineDir)) {
    return false;
  }

  mkdirSync(pipelineDir, { recursive: true });
  mkdirSync(getRunsDir(config.projectPath), { recursive: true });
  mkdirSync(getArtifactsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");

  const state: BuildPipelineState = {
    config,
    lastRunId: null,
    lastRunTime: null,
    totalRuns: 0,
    isRunning: false,
    currentPlatform: null,
    createdAt: now,
    updatedAt: now,
  };
  writeState(config.projectPath, state);

  return true;
}

/**
 * Check if a project has a build pipeline initialized.
 */
export function hasPipeline(projectPath: string): boolean {
  return existsSync(getPipelineDir(projectPath));
}

/**
 * Get the current build pipeline state.
 */
export function getState(projectPath: string): BuildPipelineState | null {
  return readState(projectPath);
}

/**
 * Update the build pipeline configuration.
 */
export function updateConfig(projectPath: string, updates: Partial<BuildPipelineConfig>): BuildPipelineConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

/**
 * Get the enabled platforms from the configuration.
 */
export function getEnabledPlatforms(projectPath: string): PlatformConfig[] {
  const state = readState(projectPath);
  if (!state) return [];
  return state.config.platforms.filter((p) => p.enabled);
}

/**
 * Enable or disable a specific platform.
 */
export function setPlatformEnabled(projectPath: string, platform: BuildPlatform, enabled: boolean): PlatformConfig | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  const platformConfig = state.config.platforms.find((p) => p.platform === platform);
  if (!platformConfig) return null;

  platformConfig.enabled = enabled;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return platformConfig;
}

/**
 * Add a platform to the pipeline configuration.
 */
export function addPlatform(projectPath: string, config: PlatformConfig): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  if (state.config.platforms.some((p) => p.platform === config.platform)) {
    return false;
  }

  state.config.platforms.push(config);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Remove a platform from the pipeline configuration.
 */
export function removePlatform(projectPath: string, platform: BuildPlatform): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  const index = state.config.platforms.findIndex((p) => p.platform === platform);
  if (index === -1) return false;

  state.config.platforms.splice(index, 1);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Create a build matrix (specification for what to build).
 */
export function createBuildMatrix(
  projectPath: string,
  options?: {
    platforms?: BuildPlatform[];
    profile?: BuildProfile;
    triggeredBy?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    overrides?: Partial<Record<BuildPlatform, Partial<PlatformConfig>>>;
  },
): BuildMatrix {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  const enabledPlatforms = state.config.platforms
    .filter((p) => p.enabled)
    .map((p) => p.platform);

  const platforms = options?.platforms
    ? options.platforms.filter((p) => enabledPlatforms.includes(p))
    : enabledPlatforms;

  return {
    platforms,
    profile: options?.profile ?? state.config.defaultProfile,
    triggeredBy: options?.triggeredBy ?? "manual",
    tags: options?.tags,
    metadata: options?.metadata,
    overrides: options?.overrides,
  };
}

/**
 * Execute a build run for the given matrix.
 * This simulates/records the build execution (actual Godot export is done by export.ts).
 * Returns a BuildRun with results for each platform.
 *
 * The executor callback is called per-platform to perform the actual build.
 * If no executor is provided, all builds are marked as succeeded (dry-run).
 */
export async function executeBuild(
  projectPath: string,
  matrix: BuildMatrix,
  executor?: (platform: BuildPlatform, config: PlatformConfig) => Promise<{ success: boolean; error?: string; logs?: string[]; artifactSize?: number }>,
  onProgress?: (platform: BuildPlatform, message: string) => void,
): Promise<BuildRun> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  if (state.isRunning) {
    throw new Error("A build is already running. Wait for it to complete.");
  }

  const now = Date.now();
  const runId = generateRunId(now, state.config.projectId);

  state.isRunning = true;
  state.updatedAt = now;
  writeState(projectPath, state);

  const results: PlatformBuildResult[] = [];

  for (const platform of matrix.platforms) {
    const platformConfig = state.config.platforms.find((p) => p.platform === platform);
    if (!platformConfig) {
      results.push({
        platform,
        status: "skipped",
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 0,
        logs: [`Platform ${platform} not configured`],
      });
      continue;
    }

    const mergedConfig = matrix.overrides?.[platform]
      ? { ...platformConfig, ...matrix.overrides[platform] }
      : platformConfig;

    state.currentPlatform = platform;
    state.updatedAt = Date.now();
    writeState(projectPath, state);

    onProgress?.(platform, `Starting build for ${platform}...`);

    const buildStart = Date.now();

    if (!executor) {
      const artifactPath = join(
        mergedConfig.outputDir,
        `game${mergedConfig.fileExtension}`,
      );
      results.push({
        platform,
        status: "succeeded",
        startedAt: buildStart,
        completedAt: Date.now(),
        duration: Date.now() - buildStart,
        artifact: {
          platform,
          path: artifactPath,
          size: 0,
          hash: computeArtifactHash(`${platform}:${runId}:${buildStart}`),
          type: PLATFORM_ARTIFACT_TYPES[platform],
          createdAt: Date.now(),
        },
        logs: [`Dry-run build for ${platform}`],
      });
      onProgress?.(platform, `Build for ${platform} completed (dry-run)`);
      continue;
    }

    let retries = 0;
    let success = false;
    let lastError: string | undefined;
    let lastLogs: string[] = [];
    let artifactSize = 0;

    while (retries <= state.config.maxRetries && !success) {
      try {
        const result = await executor(platform, mergedConfig);
        if (result.success) {
          success = true;
          lastLogs = result.logs ?? [];
          artifactSize = result.artifactSize ?? 0;
        } else {
          lastError = result.error ?? "Build failed";
          lastLogs = result.logs ?? [];
          retries++;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        lastLogs.push(`Error: ${lastError}`);
        retries++;
      }
    }

    const buildEnd = Date.now();
    const artifactPath = join(
      mergedConfig.outputDir,
      `game${mergedConfig.fileExtension}`,
    );

    results.push({
      platform,
      status: success ? "succeeded" : "failed",
      startedAt: buildStart,
      completedAt: buildEnd,
      duration: buildEnd - buildStart,
      artifact: success
        ? {
            platform,
            path: artifactPath,
            size: artifactSize,
            hash: computeArtifactHash(`${platform}:${runId}:${buildEnd}`),
            type: PLATFORM_ARTIFACT_TYPES[platform],
            createdAt: buildEnd,
          }
        : undefined,
      error: success ? undefined : lastError,
      logs: lastLogs,
    });

    onProgress?.(
      platform,
      success ? `Build for ${platform} succeeded` : `Build for ${platform} failed: ${lastError}`,
    );
  }

  const totalDuration = Date.now() - now;

  const run: BuildRun = {
    id: runId,
    projectId: state.config.projectId,
    timestamp: now,
    platforms: matrix.platforms,
    profile: matrix.profile,
    results,
    status: deriveOverallStatus(results),
    triggeredBy: matrix.triggeredBy,
    duration: totalDuration,
    tags: matrix.tags,
    metadata: matrix.metadata,
  };

  writeRun(projectPath, run);

  state.isRunning = false;
  state.currentPlatform = null;
  state.lastRunId = runId;
  state.lastRunTime = now;
  state.totalRuns += 1;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  if (state.config.artifactRetention > 0) {
    pruneRuns(projectPath, state.config.artifactRetention);
  }

  return run;
}

/**
 * Cancel the currently running build. Returns true if a build was cancelled.
 */
export function cancelBuild(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Build pipeline not initialized. Call initPipeline() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.currentPlatform = null;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

/**
 * Get a single build run by ID.
 */
export function getRun(projectPath: string, runId: string): BuildRun | null {
  return readRun(projectPath, runId);
}

/**
 * Get build history for a project.
 */
export function getHistory(projectPath: string, query?: BuildQuery): BuildHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", runs: [], totalCount: 0 };
  }

  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    return { projectId: state.config.projectId, runs: [], totalCount: 0 };
  }

  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const allRuns: BuildRun[] = [];

  for (const file of runFiles) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), "utf-8")) as BuildRun;
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
  if (query?.platform) {
    filtered = filtered.filter((r) => r.platforms.includes(query.platform!));
  }
  if (query?.status) {
    filtered = filtered.filter((r) => r.status === query.status);
  }
  if (query?.profile) {
    filtered = filtered.filter((r) => r.profile === query.profile);
  }
  if (query?.triggeredBy) {
    filtered = filtered.filter((r) => r.triggeredBy === query.triggeredBy);
  }
  if (query?.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.id.includes(searchLower) ||
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
 * Get build statistics.
 */
export function getStats(projectPath: string): BuildStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getHistory(projectPath);

  let totalBuilds = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let skipped = 0;
  let firstRun: number | null = null;
  let lastRun: number | null = null;
  let totalDuration = 0;
  const platformCounts: Partial<Record<BuildPlatform, number>> = {};
  const platformSucceeded: Partial<Record<BuildPlatform, number>> = {};
  const platformTotal: Partial<Record<BuildPlatform, number>> = {};

  for (const run of history.runs) {
    if (firstRun === null || run.timestamp < firstRun) firstRun = run.timestamp;
    if (lastRun === null || run.timestamp > lastRun) lastRun = run.timestamp;
    totalDuration += run.duration;

    for (const result of run.results) {
      totalBuilds++;
      platformCounts[result.platform] = (platformCounts[result.platform] ?? 0) + 1;
      platformTotal[result.platform] = (platformTotal[result.platform] ?? 0) + 1;

      switch (result.status) {
        case "succeeded":
          succeeded++;
          platformSucceeded[result.platform] = (platformSucceeded[result.platform] ?? 0) + 1;
          break;
        case "failed":
          failed++;
          break;
        case "cancelled":
          cancelled++;
          break;
        case "skipped":
          skipped++;
          break;
      }
    }
  }

  const platformSuccessRates: Partial<Record<BuildPlatform, number>> = {};
  for (const platform of ALL_PLATFORMS) {
    const total = platformTotal[platform] ?? 0;
    const succ = platformSucceeded[platform] ?? 0;
    if (total > 0) {
      platformSuccessRates[platform] = Math.round((succ / total) * 100);
    }
  }

  return {
    projectId: state.config.projectId,
    totalRuns: history.totalCount,
    totalBuilds,
    succeeded,
    failed,
    cancelled,
    skipped,
    platformCounts,
    platformSuccessRates,
    averageDuration: history.totalCount > 0 ? Math.round(totalDuration / history.totalCount) : 0,
    lastRun,
    firstRun,
  };
}

/**
 * Get the result for a specific platform from a build run.
 */
export function getPlatformResult(run: BuildRun, platform: BuildPlatform): PlatformBuildResult | null {
  return run.results.find((r) => r.platform === platform) ?? null;
}

/**
 * Check if a build run was fully successful (all platforms succeeded or were skipped).
 */
export function isRunSuccessful(run: BuildRun): boolean {
  return run.results.every((r) => r.status === "succeeded" || r.status === "skipped");
}

/**
 * Get the failed platforms from a build run.
 */
export function getFailedPlatforms(run: BuildRun): BuildPlatform[] {
  return run.results.filter((r) => r.status === "failed").map((r) => r.platform);
}

/**
 * Get the succeeded platforms from a build run.
 */
export function getSucceededPlatforms(run: BuildRun): BuildPlatform[] {
  return run.results.filter((r) => r.status === "succeeded").map((r) => r.platform);
}

/**
 * Get all artifacts from a build run.
 */
export function getRunArtifacts(run: BuildRun): BuildArtifact[] {
  return run.results
    .filter((r) => r.artifact != null)
    .map((r) => r.artifact!);
}

/**
 * Prune old build runs to keep only the latest N.
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
 * Format a build run as a one-line summary.
 */
export function formatRunOneline(run: BuildRun): string {
  const shortId = run.id.slice(0, 7);
  const platformList = run.platforms.join(", ");
  const statusIcon =
    run.status === "succeeded" ? "+" :
    run.status === "failed" ? "x" :
    run.status === "cancelled" ? "-" :
    "?";
  const durationSec = (run.duration / 1000).toFixed(1);
  return `${shortId} [${statusIcon}] ${platformList} (${run.profile}) ${durationSec}s`;
}

/**
 * Format a build run with full details.
 */
export function formatRunFull(run: BuildRun): string {
  const lines: string[] = [
    `Build ${run.id}`,
    `Status:      ${run.status}`,
    `Profile:     ${run.profile}`,
    `Platforms:   ${run.platforms.join(", ")}`,
    `Triggered:   ${run.triggeredBy}`,
    `Date:        ${new Date(run.timestamp).toISOString()}`,
    `Duration:    ${(run.duration / 1000).toFixed(1)}s`,
  ];

  if (run.tags && run.tags.length > 0) {
    lines.push(`Tags:        ${run.tags.join(", ")}`);
  }

  lines.push("", "  Results:");

  for (const result of run.results) {
    const icon =
      result.status === "succeeded" ? "+" :
      result.status === "failed" ? "x" :
      result.status === "skipped" ? "~" :
      result.status === "cancelled" ? "-" :
      "?";

    const durationSec = (result.duration / 1000).toFixed(1);
    lines.push(`    ${icon} ${result.platform}: ${result.status} (${durationSec}s)`);

    if (result.error) {
      lines.push(`      Error: ${result.error}`);
    }

    if (result.artifact) {
      lines.push(`      Artifact: ${result.artifact.path} (${result.artifact.size}B)`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a build summary string for display.
 */
export function generateBuildSummary(run: BuildRun): string {
  const total = run.results.length;
  const succeeded = run.results.filter((r) => r.status === "succeeded").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  const skipped = run.results.filter((r) => r.status === "skipped").length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);

  return `Build ${run.id.slice(0, 7)}: ${parts.join(", ")} (${total} total)`;
}

/**
 * Destroy the build pipeline for a project. Removes all data.
 */
export function destroyPipeline(projectPath: string): boolean {
  const pipelineDir = getPipelineDir(projectPath);
  if (!existsSync(pipelineDir)) return false;

  rmSync(pipelineDir, { recursive: true, force: true });
  return true;
}
