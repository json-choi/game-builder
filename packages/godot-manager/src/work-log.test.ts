import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateEntryId,
  computeContentHash,
  initWorkLog,
  hasWorkLog,
  recordEntry,
  getEntry,
  getLog,
  createBranch,
  listBranches,
  deleteBranch,
  getDiff,
  tagEntry,
  untagEntry,
  getSummary,
  formatEntryOneline,
  formatEntryFull,
  destroyWorkLog,
  type WorkLogEntry,
  type FileChange,
} from "./work-log";

let testDir: string;
const PROJECT_ID = "test-project-001";
const AUTHOR = "test-agent";

beforeEach(() => {
  const id = `worklog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function initAndRecord(
  message: string,
  operation: Parameters<typeof recordEntry>[1]["operation"] = "file-create",
  changes: FileChange[] = [],
): WorkLogEntry {
  if (!hasWorkLog(testDir)) {
    initWorkLog(testDir, PROJECT_ID);
  }
  return recordEntry(testDir, {
    projectId: PROJECT_ID,
    operation,
    message,
    author: AUTHOR,
    changes,
  });
}

describe("work-log", () => {
  describe("generateEntryId", () => {
    test("returns a 12-character hex string", () => {
      const id = generateEntryId(Date.now(), "test", "author");
      expect(id).toHaveLength(12);
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    });

    test("generates unique IDs for same input", () => {
      const now = Date.now();
      const id1 = generateEntryId(now, "same", "author");
      const id2 = generateEntryId(now, "same", "author");
      expect(id1).not.toBe(id2);
    });
  });

  describe("computeContentHash", () => {
    test("returns 8-character hex string", () => {
      const hash = computeContentHash("hello world");
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    test("returns consistent hash for same content", () => {
      const hash1 = computeContentHash("same content");
      const hash2 = computeContentHash("same content");
      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different content", () => {
      const hash1 = computeContentHash("content a");
      const hash2 = computeContentHash("content b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("initWorkLog", () => {
    test("creates .worklog directory structure", () => {
      const result = initWorkLog(testDir, PROJECT_ID);

      expect(result).toBe(true);
      expect(existsSync(join(testDir, ".worklog"))).toBe(true);
      expect(existsSync(join(testDir, ".worklog", "entries"))).toBe(true);
      expect(existsSync(join(testDir, ".worklog", "heads.json"))).toBe(true);
      expect(existsSync(join(testDir, ".worklog", "index.json"))).toBe(true);
    });

    test("returns false if already initialized", () => {
      initWorkLog(testDir, PROJECT_ID);
      const result = initWorkLog(testDir, PROJECT_ID);
      expect(result).toBe(false);
    });

    test("creates default main branch in heads", () => {
      initWorkLog(testDir, PROJECT_ID);

      const heads = JSON.parse(readFileSync(join(testDir, ".worklog", "heads.json"), "utf-8"));
      expect(heads.main).toBeDefined();
      expect(heads.main.branch).toBe("main");
      expect(heads.main.projectId).toBe(PROJECT_ID);
      expect(heads.main.entryId).toBeNull();
    });

    test("creates empty index with main branch", () => {
      initWorkLog(testDir, PROJECT_ID);

      const index = JSON.parse(readFileSync(join(testDir, ".worklog", "index.json"), "utf-8"));
      expect(index.entries).toEqual([]);
      expect(index.branches).toEqual({ main: null });
    });
  });

  describe("hasWorkLog", () => {
    test("returns false for uninitialized project", () => {
      expect(hasWorkLog(testDir)).toBe(false);
    });

    test("returns true after initialization", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(hasWorkLog(testDir)).toBe(true);
    });
  });

  describe("recordEntry", () => {
    test("creates an entry with all fields", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Create main scene",
        author: AUTHOR,
        changes: [{ path: "scenes/main.tscn", type: "added" }],
        metadata: { tool: "scene-builder" },
        tags: ["v1"],
      });

      expect(entry.id).toHaveLength(12);
      expect(entry.parentId).toBeNull();
      expect(entry.projectId).toBe(PROJECT_ID);
      expect(entry.operation).toBe("file-create");
      expect(entry.message).toBe("Create main scene");
      expect(entry.author).toBe(AUTHOR);
      expect(entry.changes).toHaveLength(1);
      expect(entry.changes[0].path).toBe("scenes/main.tscn");
      expect(entry.metadata).toEqual({ tool: "scene-builder" });
      expect(entry.tags).toEqual(["v1"]);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    test("chains entries with parentId", () => {
      initWorkLog(testDir, PROJECT_ID);

      const first = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "First",
        author: AUTHOR,
      });

      const second = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-modify",
        message: "Second",
        author: AUTHOR,
      });

      expect(first.parentId).toBeNull();
      expect(second.parentId).toBe(first.id);
    });

    test("persists entry to disk", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "script-create",
        message: "Add player script",
        author: AUTHOR,
      });

      const entryPath = join(testDir, ".worklog", "entries", `${entry.id}.json`);
      expect(existsSync(entryPath)).toBe(true);

      const persisted = JSON.parse(readFileSync(entryPath, "utf-8"));
      expect(persisted.id).toBe(entry.id);
      expect(persisted.message).toBe("Add player script");
    });

    test("updates index with new entry ID", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Test",
        author: AUTHOR,
      });

      const index = JSON.parse(readFileSync(join(testDir, ".worklog", "index.json"), "utf-8"));
      expect(index.entries).toContain(entry.id);
      expect(index.branches.main).toBe(entry.id);
    });

    test("updates head pointer", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Test",
        author: AUTHOR,
      });

      const heads = JSON.parse(readFileSync(join(testDir, ".worklog", "heads.json"), "utf-8"));
      expect(heads.main.entryId).toBe(entry.id);
    });

    test("defaults changes to empty array", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "checkpoint",
        message: "Checkpoint",
        author: AUTHOR,
      });

      expect(entry.changes).toEqual([]);
    });

    test("throws when branch does not exist", () => {
      initWorkLog(testDir, PROJECT_ID);

      expect(() =>
        recordEntry(testDir, {
          projectId: PROJECT_ID,
          operation: "file-create",
          message: "Test",
          author: AUTHOR,
          branch: "nonexistent",
        }),
      ).toThrow('Branch "nonexistent" does not exist');
    });

    test("records to specified branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "feature");

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Feature work",
        author: AUTHOR,
        branch: "feature",
      });

      const heads = JSON.parse(readFileSync(join(testDir, ".worklog", "heads.json"), "utf-8"));
      expect(heads.feature.entryId).toBe(entry.id);
      expect(heads.main.entryId).toBeNull();
    });

    test("records multiple file changes in one entry", () => {
      initWorkLog(testDir, PROJECT_ID);

      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "ai-generation",
        message: "AI generated player and enemy",
        author: "game-coder",
        changes: [
          { path: "scripts/player.gd", type: "added", linesAdded: 50 },
          { path: "scripts/enemy.gd", type: "added", linesAdded: 30 },
          { path: "scenes/main.tscn", type: "modified", linesAdded: 5, linesRemoved: 2 },
        ],
      });

      expect(entry.changes).toHaveLength(3);
      expect(entry.changes[0].linesAdded).toBe(50);
      expect(entry.changes[2].linesRemoved).toBe(2);
    });
  });

  describe("getEntry", () => {
    test("retrieves a recorded entry", () => {
      const original = initAndRecord("Test entry");

      const retrieved = getEntry(testDir, original.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(original.id);
      expect(retrieved!.message).toBe("Test entry");
    });

    test("returns null for nonexistent ID", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(getEntry(testDir, "nonexistent123")).toBeNull();
    });
  });

  describe("getLog", () => {
    test("returns empty array for empty log", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(getLog(testDir)).toEqual([]);
    });

    test("returns entries newest-first", () => {
      const e1 = initAndRecord("First");
      const e2 = initAndRecord("Second");
      const e3 = initAndRecord("Third");

      const log = getLog(testDir);
      expect(log).toHaveLength(3);
      expect(log[0].id).toBe(e3.id);
      expect(log[1].id).toBe(e2.id);
      expect(log[2].id).toBe(e1.id);
    });

    test("filters by operation type", () => {
      initAndRecord("Create file", "file-create");
      initAndRecord("Modify file", "file-modify");
      initAndRecord("Create another", "file-create");

      const log = getLog(testDir, { operation: "file-create" });
      expect(log).toHaveLength(2);
      expect(log.every((e) => e.operation === "file-create")).toBe(true);
    });

    test("filters by multiple operation types", () => {
      initAndRecord("Create", "file-create");
      initAndRecord("Build", "build-start");
      initAndRecord("Export", "export-success");

      const log = getLog(testDir, { operation: ["file-create", "export-success"] });
      expect(log).toHaveLength(2);
    });

    test("filters by author", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "By agent",
        author: "agent-a",
      });
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "By user",
        author: "user",
      });

      const log = getLog(testDir, { author: "agent-a" });
      expect(log).toHaveLength(1);
      expect(log[0].author).toBe("agent-a");
    });

    test("filters by since timestamp", () => {
      initWorkLog(testDir, PROJECT_ID);
      const e1 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Early",
        author: AUTHOR,
      });
      const e2 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-modify",
        message: "Late",
        author: AUTHOR,
      });

      const before = e1.timestamp - 1;
      const allLog = getLog(testDir, { since: before });
      expect(allLog).toHaveLength(2);

      const afterFirst = e2.timestamp + 1;
      const noneLog = getLog(testDir, { since: afterFirst });
      expect(noneLog).toHaveLength(0);
    });

    test("filters by until timestamp", () => {
      initWorkLog(testDir, PROJECT_ID);
      const e1 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Early",
        author: AUTHOR,
      });

      const untilBefore = e1.timestamp - 1;
      expect(getLog(testDir, { until: untilBefore })).toHaveLength(0);

      const untilAfter = e1.timestamp + 1;
      expect(getLog(testDir, { until: untilAfter })).toHaveLength(1);
    });

    test("filters by tags", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "checkpoint",
        message: "Version 1",
        author: AUTHOR,
        tags: ["v1", "release"],
      });
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "checkpoint",
        message: "Version 2",
        author: AUTHOR,
        tags: ["v2"],
      });

      const log = getLog(testDir, { tags: ["v1"] });
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe("Version 1");
    });

    test("filters by search text in message", () => {
      initAndRecord("Add player script");
      initAndRecord("Add enemy script");
      initAndRecord("Fix build error");

      const log = getLog(testDir, { search: "script" });
      expect(log).toHaveLength(2);
    });

    test("filters by search text in file paths", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Create scene",
        author: AUTHOR,
        changes: [{ path: "scenes/player.tscn", type: "added" }],
      });
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "script-create",
        message: "Create script",
        author: AUTHOR,
        changes: [{ path: "scripts/enemy.gd", type: "added" }],
      });

      const log = getLog(testDir, { search: "player" });
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe("Create scene");
    });

    test("applies limit", () => {
      initAndRecord("First");
      initAndRecord("Second");
      initAndRecord("Third");

      const log = getLog(testDir, { limit: 2 });
      expect(log).toHaveLength(2);
    });

    test("applies offset", () => {
      initAndRecord("First");
      initAndRecord("Second");
      initAndRecord("Third");

      const log = getLog(testDir, { offset: 1, limit: 1 });
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe("Second");
    });

    test("returns entries from specific branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Main work",
        author: AUTHOR,
      });

      createBranch(testDir, "feature");
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Feature work",
        author: AUTHOR,
        branch: "feature",
      });

      const mainLog = getLog(testDir, { branch: "main" });
      expect(mainLog).toHaveLength(1);
      expect(mainLog[0].message).toBe("Main work");

      const featureLog = getLog(testDir, { branch: "feature" });
      expect(featureLog).toHaveLength(2);
      expect(featureLog[0].message).toBe("Feature work");
      expect(featureLog[1].message).toBe("Main work");
    });

    test("returns empty for nonexistent branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(getLog(testDir, { branch: "nonexistent" })).toEqual([]);
    });
  });

  describe("createBranch", () => {
    test("creates a new branch from main", () => {
      initWorkLog(testDir, PROJECT_ID);

      const head = createBranch(testDir, "feature");
      expect(head.branch).toBe("feature");
      expect(head.projectId).toBe(PROJECT_ID);
      expect(head.entryId).toBeNull();
    });

    test("creates branch with current head entry", () => {
      const entry = initAndRecord("Initial work");

      const head = createBranch(testDir, "bugfix");
      expect(head.entryId).toBe(entry.id);
    });

    test("creates branch from another branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "develop");
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Dev work",
        author: AUTHOR,
        branch: "develop",
      });

      const head = createBranch(testDir, "feature", "develop");
      const developHeads = JSON.parse(
        readFileSync(join(testDir, ".worklog", "heads.json"), "utf-8"),
      );
      expect(head.entryId).toBe(developHeads.develop.entryId);
    });

    test("throws when branch already exists", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "existing");

      expect(() => createBranch(testDir, "existing")).toThrow(
        'Branch "existing" already exists',
      );
    });

    test("throws when source branch does not exist", () => {
      initWorkLog(testDir, PROJECT_ID);

      expect(() => createBranch(testDir, "feature", "nonexistent")).toThrow(
        'Source branch "nonexistent" does not exist',
      );
    });
  });

  describe("listBranches", () => {
    test("returns only main branch initially", () => {
      initWorkLog(testDir, PROJECT_ID);

      const branches = listBranches(testDir);
      expect(branches).toHaveLength(1);
      expect(branches[0].branch).toBe("main");
    });

    test("returns all branches sorted by creation time", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "alpha");
      createBranch(testDir, "beta");

      const branches = listBranches(testDir);
      expect(branches).toHaveLength(3);
      expect(branches[0].branch).toBe("main");
      expect(branches[1].branch).toBe("alpha");
      expect(branches[2].branch).toBe("beta");
    });
  });

  describe("deleteBranch", () => {
    test("deletes an existing branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "temp");

      expect(deleteBranch(testDir, "temp")).toBe(true);

      const branches = listBranches(testDir);
      expect(branches).toHaveLength(1);
      expect(branches[0].branch).toBe("main");
    });

    test("returns false for nonexistent branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(deleteBranch(testDir, "nonexistent")).toBe(false);
    });

    test("throws when trying to delete main branch", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(() => deleteBranch(testDir, "main")).toThrow("Cannot delete the default branch");
    });

    test("removes branch from index", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "removable");
      deleteBranch(testDir, "removable");

      const index = JSON.parse(readFileSync(join(testDir, ".worklog", "index.json"), "utf-8"));
      expect(index.branches.removable).toBeUndefined();
    });
  });

  describe("getDiff", () => {
    test("computes diff from beginning to entry", () => {
      initWorkLog(testDir, PROJECT_ID);

      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Add player",
        author: AUTHOR,
        changes: [{ path: "scripts/player.gd", type: "added" }],
      });
      const e2 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Add enemy",
        author: AUTHOR,
        changes: [{ path: "scripts/enemy.gd", type: "added" }],
      });

      const diff = getDiff(testDir, null, e2.id);
      expect(diff.filesAdded).toContain("scripts/player.gd");
      expect(diff.filesAdded).toContain("scripts/enemy.gd");
      expect(diff.entries).toHaveLength(2);
    });

    test("computes diff between two entries", () => {
      const e1 = initAndRecord("First", "file-create", [
        { path: "a.gd", type: "added" },
      ]);
      initAndRecord("Second", "file-modify", [
        { path: "a.gd", type: "modified" },
      ]);
      const e3 = initAndRecord("Third", "file-create", [
        { path: "b.gd", type: "added" },
      ]);

      const diff = getDiff(testDir, e1.id, e3.id);
      expect(diff.fromId).toBe(e1.id);
      expect(diff.toId).toBe(e3.id);
      expect(diff.filesModified).toContain("a.gd");
      expect(diff.filesAdded).toContain("b.gd");
    });

    test("handles renamed files", () => {
      const e1 = initAndRecord("Create", "file-create", [
        { path: "old.gd", type: "added" },
      ]);
      const e2 = initAndRecord("Rename", "file-rename", [
        { path: "new.gd", type: "renamed", oldPath: "old.gd" },
      ]);

      const diff = getDiff(testDir, e1.id, e2.id);
      expect(diff.filesAdded).toContain("new.gd");
      expect(diff.filesDeleted).toContain("old.gd");
    });

    test("collapses add + delete of same file", () => {
      const e1 = initAndRecord("Add", "file-create", [
        { path: "temp.gd", type: "added" },
      ]);
      const e2 = initAndRecord("Delete", "file-delete", [
        { path: "temp.gd", type: "deleted" },
      ]);

      const diff = getDiff(testDir, null, e2.id);
      expect(diff.filesAdded).not.toContain("temp.gd");
      expect(diff.filesDeleted).not.toContain("temp.gd");
    });

    test("collapses add + modify to just add", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Add file",
        author: AUTHOR,
        changes: [{ path: "new.gd", type: "added" }],
      });
      const e2 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-modify",
        message: "Modify file",
        author: AUTHOR,
        changes: [{ path: "new.gd", type: "modified" }],
      });

      const diff = getDiff(testDir, null, e2.id);
      expect(diff.filesAdded).toContain("new.gd");
      expect(diff.filesModified).not.toContain("new.gd");
    });

    test("throws for nonexistent toId", () => {
      initWorkLog(testDir, PROJECT_ID);
      initAndRecord("Entry");

      expect(() => getDiff(testDir, null, "nonexistent")).toThrow('Entry "nonexistent" not found');
    });

    test("throws for nonexistent fromId", () => {
      const entry = initAndRecord("Entry");

      expect(() => getDiff(testDir, "nonexistent", entry.id)).toThrow(
        'Entry "nonexistent" not found',
      );
    });

    test("reports totalChanges correctly", () => {
      initWorkLog(testDir, PROJECT_ID);
      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "ai-generation",
        message: "Generate code",
        author: AUTHOR,
        changes: [
          { path: "a.gd", type: "added" },
          { path: "b.gd", type: "added" },
        ],
      });
      const e2 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-modify",
        message: "Edit code",
        author: AUTHOR,
        changes: [
          { path: "a.gd", type: "modified" },
          { path: "c.gd", type: "deleted" },
        ],
      });

      const diff = getDiff(testDir, null, e2.id);
      expect(diff.totalChanges).toBe(3);
    });
  });

  describe("tagEntry", () => {
    test("adds a tag to an entry", () => {
      const entry = initAndRecord("Checkpoint");

      expect(tagEntry(testDir, entry.id, "v1.0")).toBe(true);

      const updated = getEntry(testDir, entry.id);
      expect(updated!.tags).toContain("v1.0");
    });

    test("returns false for duplicate tag", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "checkpoint",
        message: "Release",
        author: AUTHOR,
        tags: ["v1"],
      });

      expect(tagEntry(testDir, entry.id, "v1")).toBe(false);
    });

    test("returns false for nonexistent entry", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(tagEntry(testDir, "nonexistent", "tag")).toBe(false);
    });

    test("adds tag to entry with no existing tags", () => {
      const entry = initAndRecord("No tags");

      expect(tagEntry(testDir, entry.id, "first-tag")).toBe(true);
      const updated = getEntry(testDir, entry.id);
      expect(updated!.tags).toEqual(["first-tag"]);
    });

    test("adds multiple tags", () => {
      const entry = initAndRecord("Multi tag");

      tagEntry(testDir, entry.id, "tag-a");
      tagEntry(testDir, entry.id, "tag-b");

      const updated = getEntry(testDir, entry.id);
      expect(updated!.tags).toEqual(["tag-a", "tag-b"]);
    });
  });

  describe("untagEntry", () => {
    test("removes a tag from an entry", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "checkpoint",
        message: "Tagged",
        author: AUTHOR,
        tags: ["v1", "release"],
      });

      expect(untagEntry(testDir, entry.id, "v1")).toBe(true);

      const updated = getEntry(testDir, entry.id);
      expect(updated!.tags).toEqual(["release"]);
    });

    test("returns false when tag does not exist on entry", () => {
      const entry = initAndRecord("No such tag");
      expect(untagEntry(testDir, entry.id, "nonexistent")).toBe(false);
    });

    test("returns false for nonexistent entry", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(untagEntry(testDir, "nonexistent", "tag")).toBe(false);
    });

    test("returns false when entry has no tags", () => {
      const entry = initAndRecord("Tagless");
      expect(untagEntry(testDir, entry.id, "any")).toBe(false);
    });
  });

  describe("getSummary", () => {
    test("returns null for uninitialized project", () => {
      expect(getSummary(testDir)).toBeNull();
    });

    test("returns summary for empty log", () => {
      initWorkLog(testDir, PROJECT_ID);

      const summary = getSummary(testDir);
      expect(summary).not.toBeNull();
      expect(summary!.projectId).toBe(PROJECT_ID);
      expect(summary!.totalEntries).toBe(0);
      expect(summary!.branches).toEqual(["main"]);
      expect(summary!.headEntryId).toBeNull();
      expect(summary!.firstEntry).toBeNull();
      expect(summary!.lastEntry).toBeNull();
    });

    test("returns accurate counts and timestamps", () => {
      initAndRecord("Create file", "file-create");
      initAndRecord("Modify file", "file-modify");
      initAndRecord("Create another", "file-create");
      initAndRecord("Build", "build-success");

      const summary = getSummary(testDir);
      expect(summary!.totalEntries).toBe(4);
      expect(summary!.operationCounts["file-create"]).toBe(2);
      expect(summary!.operationCounts["file-modify"]).toBe(1);
      expect(summary!.operationCounts["build-success"]).toBe(1);
      expect(summary!.firstEntry).toBeGreaterThan(0);
      expect(summary!.lastEntry).toBeGreaterThanOrEqual(summary!.firstEntry!);
    });

    test("includes all branches", () => {
      initWorkLog(testDir, PROJECT_ID);
      createBranch(testDir, "develop");
      createBranch(testDir, "feature");

      const summary = getSummary(testDir);
      expect(summary!.branches).toContain("main");
      expect(summary!.branches).toContain("develop");
      expect(summary!.branches).toContain("feature");
    });

    test("reports head entry ID", () => {
      const entry = initAndRecord("Latest");

      const summary = getSummary(testDir);
      expect(summary!.headEntryId).toBe(entry.id);
    });
  });

  describe("formatEntryOneline", () => {
    test("formats entry with no changes", () => {
      const entry = initAndRecord("Test message", "checkpoint");
      const line = formatEntryOneline(entry);

      expect(line).toContain(entry.id.slice(0, 7));
      expect(line).toContain("[checkpoint]");
      expect(line).toContain("Test message");
      expect(line).not.toContain("file");
    });

    test("formats entry with file count", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "ai-generation",
        message: "Generate code",
        author: AUTHOR,
        changes: [
          { path: "a.gd", type: "added" },
          { path: "b.gd", type: "added" },
        ],
      });

      const line = formatEntryOneline(entry);
      expect(line).toContain("(2 files)");
    });

    test("uses singular 'file' for single change", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-create",
        message: "Add one",
        author: AUTHOR,
        changes: [{ path: "single.gd", type: "added" }],
      });

      const line = formatEntryOneline(entry);
      expect(line).toContain("(1 file)");
    });
  });

  describe("formatEntryFull", () => {
    test("includes all metadata", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "ai-generation",
        message: "AI generated player controller",
        author: "game-coder",
        changes: [
          { path: "scripts/player.gd", type: "added" },
          { path: "scenes/main.tscn", type: "modified" },
        ],
        tags: ["v1"],
      });

      const full = formatEntryFull(entry);
      expect(full).toContain(`entry ${entry.id}`);
      expect(full).toContain("Author: game-coder");
      expect(full).toContain("Op:     ai-generation");
      expect(full).toContain("Tags:   v1");
      expect(full).toContain("AI generated player controller");
      expect(full).toContain("+ scripts/player.gd");
      expect(full).toContain("M scenes/main.tscn");
    });

    test("includes parent ID when present", () => {
      initAndRecord("First");
      const second = initAndRecord("Second");

      const full = formatEntryFull(second);
      expect(full).toContain("Parent:");
    });

    test("shows renamed files with arrow", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-rename",
        message: "Rename script",
        author: AUTHOR,
        changes: [{ path: "new_name.gd", type: "renamed", oldPath: "old_name.gd" }],
      });

      const full = formatEntryFull(entry);
      expect(full).toContain("R old_name.gd -> new_name.gd");
    });

    test("shows deleted files with minus prefix", () => {
      initWorkLog(testDir, PROJECT_ID);
      const entry = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "file-delete",
        message: "Remove unused",
        author: AUTHOR,
        changes: [{ path: "old.gd", type: "deleted" }],
      });

      const full = formatEntryFull(entry);
      expect(full).toContain("- old.gd");
    });

    test("omits tags line when no tags", () => {
      const entry = initAndRecord("No tags");
      const full = formatEntryFull(entry);
      expect(full).not.toContain("Tags:");
    });
  });

  describe("destroyWorkLog", () => {
    test("removes entire .worklog directory", () => {
      initWorkLog(testDir, PROJECT_ID);
      initAndRecord("Some entry");

      expect(destroyWorkLog(testDir)).toBe(true);
      expect(existsSync(join(testDir, ".worklog"))).toBe(false);
    });

    test("returns false when no work log exists", () => {
      expect(destroyWorkLog(testDir)).toBe(false);
    });

    test("project directory remains intact after destroy", () => {
      initWorkLog(testDir, PROJECT_ID);
      expect(destroyWorkLog(testDir)).toBe(true);
      expect(existsSync(testDir)).toBe(true);
    });
  });

  describe("integration: full workflow", () => {
    test("init -> record multiple -> branch -> tag -> query -> diff -> destroy", () => {
      expect(initWorkLog(testDir, PROJECT_ID)).toBe(true);
      expect(hasWorkLog(testDir)).toBe(true);

      const e1 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "scene-create",
        message: "Create main scene",
        author: "scene-builder",
        changes: [{ path: "scenes/main.tscn", type: "added" }],
      });

      const e2 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "script-create",
        message: "Add player script",
        author: "game-coder",
        changes: [
          { path: "scripts/player.gd", type: "added", linesAdded: 100 },
          { path: "scenes/main.tscn", type: "modified", linesAdded: 5 },
        ],
      });

      createBranch(testDir, "experiment");
      const e3 = recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "ai-generation",
        message: "Experimental AI feature",
        author: "game-coder",
        branch: "experiment",
      });

      tagEntry(testDir, e1.id, "initial");
      tagEntry(testDir, e2.id, "v0.1");

      const mainLog = getLog(testDir, { branch: "main" });
      expect(mainLog).toHaveLength(2);

      const experimentLog = getLog(testDir, { branch: "experiment" });
      expect(experimentLog).toHaveLength(3);

      const coderLog = getLog(testDir, { author: "game-coder" });
      expect(coderLog).toHaveLength(1);

      const diff = getDiff(testDir, e1.id, e2.id);
      expect(diff.filesAdded).toContain("scripts/player.gd");
      expect(diff.filesModified).toContain("scenes/main.tscn");

      const summary = getSummary(testDir);
      expect(summary!.totalEntries).toBe(3);
      expect(summary!.branches).toHaveLength(2);
      expect(summary!.operationCounts["scene-create"]).toBe(1);
      expect(summary!.operationCounts["script-create"]).toBe(1);
      expect(summary!.operationCounts["ai-generation"]).toBe(1);

      const oneline = formatEntryOneline(e2);
      expect(oneline).toContain("Add player script");
      expect(oneline).toContain("(2 files)");

      expect(destroyWorkLog(testDir)).toBe(true);
      expect(hasWorkLog(testDir)).toBe(false);
    });

    test("build operation tracking lifecycle", () => {
      initWorkLog(testDir, PROJECT_ID);

      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "build-start",
        message: "Starting web build",
        author: "build-system",
        metadata: { platform: "web", preset: "Web" },
      });

      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "build-success",
        message: "Web build completed",
        author: "build-system",
        metadata: { platform: "web", duration: 12500, outputPath: "/exports/web/game.html" },
        tags: ["build-web"],
      });

      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "export-start",
        message: "Starting Windows export",
        author: "build-system",
      });

      recordEntry(testDir, {
        projectId: PROJECT_ID,
        operation: "export-fail",
        message: "Windows export failed: missing templates",
        author: "build-system",
        metadata: { error: "Export templates not found", platform: "windows" },
      });

      const buildLogs = getLog(testDir, {
        operation: ["build-start", "build-success", "build-fail"],
      });
      expect(buildLogs).toHaveLength(2);

      const failedExports = getLog(testDir, { operation: "export-fail" });
      expect(failedExports).toHaveLength(1);
      expect(failedExports[0].metadata).toEqual({
        error: "Export templates not found",
        platform: "windows",
      });

      const summary = getSummary(testDir);
      expect(summary!.operationCounts["build-start"]).toBe(1);
      expect(summary!.operationCounts["build-success"]).toBe(1);
      expect(summary!.operationCounts["export-fail"]).toBe(1);
    });
  });
});
