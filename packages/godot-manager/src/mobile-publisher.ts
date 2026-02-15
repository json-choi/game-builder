import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export type MobileStore = "google-play" | "app-store";

export type MobilePublishStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ReleaseTrack =
  | "internal"
  | "alpha"
  | "beta"
  | "production";

export type AppStoreReleaseType =
  | "manual"
  | "after-approval"
  | "scheduled";

export interface MobileStoreConfig {
  store: MobileStore;
  enabled: boolean;
  /** Path to the build artifact (APK/AAB for Google Play, IPA for App Store) */
  artifactPath: string;
  /** Store-specific configuration */
  storeConfig: GooglePlayConfig | AppStoreConfig;
}

export interface GooglePlayConfig {
  /** Google Play service account JSON key file path */
  serviceAccountKeyPath: string;
  /** Application package name, e.g. "com.example.mygame" */
  packageName: string;
  /** Release track: internal, alpha, beta, production */
  track: ReleaseTrack;
  /** Release status (draft, completed, halted) */
  releaseStatus: "draft" | "completed" | "halted";
  /** Mapping file for ProGuard/R8 deobfuscation */
  mappingFile?: string;
  /** Changes not sent for review */
  changesNotSentForReview?: boolean;
}

export interface AppStoreConfig {
  /** API key ID from App Store Connect */
  apiKeyId: string;
  /** Issuer ID from App Store Connect */
  issuerId: string;
  /** Path to the .p8 private key file */
  privateKeyPath: string;
  /** Apple ID of the app */
  appleId: string;
  /** Bundle ID, e.g. "com.example.mygame" */
  bundleId: string;
  /** Release type for App Store */
  releaseType: AppStoreReleaseType;
  /** Whether to skip waiting for processing */
  skipWaiting?: boolean;
}

export interface MobileToolInfo {
  installed: boolean;
  version?: string;
  path?: string;
  tool: string;
}

export interface MobileAuthStatus {
  authenticated: boolean;
  store: MobileStore;
  identity?: string;
}

export interface StorePublishResult {
  store: MobileStore;
  status: MobilePublishStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  versionCode?: number;
  buildNumber?: string;
  error?: string;
  logs: string[];
}

export interface MobilePublishRun {
  id: string;
  projectId: string;
  timestamp: number;
  stores: MobileStore[];
  appVersion: string;
  results: StorePublishResult[];
  status: MobilePublishStatus;
  triggeredBy: string;
  duration: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MobilePublishConfig {
  projectId: string;
  projectPath: string;
  /** App version string, e.g. "1.0.0" */
  appVersion: string;
  /** Store configurations */
  stores: MobileStoreConfig[];
  /** Timeout per upload in ms */
  uploadTimeout: number;
  /** Retain last N publish records (0 = unlimited) */
  publishRetention: number;
  /** Whether to validate artifact before upload */
  validateArtifact: boolean;
}

export interface MobilePublishState {
  config: MobilePublishConfig;
  lastRunId: string | null;
  lastRunTime: number | null;
  totalRuns: number;
  isRunning: boolean;
  currentStore: MobileStore | null;
  createdAt: number;
  updatedAt: number;
}

export interface MobilePublishHistory {
  projectId: string;
  runs: MobilePublishRun[];
  totalCount: number;
}

export interface MobilePublishQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  store?: MobileStore;
  status?: MobilePublishStatus;
  triggeredBy?: string;
  search?: string;
}

export interface MobilePublishStats {
  projectId: string;
  totalRuns: number;
  totalUploads: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  storeCounts: Record<string, number>;
  storeSuccessRates: Record<string, number>;
  averageDuration: number;
  lastRun: number | null;
  firstRun: number | null;
}

