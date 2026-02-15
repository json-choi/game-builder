import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export type WebPlatform =
  | "netlify"
  | "vercel"
  | "gh-pages"
  | "s3"
  | "cloudflare-pages"
  | string;

export type WebPublishStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface WebPlatformConfig {
  platform: WebPlatform;
  enabled: boolean;
  directory: string;
  platformConfig: NetlifyConfig | VercelConfig | GhPagesConfig | S3Config | CloudflarePagesConfig;
}

export interface NetlifyConfig {
  siteId: string;
  authToken?: string;
  production: boolean;
  functions?: string;
  message?: string;
}

export interface VercelConfig {
  projectId: string;
  orgId?: string;
  token?: string;
  production: boolean;
  environment?: Record<string, string>;
}

export interface GhPagesConfig {
  repo: string;
  branch: string;
  cname?: string;
  message?: string;
  nojekyll: boolean;
}

export interface S3Config {
  bucket: string;
  region: string;
  prefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  acl?: string;
  cacheControl?: string;
  cloudFrontDistributionId?: string;
}

export interface CloudflarePagesConfig {
  projectName: string;
  accountId?: string;
  apiToken?: string;
  branch?: string;
}

export interface WebToolInfo {
  installed: boolean;
  version?: string;
  path?: string;
  tool: string;
}

export interface WebAuthStatus {
  authenticated: boolean;
  platform: WebPlatform;
  identity?: string;
}

export interface PlatformPublishResult {
  platform: WebPlatform;
  status: WebPublishStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  deployUrl?: string;
  deployId?: string;
  error?: string;
  logs: string[];
}

export interface WebPublishRun {
  id: string;
  projectId: string;
  timestamp: number;
  platforms: WebPlatform[];
  results: PlatformPublishResult[];
  status: WebPublishStatus;
  triggeredBy: string;
  duration: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface WebPublishConfig {
  projectId: string;
  projectPath: string;
  platforms: WebPlatformConfig[];
  uploadTimeout: number;
  publishRetention: number;
}

export interface WebPublishState {
  config: WebPublishConfig;
  lastRunId: string | null;
  lastRunTime: number | null;
  totalRuns: number;
  isRunning: boolean;
  currentPlatform: WebPlatform | null;
  createdAt: number;
  updatedAt: number;
}

export interface WebPublishHistory {
  projectId: string;
  runs: WebPublishRun[];
  totalCount: number;
}

export interface WebPublishQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  platform?: WebPlatform;
  status?: WebPublishStatus;
  triggeredBy?: string;
  search?: string;
}

export interface WebPublishStats {
  projectId: string;
  totalRuns: number;
  totalDeploys: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  platformCounts: Record<string, number>;
  platformSuccessRates: Record<string, number>;
  averageDuration: number;
  lastRun: number | null;
  firstRun: number | null;
}

