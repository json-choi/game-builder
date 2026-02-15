import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────

export type WorkLogOperationType =
  | "file-create"
  | "file-modify"
  | "file-delete"
  | "file-rename"
  | "scene-create"
  | "scene-modify"
  | "script-create"
  | "script-modify"
  | "export-start"
  | "export-success"
  | "export-fail"
  | "plugin-install"
  | "plugin-remove"
  | "config-change"
  | "ai-generation"
  | "build-start"
  | "build-success"
  | "build-fail"
  | "checkpoint";

export interface FileChange {
  path: string;
  type: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
  contentHash?: string;
  /** Lines added (approximate) */
  linesAdded?: number;
  /** Lines removed (approximate) */
  linesRemoved?: number;
}

export interface WorkLogEntry {
  id: string;
  parentId: string | null;
  projectId: string;
  timestamp: number;
  operation: WorkLogOperationType;
  message: string;
  author: string;
  changes: FileChange[];
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface WorkLogHead {
  projectId: string;
  branch: string;
  entryId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkLogSummary {
  projectId: string;
  totalEntries: number;
  branches: string[];
  currentBranch: string;
  headEntryId: string | null;
  firstEntry: number | null;
  lastEntry: number | null;
  operationCounts: Partial<Record<WorkLogOperationType, number>>;
}

export interface WorkLogDiff {
  fromId: string | null;
  toId: string;
  entries: WorkLogEntry[];
  totalChanges: number;
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
}

export interface WorkLogQuery {
  operation?: WorkLogOperationType | WorkLogOperationType[];
  author?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  tags?: string[];
  search?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const WORKLOG_DIR = ".worklog";
const ENTRIES_DIR = "entries";
const HEADS_FILE = "heads.json";
const INDEX_FILE = "index.json";
const DEFAULT_BRANCH = "main";

// ─── Internal Helpers ──────────────────────────────────────────────────────

function getWorklogDir(projectPath: string): string {
  return join(resolve(projectPath), WORKLOG_DIR);
}

function getEntriesDir(projectPath: string): string {
  return join(getWorklogDir(projectPath), ENTRIES_DIR);
}

function getHeadsPath(projectPath: string): string {
  return join(getWorklogDir(projectPath), HEADS_FILE);
}

function getIndexPath(projectPath: string): string {
  return join(getWorklogDir(projectPath), INDEX_FILE);
}

interface EntryIndex {
  entries: string[];
  branches: Record<string, string | null>;
}

function readIndex(projectPath: string): EntryIndex {
  const indexPath = getIndexPath(projectPath);
  if (!existsSync(indexPath)) {
    return { entries: [], branches: { [DEFAULT_BRANCH]: null } };
  }
  return JSON.parse(readFileSync(indexPath, "utf-8"));
}

function writeIndex(projectPath: string, index: EntryIndex): void {
  writeFileSync(getIndexPath(projectPath), JSON.stringify(index, null, 2), "utf-8");
}

function readHeads(projectPath: string): Record<string, WorkLogHead> {
  const headsPath = getHeadsPath(projectPath);
  if (!existsSync(headsPath)) return {};
  return JSON.parse(readFileSync(headsPath, "utf-8"));
}

function writeHeads(projectPath: string, heads: Record<string, WorkLogHead>): void {
  writeFileSync(getHeadsPath(projectPath), JSON.stringify(heads, null, 2), "utf-8");
}

function readEntry(projectPath: string, entryId: string): WorkLogEntry | null {
  const entryPath = join(getEntriesDir(projectPath), `${entryId}.json`);
  if (!existsSync(entryPath)) return null;
  return JSON.parse(readFileSync(entryPath, "utf-8"));
}

function writeEntry(projectPath: string, entry: WorkLogEntry): void {
  const entriesDir = getEntriesDir(projectPath);
  if (!existsSync(entriesDir)) {
    mkdirSync(entriesDir, { recursive: true });
  }
  writeFileSync(join(entriesDir, `${entry.id}.json`), JSON.stringify(entry, null, 2), "utf-8");
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a short hash ID for a work log entry (Git-style).
 */
export function generateEntryId(timestamp: number, message: string, author: string): string {
  const input = `${timestamp}:${message}:${author}:${Math.random().toString(36).slice(2)}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/**
 * Compute a content hash for a file (SHA-256 truncated to 8 chars).
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * Initialize a work log for a project. Creates .worklog directory structure.
 * Returns true if freshly initialized, false if already exists.
 */
export function initWorkLog(projectPath: string, projectId: string): boolean {
  const worklogDir = getWorklogDir(projectPath);

  if (existsSync(worklogDir)) {
    return false;
  }

  mkdirSync(worklogDir, { recursive: true });
  mkdirSync(getEntriesDir(projectPath), { recursive: true });

  const now = Date.now();
  const index: EntryIndex = {
    entries: [],
    branches: { [DEFAULT_BRANCH]: null },
  };
  writeIndex(projectPath, index);

  const heads: Record<string, WorkLogHead> = {
    [DEFAULT_BRANCH]: {
      projectId,
      branch: DEFAULT_BRANCH,
      entryId: null,
      createdAt: now,
      updatedAt: now,
    },
  };
  writeHeads(projectPath, heads);

  return true;
}

/**
 * Check if a project has a work log initialized.
 */
export function hasWorkLog(projectPath: string): boolean {
  return existsSync(getWorklogDir(projectPath));
}

/**
 * Record a new work log entry. Returns the created entry.
 */
export function recordEntry(
  projectPath: string,
  options: {
    projectId: string;
    operation: WorkLogOperationType;
    message: string;
    author: string;
    changes?: FileChange[];
    metadata?: Record<string, unknown>;
    tags?: string[];
    branch?: string;
  },
): WorkLogEntry {
  const branch = options.branch ?? DEFAULT_BRANCH;
  const heads = readHeads(projectPath);
  const index = readIndex(projectPath);

  if (!heads[branch]) {
    throw new Error(`Branch "${branch}" does not exist. Create it first with createBranch().`);
  }

  const now = Date.now();
  const id = generateEntryId(now, options.message, options.author);

  const entry: WorkLogEntry = {
    id,
    parentId: heads[branch].entryId,
    projectId: options.projectId,
    timestamp: now,
    operation: options.operation,
    message: options.message,
    author: options.author,
    changes: options.changes ?? [],
    metadata: options.metadata,
    tags: options.tags,
  };

  writeEntry(projectPath, entry);

  index.entries.push(id);
  index.branches[branch] = id;
  writeIndex(projectPath, index);

  heads[branch].entryId = id;
  heads[branch].updatedAt = now;
  writeHeads(projectPath, heads);

  return entry;
}

/**
 * Get a single work log entry by ID.
 */
export function getEntry(projectPath: string, entryId: string): WorkLogEntry | null {
  return readEntry(projectPath, entryId);
}

/**
 * Get the log (list of entries) for a branch, newest first.
 */
export function getLog(projectPath: string, query?: WorkLogQuery & { branch?: string }): WorkLogEntry[] {
  const branch = query?.branch ?? DEFAULT_BRANCH;
  const heads = readHeads(projectPath);

  if (!heads[branch]) return [];

  const entries: WorkLogEntry[] = [];
  let currentId = heads[branch].entryId;

  while (currentId) {
    const entry = readEntry(projectPath, currentId);
    if (!entry) break;
    entries.push(entry);
    currentId = entry.parentId;
  }

  let filtered = entries;

  if (query?.operation) {
    const ops = Array.isArray(query.operation) ? query.operation : [query.operation];
    filtered = filtered.filter((e) => ops.includes(e.operation));
  }

  if (query?.author) {
    filtered = filtered.filter((e) => e.author === query.author);
  }

  if (query?.since) {
    filtered = filtered.filter((e) => e.timestamp >= query.since!);
  }

  if (query?.until) {
    filtered = filtered.filter((e) => e.timestamp <= query.until!);
  }

  if (query?.tags && query.tags.length > 0) {
    filtered = filtered.filter((e) =>
      e.tags?.some((t) => query.tags!.includes(t)),
    );
  }

  if (query?.search) {
    const searchLower = query.search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.message.toLowerCase().includes(searchLower) ||
        e.changes.some((c) => c.path.toLowerCase().includes(searchLower)),
    );
  }

  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? filtered.length;

  return filtered.slice(offset, offset + limit);
}

/**
 * Create a new branch from the current head of an existing branch.
 */
export function createBranch(
  projectPath: string,
  branchName: string,
  fromBranch?: string,
): WorkLogHead {
  const source = fromBranch ?? DEFAULT_BRANCH;
  const heads = readHeads(projectPath);
  const index = readIndex(projectPath);

  if (heads[branchName]) {
    throw new Error(`Branch "${branchName}" already exists.`);
  }

  if (!heads[source]) {
    throw new Error(`Source branch "${source}" does not exist.`);
  }

  const now = Date.now();
  const newHead: WorkLogHead = {
    projectId: heads[source].projectId,
    branch: branchName,
    entryId: heads[source].entryId,
    createdAt: now,
    updatedAt: now,
  };

  heads[branchName] = newHead;
  writeHeads(projectPath, heads);

  index.branches[branchName] = heads[source].entryId;
  writeIndex(projectPath, index);

  return newHead;
}

/**
 * List all branches in the work log.
 */
export function listBranches(projectPath: string): WorkLogHead[] {
  const heads = readHeads(projectPath);
  return Object.values(heads).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Delete a branch (cannot delete DEFAULT_BRANCH).
 */
export function deleteBranch(projectPath: string, branchName: string): boolean {
  if (branchName === DEFAULT_BRANCH) {
    throw new Error(`Cannot delete the default branch "${DEFAULT_BRANCH}".`);
  }

  const heads = readHeads(projectPath);
  const index = readIndex(projectPath);

  if (!heads[branchName]) return false;

  delete heads[branchName];
  writeHeads(projectPath, heads);

  delete index.branches[branchName];
  writeIndex(projectPath, index);

  return true;
}

/**
 * Get a diff between two entries (or from the beginning to an entry).
 */
export function getDiff(
  projectPath: string,
  fromId: string | null,
  toId: string,
): WorkLogDiff {
  const log = getLog(projectPath);

  const toIdx = log.findIndex((e) => e.id === toId);
  if (toIdx === -1) {
    throw new Error(`Entry "${toId}" not found in log.`);
  }

  let fromIdx: number;
  if (fromId === null) {
    fromIdx = log.length;
  } else {
    fromIdx = log.findIndex((e) => e.id === fromId);
    if (fromIdx === -1) {
      throw new Error(`Entry "${fromId}" not found in log.`);
    }
  }

  const startIdx = Math.min(toIdx, fromIdx - 1);
  const endIdx = Math.max(toIdx, fromIdx - 1);
  const rangeEntries = log.slice(startIdx, endIdx + 1).reverse();

  const filesAdded: Set<string> = new Set();
  const filesModified: Set<string> = new Set();
  const filesDeleted: Set<string> = new Set();

  for (const entry of rangeEntries) {
    for (const change of entry.changes) {
      if (change.type === "added") filesAdded.add(change.path);
      else if (change.type === "modified") filesModified.add(change.path);
      else if (change.type === "deleted") filesDeleted.add(change.path);
      else if (change.type === "renamed") {
        if (change.oldPath) filesDeleted.add(change.oldPath);
        filesAdded.add(change.path);
      }
    }
  }

  for (const file of filesAdded) {
    filesModified.delete(file);
  }
  for (const file of filesDeleted) {
    if (filesAdded.has(file)) {
      filesAdded.delete(file);
      filesDeleted.delete(file);
    }
  }

  return {
    fromId,
    toId,
    entries: rangeEntries,
    totalChanges: filesAdded.size + filesModified.size + filesDeleted.size,
    filesAdded: [...filesAdded],
    filesModified: [...filesModified],
    filesDeleted: [...filesDeleted],
  };
}

/**
 * Add a tag to an existing entry.
 */
export function tagEntry(projectPath: string, entryId: string, tag: string): boolean {
  const entry = readEntry(projectPath, entryId);
  if (!entry) return false;

  if (!entry.tags) entry.tags = [];
  if (entry.tags.includes(tag)) return false;

  entry.tags.push(tag);
  writeEntry(projectPath, entry);
  return true;
}

/**
 * Remove a tag from an existing entry.
 */
export function untagEntry(projectPath: string, entryId: string, tag: string): boolean {
  const entry = readEntry(projectPath, entryId);
  if (!entry) return false;
  if (!entry.tags || !entry.tags.includes(tag)) return false;

  entry.tags = entry.tags.filter((t) => t !== tag);
  writeEntry(projectPath, entry);
  return true;
}

/**
 * Get a summary of the work log for a project.
 */
export function getSummary(projectPath: string): WorkLogSummary | null {
  if (!hasWorkLog(projectPath)) return null;

  const heads = readHeads(projectPath);
  const index = readIndex(projectPath);
  const branches = Object.keys(index.branches);

  const operationCounts: Partial<Record<WorkLogOperationType, number>> = {};
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const entryId of index.entries) {
    const entry = readEntry(projectPath, entryId);
    if (!entry) continue;

    operationCounts[entry.operation] = (operationCounts[entry.operation] ?? 0) + 1;

    if (firstTimestamp === null || entry.timestamp < firstTimestamp) {
      firstTimestamp = entry.timestamp;
    }
    if (lastTimestamp === null || entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
  }

  let currentBranch = DEFAULT_BRANCH;
  let latestUpdate = 0;
  for (const head of Object.values(heads)) {
    if (head.updatedAt > latestUpdate) {
      latestUpdate = head.updatedAt;
      currentBranch = head.branch;
    }
  }

  return {
    projectId: heads[DEFAULT_BRANCH]?.projectId ?? "",
    totalEntries: index.entries.length,
    branches,
    currentBranch,
    headEntryId: heads[currentBranch]?.entryId ?? null,
    firstEntry: firstTimestamp,
    lastEntry: lastTimestamp,
    operationCounts,
  };
}

/**
 * Format a work log entry as a single-line log string (like `git log --oneline`).
 */
export function formatEntryOneline(entry: WorkLogEntry): string {
  const shortId = entry.id.slice(0, 7);
  const changeCount = entry.changes.length;
  const changeSuffix = changeCount > 0 ? ` (${changeCount} file${changeCount > 1 ? "s" : ""})` : "";
  return `${shortId} [${entry.operation}] ${entry.message}${changeSuffix}`;
}

/**
 * Format a work log entry with full detail (like `git log`).
 */
export function formatEntryFull(entry: WorkLogEntry): string {
  const lines: string[] = [
    `entry ${entry.id}`,
    `Author: ${entry.author}`,
    `Date:   ${new Date(entry.timestamp).toISOString()}`,
    `Op:     ${entry.operation}`,
  ];

  if (entry.parentId) {
    lines.splice(1, 0, `Parent: ${entry.parentId}`);
  }

  if (entry.tags && entry.tags.length > 0) {
    lines.push(`Tags:   ${entry.tags.join(", ")}`);
  }

  lines.push("", `    ${entry.message}`, "");

  if (entry.changes.length > 0) {
    lines.push("  Changes:");
    for (const change of entry.changes) {
      const prefix =
        change.type === "added"
          ? "+"
          : change.type === "deleted"
            ? "-"
            : change.type === "renamed"
              ? "R"
              : "M";
      const detail =
        change.type === "renamed" && change.oldPath
          ? `${change.oldPath} -> ${change.path}`
          : change.path;
      lines.push(`    ${prefix} ${detail}`);
    }
  }

  return lines.join("\n");
}

/**
 * Remove the entire work log for a project. Destructive operation.
 */
export function destroyWorkLog(projectPath: string): boolean {
  const worklogDir = getWorklogDir(projectPath);
  if (!existsSync(worklogDir)) return false;

  rmSync(worklogDir, { recursive: true, force: true });
  return true;
}