export interface MobilePublishValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MobilePublishOptions {
  stores?: MobileStore[];
  appVersion?: string;
  triggeredBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PUBLISHER_DIR = ".mobile-publisher";
const RUNS_DIR = "runs";
const STATE_FILE = "state.json";
const CONFIG_FILE = "config.json";

const DEFAULT_STORES: MobileStoreConfig[] = [
  {
    store: "google-play",
    enabled: true,
    artifactPath: "exports/android/game.aab",
    storeConfig: {
      serviceAccountKeyPath: "",
      packageName: "",
      track: "internal",
      releaseStatus: "draft",
    } as GooglePlayConfig,
  },
  {
    store: "app-store",
    enabled: true,
    artifactPath: "exports/ios/game.ipa",
    storeConfig: {
      apiKeyId: "",
      issuerId: "",
      privateKeyPath: "",
      appleId: "",
      bundleId: "",
      releaseType: "manual",
    } as AppStoreConfig,
  },
];

const ALL_STORES: MobileStore[] = ["google-play", "app-store"];

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

function readState(projectPath: string): MobilePublishState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: MobilePublishState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readRun(projectPath: string, runId: string): MobilePublishRun | null {
  const runPath = join(getRunsDir(projectPath), `${runId}.json`);
  if (!existsSync(runPath)) return null;
  return JSON.parse(readFileSync(runPath, "utf-8"));
}

function writeRun(projectPath: string, run: MobilePublishRun): void {
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

function deriveOverallStatus(results: StorePublishResult[]): MobilePublishStatus {
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
 * Get the default mobile store configurations.
 */
export function getDefaultStores(): MobileStoreConfig[] {
  return DEFAULT_STORES.map((s) => ({
    ...s,
    storeConfig: { ...s.storeConfig },
  }));
}

/**
 * Get the list of all supported store names.
 */
export function getSupportedStoreNames(): MobileStore[] {
  return [...ALL_STORES];
}

/**
 * Check if a store config is for Google Play.
 */
export function isGooglePlayConfig(config: GooglePlayConfig | AppStoreConfig): config is GooglePlayConfig {
  return "packageName" in config && "track" in config;
}

/**
 * Check if a store config is for App Store.
 */
export function isAppStoreConfig(config: GooglePlayConfig | AppStoreConfig): config is AppStoreConfig {
  return "apiKeyId" in config && "bundleId" in config;
}

/**
 * Detect Google Play upload tool (bundletool or supply from fastlane).
 */
export function detectGooglePlayTool(toolPath?: string): MobileToolInfo {
  // Try supply (fastlane) first, then bundletool
  const tools = toolPath ? [toolPath] : ["supply", "bundletool"];

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
        return {
          installed: true,
          version,
          path: tool,
          tool,
        };
      }
    } catch {
      continue;
    }
  }

  return { installed: false, tool: toolPath ?? "supply" };
}

/**
 * Detect App Store upload tool (xcrun altool or Transporter).
 */
