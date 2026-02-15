import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "fs";
import { join, resolve, relative, extname, basename } from "path";
import { createHash } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────

export type CommitStrategy = "immediate" | "batched" | "interval" | "manual";

export type FileCategory =
  | "scene"
  | "script"
  | "asset"
  | "config"
  | "resource"
  | "shader"
  | "audio"
  | "unknown";

export interface TrackedFile {
  path: string;
  hash: string;
  size: number;
  category: FileCategory;
  lastModified: number;
}

export interface FileSnapshot {
  path: string;
  hash: string;
  size: number;
  lastModified: number;
}

export interface CommitChange {
  path: string;
  type: "added" | "modified" | "deleted";
  category: FileCategory;
  oldHash?: string;
  newHash?: string;
  sizeDelta?: number;
}

export interface AutoCommit {
  id: string;
  projectId: string;
  timestamp: number;
  message: string;
  author: string;
  changes: CommitChange[];
  strategy: CommitStrategy;
  parentId: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AutoCommitConfig {
  projectId: string;
  projectPath: string;
  author: string;
  strategy: CommitStrategy;
  /** Interval in ms for "interval" strategy */
  intervalMs?: number;
  /** Batch size threshold for "batched" strategy */
  batchSize?: number;
  /** File patterns to ignore (glob-like simple matching) */
  ignorePatterns?: string[];
  /** File extensions to track (if empty, track all) */
  trackExtensions?: string[];
  /** Whether to auto-generate commit messages */
  autoMessage?: boolean;
  /** Maximum commits to retain (0 = unlimited) */
  maxCommits?: number;
}

export interface AutoCommitState {
  config: AutoCommitConfig;
  lastCommitId: string | null;
  lastCommitTime: number | null;
  totalCommits: number;
  pendingChanges: CommitChange[];
  isRunning: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommitHistory {
  projectId: string;
  commits: AutoCommit[];
  totalCount: number;
}

export interface CommitQuery {
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  author?: string;
  category?: FileCategory;
  search?: string;
}

export interface CommitStats {
  projectId: string;
  totalCommits: number;
  totalChanges: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  categoryCounts: Partial<Record<FileCategory, number>>;
  firstCommit: number | null;
  lastCommit: number | null;
  averageChangesPerCommit: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const AUTOCOMMIT_DIR = ".autocommit";
const COMMITS_DIR = "commits";
const STATE_FILE = "state.json";
const SNAPSHOTS_FILE = "snapshots.json";
const CONFIG_FILE = "config.json";

const DEFAULT_IGNORE_PATTERNS = [
  ".autocommit",
  ".worklog",
  ".godot",
  ".import",
  "node_modules",
  ".git",
  "*.tmp",
  "*.bak",
  "*.swp",
  "~*",
];

const DEFAULT_TRACK_EXTENSIONS = [
  ".tscn",
  ".tres",
  ".gd",
  ".gdshader",
  ".gdshaderinc",
  ".cfg",
  ".import",
  ".godot",
  ".png",
  ".jpg",
  ".svg",
  ".wav",
  ".ogg",
  ".mp3",
  ".ttf",
  ".otf",
  ".json",
  ".md",
  ".txt",
];

const EXTENSION_CATEGORY_MAP: Record<string, FileCategory> = {
  ".tscn": "scene",
  ".tres": "resource",
  ".gd": "script",
  ".gdshader": "shader",
  ".gdshaderinc": "shader",
  ".cfg": "config",
  ".godot": "config",
  ".import": "config",
  ".png": "asset",
  ".jpg": "asset",
  ".jpeg": "asset",
  ".svg": "asset",
  ".webp": "asset",
  ".wav": "audio",
  ".ogg": "audio",
  ".mp3": "audio",
  ".ttf": "asset",
  ".otf": "asset",
  ".json": "config",
  ".md": "config",
  ".txt": "config",
};

// ─── Internal Helpers ──────────────────────────────────────────────────────

function getAutocommitDir(projectPath: string): string {
  return join(resolve(projectPath), AUTOCOMMIT_DIR);
}

function getCommitsDir(projectPath: string): string {
  return join(getAutocommitDir(projectPath), COMMITS_DIR);
}

function getStatePath(projectPath: string): string {
  return join(getAutocommitDir(projectPath), STATE_FILE);
}

function getSnapshotsPath(projectPath: string): string {
  return join(getAutocommitDir(projectPath), SNAPSHOTS_FILE);
}

function getConfigPath(projectPath: string): string {
  return join(getAutocommitDir(projectPath), CONFIG_FILE);
}

function readState(projectPath: string): AutoCommitState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

function writeState(projectPath: string, state: AutoCommitState): void {
  writeFileSync(getStatePath(projectPath), JSON.stringify(state, null, 2), "utf-8");
}

function readSnapshots(projectPath: string): Record<string, FileSnapshot> {
  const snapshotsPath = getSnapshotsPath(projectPath);
  if (!existsSync(snapshotsPath)) return {};
  return JSON.parse(readFileSync(snapshotsPath, "utf-8"));
}

function writeSnapshots(projectPath: string, snapshots: Record<string, FileSnapshot>): void {
  writeFileSync(getSnapshotsPath(projectPath), JSON.stringify(snapshots, null, 2), "utf-8");
}

function readCommit(projectPath: string, commitId: string): AutoCommit | null {
  const commitPath = join(getCommitsDir(projectPath), `${commitId}.json`);
  if (!existsSync(commitPath)) return null;
  return JSON.parse(readFileSync(commitPath, "utf-8"));
}

function writeCommit(projectPath: string, commit: AutoCommit): void {
  const commitsDir = getCommitsDir(projectPath);
  if (!existsSync(commitsDir)) {
    mkdirSync(commitsDir, { recursive: true });
  }
  writeFileSync(join(commitsDir, `${commit.id}.json`), JSON.stringify(commit, null, 2), "utf-8");
}

function computeFileHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function generateCommitId(timestamp: number, message: string, author: string): string {
  const input = `${timestamp}:${message}:${author}:${Math.random().toString(36).slice(2)}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/**
 * Categorize a file by its extension.
 */
export function categorizeFile(filePath: string): FileCategory {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_CATEGORY_MAP[ext] ?? "unknown";
}

/**
 * Check if a path matches any of the ignore patterns (simple glob matching).
 */
export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const name = basename(filePath);
  const parts = filePath.split("/");

  for (const pattern of patterns) {
    if (parts.includes(pattern)) return true;

    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    }

    if (pattern.endsWith("*") && !pattern.startsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (name.startsWith(prefix)) return true;
    }

    if (name === pattern) return true;
  }

  return false;
}

/**
 * Recursively scan a directory for trackable files.
 */
export function scanDirectory(
  dirPath: string,
  basePath: string,
  ignorePatterns: string[],
  trackExtensions: string[],
): TrackedFile[] {
  const results: TrackedFile[] = [];
  const resolvedDir = resolve(dirPath);

  if (!existsSync(resolvedDir)) return results;

  const entries = readdirSync(resolvedDir);

  for (const entry of entries) {
    const fullPath = join(resolvedDir, entry);
    const relativePath = relative(resolve(basePath), fullPath);

    if (shouldIgnore(relativePath, ignorePatterns)) continue;

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...scanDirectory(fullPath, basePath, ignorePatterns, trackExtensions));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();

      if (trackExtensions.length > 0 && !trackExtensions.includes(ext)) {
        continue;
      }

      let content: string;
      try {
        content = readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      results.push({
        path: relativePath,
        hash: computeFileHash(content),
        size: stat.size,
        category: categorizeFile(entry),
        lastModified: stat.mtimeMs,
      });
    }
  }

  return results;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize auto-commit system for a project. Creates .autocommit directory structure.
 * Returns true if freshly initialized, false if already exists.
 */
export function initAutoCommit(config: AutoCommitConfig): boolean {
  const acDir = getAutocommitDir(config.projectPath);

  if (existsSync(acDir)) {
    return false;
  }

  mkdirSync(acDir, { recursive: true });
  mkdirSync(getCommitsDir(config.projectPath), { recursive: true });

  const now = Date.now();

  writeFileSync(getConfigPath(config.projectPath), JSON.stringify(config, null, 2), "utf-8");
  writeSnapshots(config.projectPath, {});

  const state: AutoCommitState = {
    config,
    lastCommitId: null,
    lastCommitTime: null,
    totalCommits: 0,
    pendingChanges: [],
    isRunning: false,
    createdAt: now,
    updatedAt: now,
  };
  writeState(config.projectPath, state);

  return true;
}

/**
 * Check if a project has auto-commit initialized.
 */
export function hasAutoCommit(projectPath: string): boolean {
  return existsSync(getAutocommitDir(projectPath));
}

/**
 * Get the current auto-commit state.
 */
export function getState(projectPath: string): AutoCommitState | null {
  return readState(projectPath);
}

/**
 * Update the auto-commit configuration.
 */
export function updateConfig(projectPath: string, updates: Partial<AutoCommitConfig>): AutoCommitConfig {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  const newConfig = { ...state.config, ...updates };
  state.config = newConfig;
  state.updatedAt = Date.now();

  writeState(projectPath, state);
  writeFileSync(getConfigPath(projectPath), JSON.stringify(newConfig, null, 2), "utf-8");

  return newConfig;
}

/**
 * Detect changes by comparing current file state to saved snapshots.
 * Returns a list of changes (added, modified, deleted).
 */
export function detectChanges(projectPath: string): CommitChange[] {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  const config = state.config;
  const ignorePatterns = config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
  const trackExtensions = config.trackExtensions ?? DEFAULT_TRACK_EXTENSIONS;

  const currentFiles = scanDirectory(projectPath, projectPath, ignorePatterns, trackExtensions);
  const savedSnapshots = readSnapshots(projectPath);

  const changes: CommitChange[] = [];
  const currentPaths = new Set<string>();

  for (const file of currentFiles) {
    currentPaths.add(file.path);
    const saved = savedSnapshots[file.path];

    if (!saved) {
      changes.push({
        path: file.path,
        type: "added",
        category: file.category,
        newHash: file.hash,
        sizeDelta: file.size,
      });
    } else if (saved.hash !== file.hash) {
      changes.push({
        path: file.path,
        type: "modified",
        category: file.category,
        oldHash: saved.hash,
        newHash: file.hash,
        sizeDelta: file.size - saved.size,
      });
    }
  }

  for (const [path, snapshot] of Object.entries(savedSnapshots)) {
    if (!currentPaths.has(path)) {
      changes.push({
        path,
        type: "deleted",
        category: categorizeFile(path),
        oldHash: snapshot.hash,
        sizeDelta: -snapshot.size,
      });
    }
  }

  return changes;
}

/**
 * Generate a human-readable commit message from changes.
 */
export function generateCommitMessage(changes: CommitChange[]): string {
  if (changes.length === 0) return "No changes";

  const added = changes.filter((c) => c.type === "added");
  const modified = changes.filter((c) => c.type === "modified");
  const deleted = changes.filter((c) => c.type === "deleted");

  const parts: string[] = [];

  if (added.length > 0) {
    if (added.length === 1) {
      parts.push(`Add ${added[0].path}`);
    } else {
      const categories = [...new Set(added.map((c) => c.category))];
      if (categories.length === 1 && categories[0] !== "unknown") {
        parts.push(`Add ${added.length} ${categories[0]} files`);
      } else {
        parts.push(`Add ${added.length} files`);
      }
    }
  }

  if (modified.length > 0) {
    if (modified.length === 1) {
      parts.push(`Update ${modified[0].path}`);
    } else {
      const categories = [...new Set(modified.map((c) => c.category))];
      if (categories.length === 1 && categories[0] !== "unknown") {
        parts.push(`Update ${modified.length} ${categories[0]} files`);
      } else {
        parts.push(`Update ${modified.length} files`);
      }
    }
  }

  if (deleted.length > 0) {
    if (deleted.length === 1) {
      parts.push(`Remove ${deleted[0].path}`);
    } else {
      parts.push(`Remove ${deleted.length} files`);
    }
  }

  return parts.join(", ");
}

/**
 * Create a snapshot of the current file state (saves hashes for future diffing).
 */
export function takeSnapshot(projectPath: string): Record<string, FileSnapshot> {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  const config = state.config;
  const ignorePatterns = config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
  const trackExtensions = config.trackExtensions ?? DEFAULT_TRACK_EXTENSIONS;

  const currentFiles = scanDirectory(projectPath, projectPath, ignorePatterns, trackExtensions);

  const snapshots: Record<string, FileSnapshot> = {};
  for (const file of currentFiles) {
    snapshots[file.path] = {
      path: file.path,
      hash: file.hash,
      size: file.size,
      lastModified: file.lastModified,
    };
  }

  writeSnapshots(projectPath, snapshots);
  return snapshots;
}

/**
 * Create a commit from detected changes (or provided changes).
 * Returns null if no changes found.
 */
export function createCommit(
  projectPath: string,
  options?: {
    message?: string;
    author?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    changes?: CommitChange[];
  },
): AutoCommit | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  const changes = options?.changes ?? detectChanges(projectPath);
  if (changes.length === 0) return null;

  const now = Date.now();
  const author = options?.author ?? state.config.author;
  const message =
    options?.message ??
    (state.config.autoMessage !== false ? generateCommitMessage(changes) : "Auto-commit");

  const id = generateCommitId(now, message, author);

  const commit: AutoCommit = {
    id,
    projectId: state.config.projectId,
    timestamp: now,
    message,
    author,
    changes,
    strategy: state.config.strategy,
    parentId: state.lastCommitId,
    tags: options?.tags,
    metadata: options?.metadata,
  };

  writeCommit(projectPath, commit);

  takeSnapshot(projectPath);

  state.lastCommitId = id;
  state.lastCommitTime = now;
  state.totalCommits += 1;
  state.pendingChanges = [];
  state.updatedAt = now;
  writeState(projectPath, state);

  if (state.config.maxCommits && state.config.maxCommits > 0) {
    pruneCommits(projectPath, state.config.maxCommits);
  }

  return commit;
}

/**
 * Get a single commit by ID.
 */
export function getCommit(projectPath: string, commitId: string): AutoCommit | null {
  return readCommit(projectPath, commitId);
}

/**
 * Get commit history for a project.
 */
export function getHistory(projectPath: string, query?: CommitQuery): CommitHistory {
  const state = readState(projectPath);
  if (!state) {
    return { projectId: "", commits: [], totalCount: 0 };
  }

  // Walk the linked list of commits from the latest
  const allCommits: AutoCommit[] = [];
  let currentId = state.lastCommitId;

  while (currentId) {
    const commit = readCommit(projectPath, currentId);
    if (!commit) break;
    allCommits.push(commit);
    currentId = commit.parentId;
  }

  let filtered = allCommits;

  if (query?.since) {
    filtered = filtered.filter((c) => c.timestamp >= query.since!);
  }
  if (query?.until) {
    filtered = filtered.filter((c) => c.timestamp <= query.until!);
  }
  if (query?.author) {
    filtered = filtered.filter((c) => c.author === query.author);
  }
  if (query?.category) {
    filtered = filtered.filter((c) =>
      c.changes.some((ch) => ch.category === query.category),
    );
  }
  if (query?.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.message.toLowerCase().includes(searchLower) ||
        c.changes.some((ch) => ch.path.toLowerCase().includes(searchLower)),
    );
  }

  const totalCount = filtered.length;
  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? filtered.length;

  return {
    projectId: state.config.projectId,
    commits: filtered.slice(offset, offset + limit),
    totalCount,
  };
}

/**
 * Add pending changes without creating a commit (for batched strategy).
 */
export function addPendingChanges(projectPath: string, changes?: CommitChange[]): CommitChange[] {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  const detected = changes ?? detectChanges(projectPath);
  state.pendingChanges = [...state.pendingChanges, ...detected];
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return state.pendingChanges;
}

/**
 * Flush pending changes into a single commit (for batched strategy).
 * Returns null if no pending changes.
 */
export function flushPendingChanges(
  projectPath: string,
  options?: { message?: string; author?: string; tags?: string[] },
): AutoCommit | null {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  if (state.pendingChanges.length === 0) return null;

  const commit = createCommit(projectPath, {
    message: options?.message,
    author: options?.author,
    tags: options?.tags,
    changes: state.pendingChanges,
  });

  return commit;
}

/**
 * Check if it's time to commit based on the strategy and thresholds.
 */
export function shouldCommit(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) return false;

  const config = state.config;

  switch (config.strategy) {
    case "immediate":
      return true;

    case "batched": {
      const threshold = config.batchSize ?? 5;
      return state.pendingChanges.length >= threshold;
    }

    case "interval": {
      const intervalMs = config.intervalMs ?? 60_000;
      if (state.lastCommitTime === null) return true;
      return Date.now() - state.lastCommitTime >= intervalMs;
    }

    case "manual":
      return false;

    default:
      return false;
  }
}

/**
 * Start auto-commit tracking (marks the system as running).
 */
export function startTracking(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  if (state.isRunning) return false;

  state.isRunning = true;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  takeSnapshot(projectPath);

  return true;
}

/**
 * Stop auto-commit tracking.
 */
export function stopTracking(projectPath: string): boolean {
  const state = readState(projectPath);
  if (!state) {
    throw new Error("Auto-commit not initialized. Call initAutoCommit() first.");
  }

  if (!state.isRunning) return false;

  state.isRunning = false;
  state.updatedAt = Date.now();
  writeState(projectPath, state);

  return true;
}

/**
 * Get statistics about the auto-commit history.
 */
export function getStats(projectPath: string): CommitStats | null {
  const state = readState(projectPath);
  if (!state) return null;

  const history = getHistory(projectPath);

  let totalChanges = 0;
  let filesAdded = 0;
  let filesModified = 0;
  let filesDeleted = 0;
  let firstCommit: number | null = null;
  let lastCommit: number | null = null;
  const categoryCounts: Partial<Record<FileCategory, number>> = {};

  for (const commit of history.commits) {
    for (const change of commit.changes) {
      totalChanges++;
      if (change.type === "added") filesAdded++;
      else if (change.type === "modified") filesModified++;
      else if (change.type === "deleted") filesDeleted++;

      categoryCounts[change.category] = (categoryCounts[change.category] ?? 0) + 1;
    }

    if (firstCommit === null || commit.timestamp < firstCommit) {
      firstCommit = commit.timestamp;
    }
    if (lastCommit === null || commit.timestamp > lastCommit) {
      lastCommit = commit.timestamp;
    }
  }

  return {
    projectId: state.config.projectId,
    totalCommits: history.totalCount,
    totalChanges,
    filesAdded,
    filesModified,
    filesDeleted,
    categoryCounts,
    firstCommit,
    lastCommit,
    averageChangesPerCommit:
      history.totalCount > 0 ? totalChanges / history.totalCount : 0,
  };
}

/**
 * Prune old commits to keep only the latest N.
 */
export function pruneCommits(projectPath: string, keepCount: number): number {
  const history = getHistory(projectPath);
  const toDelete = history.commits.slice(keepCount);

  let deleted = 0;
  const commitsDir = getCommitsDir(projectPath);

  for (const commit of toDelete) {
    const commitPath = join(commitsDir, `${commit.id}.json`);
    if (existsSync(commitPath)) {
      rmSync(commitPath);
      deleted++;
    }
  }

  if (keepCount > 0 && history.commits.length > keepCount) {
    const oldest = history.commits[keepCount - 1];
    if (oldest) {
      oldest.parentId = null;
      writeCommit(projectPath, oldest);
    }
  }

  return deleted;
}

/**
 * Format a commit as a one-line summary.
 */
export function formatCommitOneline(commit: AutoCommit): string {
  const shortId = commit.id.slice(0, 7);
  const changeCount = commit.changes.length;
  const changeSuffix = changeCount > 0 ? ` (${changeCount} change${changeCount > 1 ? "s" : ""})` : "";
  return `${shortId} ${commit.message}${changeSuffix}`;
}

/**
 * Format a commit with full details.
 */
export function formatCommitFull(commit: AutoCommit): string {
  const lines: string[] = [
    `commit ${commit.id}`,
    `Author:   ${commit.author}`,
    `Date:     ${new Date(commit.timestamp).toISOString()}`,
    `Strategy: ${commit.strategy}`,
  ];

  if (commit.parentId) {
    lines.splice(1, 0, `Parent:   ${commit.parentId}`);
  }

  if (commit.tags && commit.tags.length > 0) {
    lines.push(`Tags:     ${commit.tags.join(", ")}`);
  }

  lines.push("", `    ${commit.message}`, "");

  if (commit.changes.length > 0) {
    lines.push("  Changes:");
    for (const change of commit.changes) {
      const prefix =
        change.type === "added" ? "+" : change.type === "deleted" ? "-" : "M";
      const delta = change.sizeDelta != null ? ` (${change.sizeDelta > 0 ? "+" : ""}${change.sizeDelta}B)` : "";
      lines.push(`    ${prefix} [${change.category}] ${change.path}${delta}`);
    }
  }

  return lines.join("\n");
}

/**
 * Destroy the auto-commit system for a project. Removes all data.
 */
export function destroyAutoCommit(projectPath: string): boolean {
  const acDir = getAutocommitDir(projectPath);
  if (!existsSync(acDir)) return false;

  rmSync(acDir, { recursive: true, force: true });
  return true;
}