export interface WebPublishValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WebPublishOptions {
  platforms?: WebPlatform[];
  triggeredBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PUBLISHER_DIR = ".web-publisher";
const RUNS_DIR = "runs";
const STATE_FILE = "state.json";
const CONFIG_FILE = "config.json";

const DEFAULT_PLATFORMS: WebPlatformConfig[] = [
  {
    platform: "netlify",
    enabled: true,
    directory: "exports/web",
    platformConfig: {
      siteId: "",
      production: false,
    } as NetlifyConfig,
  },
  {
    platform: "gh-pages",
    enabled: true,
    directory: "exports/web",
    platformConfig: {
      repo: "",
      branch: "gh-pages",
      nojekyll: true,
    } as GhPagesConfig,
  },
];

const ALL_PLATFORMS: WebPlatform[] = ["netlify", "vercel", "gh-pages", "s3", "cloudflare-pages"];

const DEFAULT_UPLOAD_TIMEOUT = 300_000;

// ─── Type Guards ───────────────────────────────────────────────────────────

export function isNetlifyConfig(config: WebPlatformConfig["platformConfig"]): config is NetlifyConfig {
  return "siteId" in config;
}

export function isVercelConfig(config: WebPlatformConfig["platformConfig"]): config is VercelConfig {
  return "projectId" in config && "production" in config && !("siteId" in config);
}

export function isGhPagesConfig(config: WebPlatformConfig["platformConfig"]): config is GhPagesConfig {
  return "repo" in config && "branch" in config && "nojekyll" in config;
}

export function isS3Config(config: WebPlatformConfig["platformConfig"]): config is S3Config {
  return "bucket" in config && "region" in config;
}

export function isCloudfarePagesConfig(config: WebPlatformConfig["platformConfig"]): config is CloudflarePagesConfig {
  return "projectName" in config;
}

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

function readState(projectPath: string): WebPublishState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: WebPublishState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readRun(projectPath: string, runId: string): WebPublishRun | null {
  const runPath = join(getRunsDir(projectPath), `${runId}.json`);
  if (!existsSync(runPath)) return null;
  return JSON.parse(readFileSync(runPath, "utf-8"));
}

function writeRun(projectPath: string, run: WebPublishRun): void {
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

function deriveOverallStatus(results: PlatformPublishResult[]): WebPublishStatus {
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

export function getDefaultPlatforms(): WebPlatformConfig[] {
  return DEFAULT_PLATFORMS.map((p) => ({
    ...p,
    platformConfig: { ...p.platformConfig },
  }));
}

export function getSupportedPlatformNames(): WebPlatform[] {
  return [...ALL_PLATFORMS];
}

export function detectWebTool(platform: WebPlatform, toolPath?: string): WebToolInfo {
  const toolMap: Record<string, string[]> = {
    "netlify": ["netlify"],
    "vercel": ["vercel"],
    "gh-pages": ["gh"],
    "s3": ["aws"],
    "cloudflare-pages": ["wrangler"],
  };

  const tools = toolPath ? [toolPath] : (toolMap[platform] ?? [platform]);

  for (const tool of tools) {
    try {
      const result = spawnSync(tool, ["--version"], {
        timeout: 10_000,
        encoding: "utf-8",
      });

      if (result.error) continue;

      const output = (result.stdout ?? "").trim();
      const versionMatch = output.match(/v?([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : undefined;

      if (result.status === 0) {
        return { installed: true, version, path: tool, tool };
      }
    } catch {
      continue;
    }
  }

  return { installed: false, tool: tools[0] ?? platform };
}

export function checkWebAuth(platform: WebPlatform, config: WebPlatformConfig["platformConfig"]): WebAuthStatus {
  switch (platform) {
    case "netlify": {
      const nc = config as NetlifyConfig;
      if (nc.authToken && nc.siteId) {
        return { authenticated: true, platform, identity: `Site: ${nc.siteId}` };
      }
      return { authenticated: false, platform };
    }
    case "vercel": {
      const vc = config as VercelConfig;
      if (vc.token && vc.projectId) {
        return { authenticated: true, platform, identity: `Project: ${vc.projectId}` };
      }
      return { authenticated: false, platform };
    }
    case "gh-pages": {
      const gc = config as GhPagesConfig;
      if (gc.repo) {
        return { authenticated: true, platform, identity: `Repo: ${gc.repo}` };
      }
      return { authenticated: false, platform };
    }
    case "s3": {
      const sc = config as S3Config;
      if (sc.bucket && sc.region) {
        return { authenticated: true, platform, identity: `Bucket: ${sc.bucket}` };
      }
      return { authenticated: false, platform };
    }
    case "cloudflare-pages": {
      const cc = config as CloudflarePagesConfig;
      if (cc.projectName && cc.apiToken) {
        return { authenticated: true, platform, identity: `Project: ${cc.projectName}` };
      }
      return { authenticated: false, platform };
    }
    default:
      return { authenticated: false, platform };
  }
}

export function validateWebPublishConfig(config: Partial<WebPublishConfig>): WebPublishValidation {
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

    const seen = new Set<string>();
    for (const plat of config.platforms) {
      if (seen.has(plat.platform)) {
        errors.push(`Duplicate platform: ${plat.platform}`);
      }
      seen.add(plat.platform);

      if (!plat.platform || plat.platform.trim() === "") {
        errors.push("Platform name cannot be empty");
      }

      if (!plat.directory || plat.directory.trim() === "") {
        errors.push(`Platform ${plat.platform}: directory is required`);
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

export function buildNetlifyDeployArgs(
  config: WebPublishConfig,
  platformConfig: WebPlatformConfig,
  options?: { dryRun?: boolean },
): string[] {
  const nc = platformConfig.platformConfig as NetlifyConfig;
  const directory = join(resolve(config.projectPath), platformConfig.directory);
  const args: string[] = ["deploy"];

  args.push("--dir", directory);

  if (nc.siteId) {
    args.push("--site", nc.siteId);
  }

  if (nc.authToken) {
    args.push("--auth", nc.authToken);
  }

  if (nc.production && !options?.dryRun) {
    args.push("--prod");
  }

  if (nc.functions) {
    args.push("--functions", nc.functions);
  }

  if (nc.message) {
    args.push("--message", nc.message);
  }

  if (options?.dryRun) {
    args.push("--build");
  }

  return args;
}

export function buildVercelDeployArgs(
  config: WebPublishConfig,
  platformConfig: WebPlatformConfig,
  options?: { dryRun?: boolean },
): string[] {
  const vc = platformConfig.platformConfig as VercelConfig;
  const directory = join(resolve(config.projectPath), platformConfig.directory);
  const args: string[] = ["deploy", directory];

  if (vc.token) {
    args.push("--token", vc.token);
  }

  if (vc.production && !options?.dryRun) {
    args.push("--prod");
  }

  args.push("--yes");

  return args;
}

export function buildGhPagesDeployArgs(
  config: WebPublishConfig,
  platformConfig: WebPlatformConfig,
  _options?: { dryRun?: boolean },
): string[] {
  const gc = platformConfig.platformConfig as GhPagesConfig;
  const directory = join(resolve(config.projectPath), platformConfig.directory);
  const args: string[] = ["deploy", "--dir", directory];

  if (gc.branch) {
    args.push("--branch", gc.branch);
  }

  if (gc.repo) {
    args.push("--repo", gc.repo);
  }

  if (gc.message) {
    args.push("--message", gc.message);
  }

  if (gc.nojekyll) {
    args.push("--nojekyll");
  }

  return args;
}

export function buildS3DeployArgs(
  config: WebPublishConfig,
  platformConfig: WebPlatformConfig,
  options?: { dryRun?: boolean },
): string[] {
  const sc = platformConfig.platformConfig as S3Config;
  const directory = join(resolve(config.projectPath), platformConfig.directory);
  const prefix = sc.prefix ? `${sc.prefix}/` : "";
  const target = `s3://${sc.bucket}/${prefix}`;

  const args: string[] = ["s3", "sync", directory, target];

  args.push("--region", sc.region);

  if (sc.acl) {
    args.push("--acl", sc.acl);
  }

  if (sc.cacheControl) {
    args.push("--cache-control", sc.cacheControl);
  }

  if (options?.dryRun) {
    args.push("--dryrun");
  }

  args.push("--delete");

  return args;
}

export function buildDeployArgs(
  config: WebPublishConfig,
  platformConfig: WebPlatformConfig,
  options?: { dryRun?: boolean },
): string[] {
  switch (platformConfig.platform) {
    case "netlify":
      return buildNetlifyDeployArgs(config, platformConfig, options);
    case "vercel":
      return buildVercelDeployArgs(config, platformConfig, options);
    case "gh-pages":
      return buildGhPagesDeployArgs(config, platformConfig, options);
    case "s3":
      return buildS3DeployArgs(config, platformConfig, options);
    default:
      return ["deploy", join(resolve(config.projectPath), platformConfig.directory)];
  }
}

export function initWebPublisher(config: WebPublishConfig): boolean {
  const publisherDir = getPublisherDir(config.projectPath);

  if (existsSync(publisherDir)) {
    return false;
  }

  mkdirSync(publisherDir, { recursive: true });
  mkdirSync(getRunsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");

  const state: WebPublishState = {
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

export function hasWebPublisher(projectPath: string): boolean {
  return existsSync(getPublisherDir(projectPath));
}

export function getWebPublishState(projectPath: string): WebPublishState | null {
  return readState(projectPath);
}

export function updateWebPublishConfig(projectPath: string, updates: Partial<WebPublishConfig>): WebPublishConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

export function getEnabledPlatforms(projectPath: string): WebPlatformConfig[] {
  const state = readState(projectPath);
  if (!state) return [];
  return state.config.platforms.filter((p) => p.enabled);
}

export function setPlatformEnabled(projectPath: string, platform: WebPlatform, enabled: boolean): WebPlatformConfig | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
  }

  const platConfig = state.config.platforms.find((p) => p.platform === platform);
  if (!platConfig) return null;

  platConfig.enabled = enabled;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return platConfig;
}

export function addPlatform(projectPath: string, config: WebPlatformConfig): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
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

export function removePlatform(projectPath: string, platform: WebPlatform): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
  }

  const index = state.config.platforms.findIndex((p) => p.platform === platform);
  if (index === -1) return false;

  state.config.platforms.splice(index, 1);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

export async function executeWebPublish(
  projectPath: string,
  options?: WebPublishOptions,
  executor?: (
    platform: WebPlatform,
    platformConfig: WebPlatformConfig,
    deployArgs: string[],
  ) => Promise<{ success: boolean; error?: string; logs?: string[]; deployUrl?: string; deployId?: string }>,
  onProgress?: (platform: WebPlatform, message: string) => void,
): Promise<WebPublishRun> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
  }

  if (state.isRunning) {
    throw new Error("A publish is already running. Wait for it to complete.");
  }

  const now = Date.now();
  const runId = generateRunId(now, state.config.projectId);

  state.isRunning = true;
  state.updatedAt = now;
  writeState(projectPath, state);

  const enabledPlatforms = state.config.platforms.filter((p) => p.enabled);
  const requestedPlatforms = options?.platforms
    ? enabledPlatforms.filter((p) => options.platforms!.includes(p.platform))
    : enabledPlatforms;

  const results: PlatformPublishResult[] = [];

  for (const platConfig of requestedPlatforms) {
    state.currentPlatform = platConfig.platform;
    state.updatedAt = Date.now();
    writeState(projectPath, state);

    onProgress?.(platConfig.platform, `Starting deploy for ${platConfig.platform}...`);

    const deployStart = Date.now();
    const deployArgs = buildDeployArgs(state.config, platConfig, {
      dryRun: options?.dryRun,
    });

    if (!executor) {
      results.push({
        platform: platConfig.platform,
        status: "succeeded",
        startedAt: deployStart,
        completedAt: Date.now(),
        duration: Date.now() - deployStart,
        logs: [`Dry-run deploy for ${platConfig.platform}: ${deployArgs.join(" ")}`],
      });
      onProgress?.(platConfig.platform, `Deploy for ${platConfig.platform} completed (dry-run)`);
      continue;
    }

    try {
      const result = await executor(platConfig.platform, platConfig, deployArgs);
      const deployEnd = Date.now();

      results.push({
        platform: platConfig.platform,
        status: result.success ? "succeeded" : "failed",
        startedAt: deployStart,
        completedAt: deployEnd,
        duration: deployEnd - deployStart,
        deployUrl: result.deployUrl,
        deployId: result.deployId,
        error: result.success ? undefined : result.error,
        logs: result.logs ?? [],
      });

      onProgress?.(
        platConfig.platform,
        result.success
          ? `Deploy for ${platConfig.platform} succeeded`
          : `Deploy for ${platConfig.platform} failed: ${result.error}`,
      );
    } catch (err) {
      const deployEnd = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.push({
        platform: platConfig.platform,
        status: "failed",
        startedAt: deployStart,
        completedAt: deployEnd,
        duration: deployEnd - deployStart,
        error: errorMsg,
        logs: [`Error: ${errorMsg}`],
      });

      onProgress?.(platConfig.platform, `Deploy for ${platConfig.platform} failed: ${errorMsg}`);
    }
  }

  const totalDuration = Date.now() - now;

  const run: WebPublishRun = {
    id: runId,
    projectId: state.config.projectId,
    timestamp: now,
    platforms: requestedPlatforms.map((p) => p.platform),
    results,
    status: deriveOverallStatus(results),
    triggeredBy: options?.triggeredBy ?? "manual",
    duration: totalDuration,
    tags: options?.tags,
    metadata: options?.metadata,
  };

  writeRun(projectPath, run);

  state.isRunning = false;
  state.currentPlatform = null;
  state.lastRunId = runId;
  state.lastRunTime = now;
  state.totalRuns += 1;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  if (state.config.publishRetention > 0) {
    pruneWebRuns(projectPath, state.config.publishRetention);
  }

  return run;
}

export function cancelWebPublish(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Web publisher not initialized. Call initWebPublisher() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.currentPlatform = null;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

export function getWebRun(projectPath: string, runId: string): WebPublishRun | null {
  return readRun(projectPath, runId);
}

export function getWebHistory(projectPath: string, query?: WebPublishQuery): WebPublishHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", runs: [], totalCount: 0 };
  }

  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    return { projectId: state.config.projectId, runs: [], totalCount: 0 };
  }

  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const allRuns: WebPublishRun[] = [];

  for (const file of runFiles) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), "utf-8")) as WebPublishRun;
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
  if (query?.triggeredBy) {
    filtered = filtered.filter((r) => r.triggeredBy === query.triggeredBy);
  }
  if (query?.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.id.includes(searchLower) ||
        r.triggeredBy.toLowerCase().includes(searchLower) ||
        r.platforms.some((p) => p.toLowerCase().includes(searchLower)) ||
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

export function getWebStats(projectPath: string): WebPublishStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getWebHistory(projectPath);

  let totalDeploys = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let firstRun: number | null = null;
  let lastRun: number | null = null;
  let totalDuration = 0;
  const platformCounts: Record<string, number> = {};
  const platformSucceeded: Record<string, number> = {};
  const platformTotal: Record<string, number> = {};

  for (const run of history.runs) {
    if (firstRun === null || run.timestamp < firstRun) firstRun = run.timestamp;
    if (lastRun === null || run.timestamp > lastRun) lastRun = run.timestamp;
    totalDuration += run.duration;

    for (const result of run.results) {
      totalDeploys++;
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
      }
    }
  }

  const platformSuccessRates: Record<string, number> = {};
  for (const platform of Object.keys(platformTotal)) {
    const total = platformTotal[platform] ?? 0;
    const succ = platformSucceeded[platform] ?? 0;
    if (total > 0) {
      platformSuccessRates[platform] = Math.round((succ / total) * 100);
    }
  }

  return {
    projectId: state.config.projectId,
    totalRuns: history.totalCount,
    totalDeploys,
    succeeded,
    failed,
    cancelled,
    platformCounts,
    platformSuccessRates,
    averageDuration: history.totalCount > 0 ? Math.round(totalDuration / history.totalCount) : 0,
    lastRun,
    firstRun,
  };
}

export function getPlatformResult(run: WebPublishRun, platform: WebPlatform): PlatformPublishResult | null {
  return run.results.find((r) => r.platform === platform) ?? null;
}

export function isWebRunSuccessful(run: WebPublishRun): boolean {
  return run.results.every((r) => r.status === "succeeded");
}

export function getFailedPlatforms(run: WebPublishRun): WebPlatform[] {
  return run.results.filter((r) => r.status === "failed").map((r) => r.platform);
}

export function getSucceededPlatforms(run: WebPublishRun): WebPlatform[] {
  return run.results.filter((r) => r.status === "succeeded").map((r) => r.platform);
}

export function pruneWebRuns(projectPath: string, keepCount: number): number {
  const history = getWebHistory(projectPath);
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

export function formatWebRunOneline(run: WebPublishRun): string {
  const shortId = run.id.slice(0, 7);
  const platformList = run.platforms.join(", ");
  const statusIcon =
    run.status === "succeeded" ? "+" :
    run.status === "failed" ? "x" :
    run.status === "cancelled" ? "-" :
    "?";
  const durationSec = (run.duration / 1000).toFixed(1);
  return `${shortId} [${statusIcon}] -> ${platformList} ${durationSec}s`;
}

export function formatWebRunFull(run: WebPublishRun): string {
  const lines: string[] = [
    `Web Publish ${run.id}`,
    `Status:      ${run.status}`,
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
      result.status === "cancelled" ? "-" :
      "?";

    const durationSec = (result.duration / 1000).toFixed(1);
    lines.push(`    ${icon} ${result.platform}: ${result.status} (${durationSec}s)`);

    if (result.error) {
      lines.push(`      Error: ${result.error}`);
    }

    if (result.deployUrl) {
      lines.push(`      URL: ${result.deployUrl}`);
    }

    if (result.deployId) {
      lines.push(`      Deploy ID: ${result.deployId}`);
    }
  }

  return lines.join("\n");
}

export function generateWebPublishSummary(run: WebPublishRun): string {
  const total = run.results.length;
  const succeeded = run.results.filter((r) => r.status === "succeeded").length;
  const failed = run.results.filter((r) => r.status === "failed").length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Web Publish ${run.id.slice(0, 7)}: ${parts.join(", ")} (${total} total) -> ${run.platforms.join(", ")}`;
}

export function destroyWebPublisher(projectPath: string): boolean {
  const publisherDir = getPublisherDir(projectPath);
  if (!existsSync(publisherDir)) return false;

  rmSync(publisherDir, { recursive: true, force: true });
  return true;
}

export function createWebExecutor(
  toolPath: string,
  options?: { timeout?: number },
): (
  platform: WebPlatform,
  platformConfig: WebPlatformConfig,
  deployArgs: string[],
) => Promise<{ success: boolean; error?: string; logs?: string[]; deployUrl?: string; deployId?: string }> {
  return async (_platform, _platformConfig, deployArgs) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = spawnSync(toolPath, deployArgs, {
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
      return { success: false, error: result.error.message, logs };
    }

    if (result.status !== 0) {
      return { success: false, error: stderr || `Tool exited with code ${result.status}`, logs };
    }

    const urlMatch = stdout.match(/https?:\/\/[^\s"']+/i);
    const deployUrl = urlMatch ? urlMatch[0] : undefined;

    const idMatch = stdout.match(/deploy[_\s]*(?:id|ID)[:\s]+([\w-]+)/i);
    const deployId = idMatch ? idMatch[1] : undefined;

    return { success: true, logs, deployUrl, deployId };
  };
}