export function detectAppStoreTool(toolPath?: string): MobileToolInfo {
  const tools = toolPath ? [toolPath] : ["xcrun", "iTMSTransporter"];

  for (const tool of tools) {
    try {
      const args = tool === "xcrun" ? ["altool", "--version"] : ["--version"];
      const result = spawnSync(tool, args, {
        timeout: 10_000,
        encoding: "utf-8",
      });

      if (result.error) continue;

      const output = (result.stdout ?? "").trim();
      const versionMatch = output.match(/v?([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : undefined;

      if (result.status === 0) {
        return {
          installed: true,
          version,
          path: tool,
          tool,
        };
      }
    } catch {
      continue;
    }
  }

  return { installed: false, tool: toolPath ?? "xcrun" };
}

/**
 * Check Google Play authentication status.
 */
export function checkGooglePlayAuth(serviceAccountKeyPath: string): MobileAuthStatus {
  if (!serviceAccountKeyPath || !existsSync(serviceAccountKeyPath)) {
    return { authenticated: false, store: "google-play" };
  }

  try {
    const keyContent = JSON.parse(readFileSync(serviceAccountKeyPath, "utf-8"));
    if (keyContent.client_email) {
      return {
        authenticated: true,
        store: "google-play",
        identity: keyContent.client_email,
      };
    }
    return { authenticated: false, store: "google-play" };
  } catch {
    return { authenticated: false, store: "google-play" };
  }
}

/**
 * Check App Store Connect authentication status.
 */
export function checkAppStoreAuth(config: AppStoreConfig): MobileAuthStatus {
  if (!config.apiKeyId || !config.issuerId || !config.privateKeyPath) {
    return { authenticated: false, store: "app-store" };
  }

  if (!existsSync(config.privateKeyPath)) {
    return { authenticated: false, store: "app-store" };
  }

  return {
    authenticated: true,
    store: "app-store",
    identity: `Key: ${config.apiKeyId}`,
  };
}

/**
 * Validate artifact file for a given store.
 */
export function validateArtifact(artifactPath: string, store: MobileStore): MobilePublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!artifactPath || artifactPath.trim() === "") {
    errors.push("Artifact path is required");
    return { valid: false, errors, warnings };
  }

  if (store === "google-play") {
    if (!artifactPath.endsWith(".aab") && !artifactPath.endsWith(".apk")) {
      errors.push("Google Play artifact must be .aab or .apk file");
    }
    if (artifactPath.endsWith(".apk")) {
      warnings.push("AAB format is recommended over APK for Google Play");
    }
  } else if (store === "app-store") {
    if (!artifactPath.endsWith(".ipa")) {
      errors.push("App Store artifact must be .ipa file");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a mobile publish configuration.
 */
export function validateMobilePublishConfig(config: Partial<MobilePublishConfig>): MobilePublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.projectId || config.projectId.trim() === "") {
    errors.push("projectId is required");
  }

  if (!config.projectPath || config.projectPath.trim() === "") {
    errors.push("projectPath is required");
  }

  if (!config.appVersion || config.appVersion.trim() === "") {
    errors.push("appVersion is required");
  }

  if (!config.stores || config.stores.length === 0) {
    errors.push("At least one store must be configured");
  }

  if (config.stores) {
    const enabledStores = config.stores.filter((s) => s.enabled);
    if (enabledStores.length === 0) {
      warnings.push("No stores are enabled");
    }

    const seen = new Set<string>();
    for (const store of config.stores) {
      if (seen.has(store.store)) {
        errors.push(`Duplicate store: ${store.store}`);
      }
      seen.add(store.store);

      if (!store.artifactPath || store.artifactPath.trim() === "") {
        errors.push(`Store ${store.store}: artifactPath is required`);
      }

      // Validate store-specific config
      if (store.store === "google-play") {
        const gp = store.storeConfig as GooglePlayConfig;
        if (!gp.packageName || gp.packageName.trim() === "") {
          errors.push("Google Play: packageName is required");
        }
      } else if (store.store === "app-store") {
        const as = store.storeConfig as AppStoreConfig;
        if (!as.bundleId || as.bundleId.trim() === "") {
          errors.push("App Store: bundleId is required");
        }
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
 * Initialize the mobile publisher for a project.
 * Creates .mobile-publisher directory.
 * Returns true if freshly initialized, false if already exists.
 */
export function initMobilePublisher(config: MobilePublishConfig): boolean {
  const publisherDir = getPublisherDir(config.projectPath);

  if (existsSync(publisherDir)) {
    return false;
  }

  mkdirSync(publisherDir, { recursive: true });
  mkdirSync(getRunsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");

  const state: MobilePublishState = {
    config,
    lastRunId: null,
    lastRunTime: null,
    totalRuns: 0,
    isRunning: false,
    currentStore: null,
    createdAt: now,
    updatedAt: now,
  };
  writeState(config.projectPath, state);

  return true;
}

/**
 * Check if a project has the mobile publisher initialized.
 */
export function hasMobilePublisher(projectPath: string): boolean {
  return existsSync(getPublisherDir(projectPath));
}

/**
 * Get the current mobile publisher state.
 */
export function getMobilePublishState(projectPath: string): MobilePublishState | null {
  return readState(projectPath);
}

/**
 * Update the mobile publisher configuration.
 */
export function updateMobilePublishConfig(projectPath: string, updates: Partial<MobilePublishConfig>): MobilePublishConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

/**
 * Get the enabled stores from the configuration.
 */
export function getEnabledStores(projectPath: string): MobileStoreConfig[] {
  const state = readState(projectPath);
  if (!state) return [];
  return state.config.stores.filter((s) => s.enabled);
}

/**
 * Enable or disable a specific store.
 */
export function setStoreEnabled(projectPath: string, store: MobileStore, enabled: boolean): MobileStoreConfig | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  const storeConfig = state.config.stores.find((s) => s.store === store);
  if (!storeConfig) return null;

  storeConfig.enabled = enabled;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return storeConfig;
}

/**
 * Add a store to the mobile publisher configuration.
 */
export function addStore(projectPath: string, config: MobileStoreConfig): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  if (state.config.stores.some((s) => s.store === config.store)) {
    return false;
  }

  state.config.stores.push(config);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Remove a store from the mobile publisher configuration.
 */
export function removeStore(projectPath: string, store: MobileStore): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  const index = state.config.stores.findIndex((s) => s.store === store);
  if (index === -1) return false;

  state.config.stores.splice(index, 1);
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(state.config, null, 2), "utf-8");

  return true;
}

/**
 * Build the upload arguments for Google Play (using supply/fastlane).
 */
export function buildGooglePlayUploadArgs(
  config: MobilePublishConfig,
  storeConfig: MobileStoreConfig,
  options?: { appVersion?: string; dryRun?: boolean },
): string[] {
  const gp = storeConfig.storeConfig as GooglePlayConfig;
  const artifactPath = join(resolve(config.projectPath), storeConfig.artifactPath);

  const args: string[] = ["upload"];

  if (options?.dryRun) {
    args.push("--dry-run");
  }

  args.push("--package-name", gp.packageName);
  args.push("--track", gp.track);
  args.push("--release-status", gp.releaseStatus);

  if (gp.serviceAccountKeyPath) {
    args.push("--service-account-key", gp.serviceAccountKeyPath);
  }

  if (gp.mappingFile) {
    args.push("--mapping-file", gp.mappingFile);
  }

  if (gp.changesNotSentForReview) {
    args.push("--changes-not-sent-for-review");
  }

  const version = options?.appVersion ?? config.appVersion;
  if (version) {
    args.push("--version-name", version);
  }

  args.push("--artifact", artifactPath);

  return args;
}

/**
 * Build the upload arguments for App Store (using xcrun altool or Transporter).
 */
export function buildAppStoreUploadArgs(
  config: MobilePublishConfig,
  storeConfig: MobileStoreConfig,
  options?: { appVersion?: string; dryRun?: boolean },
): string[] {
  const as = storeConfig.storeConfig as AppStoreConfig;
  const artifactPath = join(resolve(config.projectPath), storeConfig.artifactPath);

  const args: string[] = ["altool", "--upload-app"];

  if (options?.dryRun) {
    args.push("--validate-app");
  }

  args.push("--type", "ios");
  args.push("--file", artifactPath);
  args.push("--apiKey", as.apiKeyId);
  args.push("--apiIssuer", as.issuerId);

  if (as.appleId) {
    args.push("--apple-id", as.appleId);
  }

  if (as.bundleId) {
    args.push("--bundle-id", as.bundleId);
  }

  return args;
}

/**
 * Build upload args for a store (dispatches to the correct builder).
 */
export function buildUploadArgs(
  config: MobilePublishConfig,
  storeConfig: MobileStoreConfig,
  options?: { appVersion?: string; dryRun?: boolean },
): string[] {
  if (storeConfig.store === "google-play") {
    return buildGooglePlayUploadArgs(config, storeConfig, options);
  }
  return buildAppStoreUploadArgs(config, storeConfig, options);
}

/**
 * Execute a mobile publish run — uploads builds to stores.
 *
 * The executor callback is called per-store. If no executor is provided,
 * a dry-run is simulated.
 */
export async function executeMobilePublish(
  projectPath: string,
  options?: MobilePublishOptions,
  executor?: (
    store: MobileStore,
    storeConfig: MobileStoreConfig,
    uploadArgs: string[],
  ) => Promise<{ success: boolean; error?: string; logs?: string[]; versionCode?: number; buildNumber?: string }>,
  onProgress?: (store: MobileStore, message: string) => void,
): Promise<MobilePublishRun> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  if (state.isRunning) {
    throw new Error("A publish is already running. Wait for it to complete.");
  }

  const now = Date.now();
  const runId = generateRunId(now, state.config.projectId);

  state.isRunning = true;
  state.updatedAt = now;
  writeState(projectPath, state);

  const enabledStores = state.config.stores.filter((s) => s.enabled);
  const requestedStores = options?.stores
    ? enabledStores.filter((s) => options.stores!.includes(s.store))
    : enabledStores;

  const results: StorePublishResult[] = [];

  for (const storeConfig of requestedStores) {
    state.currentStore = storeConfig.store;
    state.updatedAt = Date.now();
    writeState(projectPath, state);

    onProgress?.(storeConfig.store, `Starting publish for ${storeConfig.store}...`);

    const uploadStart = Date.now();
    const uploadArgs = buildUploadArgs(state.config, storeConfig, {
      appVersion: options?.appVersion,
      dryRun: options?.dryRun,
    });

    if (!executor) {
      // Dry-run mode when no executor provided
      results.push({
        store: storeConfig.store,
        status: "succeeded",
        startedAt: uploadStart,
        completedAt: Date.now(),
        duration: Date.now() - uploadStart,
        logs: [`Dry-run upload for ${storeConfig.store}: ${uploadArgs.join(" ")}`],
      });
      onProgress?.(storeConfig.store, `Publish for ${storeConfig.store} completed (dry-run)`);
      continue;
    }

    try {
      const result = await executor(storeConfig.store, storeConfig, uploadArgs);
      const uploadEnd = Date.now();

      results.push({
        store: storeConfig.store,
        status: result.success ? "succeeded" : "failed",
        startedAt: uploadStart,
        completedAt: uploadEnd,
        duration: uploadEnd - uploadStart,
        versionCode: result.versionCode,
        buildNumber: result.buildNumber,
        error: result.success ? undefined : result.error,
        logs: result.logs ?? [],
      });

      onProgress?.(
        storeConfig.store,
        result.success
          ? `Publish for ${storeConfig.store} succeeded`
          : `Publish for ${storeConfig.store} failed: ${result.error}`,
      );
    } catch (err) {
      const uploadEnd = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.push({
        store: storeConfig.store,
        status: "failed",
        startedAt: uploadStart,
        completedAt: uploadEnd,
        duration: uploadEnd - uploadStart,
        error: errorMsg,
        logs: [`Error: ${errorMsg}`],
      });

      onProgress?.(storeConfig.store, `Publish for ${storeConfig.store} failed: ${errorMsg}`);
    }
  }

  const totalDuration = Date.now() - now;

  const run: MobilePublishRun = {
    id: runId,
    projectId: state.config.projectId,
    timestamp: now,
    stores: requestedStores.map((s) => s.store),
    appVersion: options?.appVersion ?? state.config.appVersion,
    results,
    status: deriveOverallStatus(results),
    triggeredBy: options?.triggeredBy ?? "manual",
    duration: totalDuration,
    tags: options?.tags,
    metadata: options?.metadata,
  };

  writeRun(projectPath, run);

  state.isRunning = false;
  state.currentStore = null;
  state.lastRunId = runId;
  state.lastRunTime = now;
  state.totalRuns += 1;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  if (state.config.publishRetention > 0) {
    pruneMobileRuns(projectPath, state.config.publishRetention);
  }

  return run;
}

/**
 * Cancel the currently running mobile publish. Returns true if cancelled.
 */
export function cancelMobilePublish(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Mobile publisher not initialized. Call initMobilePublisher() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.currentStore = null;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

/**
 * Get a single mobile publish run by ID.
 */
export function getMobileRun(projectPath: string, runId: string): MobilePublishRun | null {
  return readRun(projectPath, runId);
}

/**
 * Get mobile publish history for a project.
 */
export function getMobileHistory(projectPath: string, query?: MobilePublishQuery): MobilePublishHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", runs: [], totalCount: 0 };
  }

  const runsDir = getRunsDir(projectPath);
  if (!existsSync(runsDir)) {
    return { projectId: state.config.projectId, runs: [], totalCount: 0 };
  }

  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const allRuns: MobilePublishRun[] = [];

  for (const file of runFiles) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), "utf-8")) as MobilePublishRun;
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
  if (query?.store) {
    filtered = filtered.filter((r) => r.stores.includes(query.store!));
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
        r.appVersion.toLowerCase().includes(searchLower) ||
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
 * Get mobile publish statistics.
 */
export function getMobileStats(projectPath: string): MobilePublishStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getMobileHistory(projectPath);

  let totalUploads = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let firstRun: number | null = null;
  let lastRun: number | null = null;
  let totalDuration = 0;
  const storeCounts: Record<string, number> = {};
  const storeSucceeded: Record<string, number> = {};
  const storeTotal: Record<string, number> = {};

  for (const run of history.runs) {
    if (firstRun === null || run.timestamp < firstRun) firstRun = run.timestamp;
    if (lastRun === null || run.timestamp > lastRun) lastRun = run.timestamp;
    totalDuration += run.duration;

    for (const result of run.results) {
      totalUploads++;
      storeCounts[result.store] = (storeCounts[result.store] ?? 0) + 1;
      storeTotal[result.store] = (storeTotal[result.store] ?? 0) + 1;

      switch (result.status) {
        case "succeeded":
          succeeded++;
          storeSucceeded[result.store] = (storeSucceeded[result.store] ?? 0) + 1;
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

  const storeSuccessRates: Record<string, number> = {};
  for (const store of Object.keys(storeTotal)) {
    const total = storeTotal[store] ?? 0;
    const succ = storeSucceeded[store] ?? 0;
    if (total > 0) {
      storeSuccessRates[store] = Math.round((succ / total) * 100);
    }
  }

  return {
    projectId: state.config.projectId,
    totalRuns: history.totalCount,
    totalUploads,
    succeeded,
    failed,
    cancelled,
    storeCounts,
    storeSuccessRates,
    averageDuration: history.totalCount > 0 ? Math.round(totalDuration / history.totalCount) : 0,
    lastRun,
    firstRun,
  };
}

/**
 * Get the result for a specific store from a publish run.
 */
export function getStoreResult(run: MobilePublishRun, store: MobileStore): StorePublishResult | null {
  return run.results.find((r) => r.store === store) ?? null;
}

/**
 * Check if a mobile publish run was fully successful.
 */
export function isMobileRunSuccessful(run: MobilePublishRun): boolean {
  return run.results.every((r) => r.status === "succeeded");
}

/**
 * Get failed stores from a publish run.
 */
export function getFailedStores(run: MobilePublishRun): MobileStore[] {
  return run.results.filter((r) => r.status === "failed").map((r) => r.store);
}

/**
 * Get succeeded stores from a publish run.
 */
export function getSucceededStores(run: MobilePublishRun): MobileStore[] {
  return run.results.filter((r) => r.status === "succeeded").map((r) => r.store);
}

/**
 * Prune old mobile publish runs to keep only the latest N.
 */
export function pruneMobileRuns(projectPath: string, keepCount: number): number {
  const history = getMobileHistory(projectPath);
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
 * Format a mobile publish run as a one-line summary.
 */
export function formatMobileRunOneline(run: MobilePublishRun): string {
  const shortId = run.id.slice(0, 7);
  const storeList = run.stores.join(", ");
  const statusIcon =
    run.status === "succeeded" ? "+" :
    run.status === "failed" ? "x" :
    run.status === "cancelled" ? "-" :
    "?";
  const durationSec = (run.duration / 1000).toFixed(1);
  return `${shortId} [${statusIcon}] v${run.appVersion} -> ${storeList} ${durationSec}s`;
}

/**
 * Format a mobile publish run with full details.
 */
export function formatMobileRunFull(run: MobilePublishRun): string {
  const lines: string[] = [
    `Mobile Publish ${run.id}`,
    `Status:      ${run.status}`,
    `Version:     ${run.appVersion}`,
    `Stores:      ${run.stores.join(", ")}`,
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
    lines.push(`    ${icon} ${result.store}: ${result.status} (${durationSec}s)`);

    if (result.error) {
      lines.push(`      Error: ${result.error}`);
    }

    if (result.versionCode) {
      lines.push(`      Version Code: ${result.versionCode}`);
    }

    if (result.buildNumber) {
      lines.push(`      Build Number: ${result.buildNumber}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a mobile publish summary string for display.
 */
export function generateMobilePublishSummary(run: MobilePublishRun): string {
  const total = run.results.length;
  const succeeded = run.results.filter((r) => r.status === "succeeded").length;
  const failed = run.results.filter((r) => r.status === "failed").length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Mobile Publish ${run.id.slice(0, 7)}: ${parts.join(", ")} (${total} total) v${run.appVersion}`;
}

/**
 * Destroy the mobile publisher for a project. Removes all data.
 */
export function destroyMobilePublisher(projectPath: string): boolean {
  const publisherDir = getPublisherDir(projectPath);
  if (!existsSync(publisherDir)) return false;

  rmSync(publisherDir, { recursive: true, force: true });
  return true;
}

/**
 * Create a Google Play executor that invokes supply (fastlane) CLI.
 * Use this as the executor parameter for executeMobilePublish().
 */
export function createGooglePlayExecutor(
  toolPath: string,
  options?: { serviceAccountKeyPath?: string; timeout?: number },
): (
  store: MobileStore,
  storeConfig: MobileStoreConfig,
  uploadArgs: string[],
) => Promise<{ success: boolean; error?: string; logs?: string[]; versionCode?: number; buildNumber?: string }> {
  return async (_store, _storeConfig, uploadArgs) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = spawnSync(toolPath, uploadArgs, {
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
        error: stderr || `Tool exited with code ${result.status}`,
        logs,
      };
    }

    // Try to extract version code from output
    const versionCodeMatch = stdout.match(/version\s*code[:\s]+(\d+)/i);
    const versionCode = versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : undefined;

    return {
      success: true,
      logs,
      versionCode,
    };
  };
}

/**
 * Create an App Store executor that invokes xcrun altool CLI.
 * Use this as the executor parameter for executeMobilePublish().
 */
export function createAppStoreExecutor(
  toolPath: string,
  options?: { timeout?: number },
): (
  store: MobileStore,
  storeConfig: MobileStoreConfig,
  uploadArgs: string[],
) => Promise<{ success: boolean; error?: string; logs?: string[]; versionCode?: number; buildNumber?: string }> {
  return async (_store, _storeConfig, uploadArgs) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const result = spawnSync(toolPath, uploadArgs, {
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
        error: stderr || `Tool exited with code ${result.status}`,
        logs,
      };
    }

    // Try to extract build number from output
    const buildNumberMatch = stdout.match(/build\s*(?:number|version)[:\s]+([\d.]+)/i);
    const buildNumber = buildNumberMatch ? buildNumberMatch[1] : undefined;

    return {
      success: true,
      logs,
      buildNumber,
    };
  };
}
