import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  categorizeFile,
  shouldIgnore,
  scanDirectory,
  initAutoCommit,
  hasAutoCommit,
  getState,
  updateConfig,
  detectChanges,
  generateCommitMessage,
  takeSnapshot,
  createCommit,
  getCommit,
  getHistory,
  addPendingChanges,
  flushPendingChanges,
  shouldCommit,
  startTracking,
  stopTracking,
  getStats,
  pruneCommits,
  formatCommitOneline,
  formatCommitFull,
  destroyAutoCommit,
  type AutoCommitConfig,
  type CommitChange,
} from "./auto-commit";

let testDir: string;
const PROJECT_ID = "test-project-ac";
const AUTHOR = "test-agent";

function makeConfig(overrides?: Partial<AutoCommitConfig>): AutoCommitConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    author: AUTHOR,
    strategy: "immediate",
    ...overrides,
  };
}

function writeTestFile(name: string, content: string): void {
  writeFileSync(join(testDir, name), content, "utf-8");
}

function initAndWriteFiles(): void {
  initAutoCommit(makeConfig());
  takeSnapshot(testDir);
}

beforeEach(() => {
  const id = `ac-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("auto-commit", () => {
  describe("categorizeFile", () => {
    test("categorizes .tscn as scene", () => {
      expect(categorizeFile("main.tscn")).toBe("scene");
    });

    test("categorizes .gd as script", () => {
      expect(categorizeFile("player.gd")).toBe("script");
    });

    test("categorizes .gdshader as shader", () => {
      expect(categorizeFile("water.gdshader")).toBe("shader");
    });

    test("categorizes .png as asset", () => {
      expect(categorizeFile("sprite.png")).toBe("asset");
    });

    test("categorizes .wav as audio", () => {
      expect(categorizeFile("jump.wav")).toBe("audio");
    });

    test("categorizes .cfg as config", () => {
      expect(categorizeFile("project.cfg")).toBe("config");
    });

    test("categorizes .tres as resource", () => {
      expect(categorizeFile("material.tres")).toBe("resource");
    });

    test("categorizes unknown extensions as unknown", () => {
      expect(categorizeFile("data.xyz")).toBe("unknown");
    });

    test("handles paths with directories", () => {
      expect(categorizeFile("scripts/player.gd")).toBe("script");
    });

    test("lowercase extension maps correctly", () => {
      expect(categorizeFile("texture.png")).toBe("asset");
    });

    test("handles uppercase extensions via lowercase normalization", () => {
      expect(categorizeFile("texture.GD")).toBe("script");
    });
  });

  describe("shouldIgnore", () => {
    test("ignores exact directory names", () => {
      expect(shouldIgnore("node_modules/pkg.json", ["node_modules"])).toBe(true);
    });

    test("ignores wildcard extension patterns", () => {
      expect(shouldIgnore("backup.tmp", ["*.tmp"])).toBe(true);
    });

    test("ignores prefix wildcard patterns", () => {
      expect(shouldIgnore("~autosave.gd", ["~*"])).toBe(true);
    });

    test("ignores exact file names", () => {
      expect(shouldIgnore(".git", [".git"])).toBe(true);
    });

    test("does not ignore non-matching paths", () => {
      expect(shouldIgnore("scripts/player.gd", ["node_modules", "*.tmp"])).toBe(false);
    });

    test("ignores nested directory matches", () => {
      expect(shouldIgnore("deep/.godot/cache.bin", [".godot"])).toBe(true);
    });

    test("returns false for empty patterns", () => {
      expect(shouldIgnore("anything.gd", [])).toBe(false);
    });
  });

  describe("scanDirectory", () => {
    test("finds tracked files in directory", () => {
      writeTestFile("player.gd", "extends Node2D");
      writeTestFile("main.tscn", "[gd_scene]");

      const files = scanDirectory(testDir, testDir, [".autocommit"], [".gd", ".tscn"]);
      expect(files.length).toBe(2);
      expect(files.map((f) => f.path).sort()).toEqual(["main.tscn", "player.gd"]);
    });

    test("respects ignore patterns", () => {
      mkdirSync(join(testDir, ".godot"), { recursive: true });
      writeTestFile(".godot/cache.bin", "binary");
      writeTestFile("game.gd", "extends Node");

      const files = scanDirectory(testDir, testDir, [".godot"], [".gd"]);
      expect(files.length).toBe(1);
      expect(files[0].path).toBe("game.gd");
    });

    test("respects track extensions filter", () => {
      writeTestFile("script.gd", "extends Node");
      writeTestFile("readme.md", "# Game");
      writeTestFile("data.xyz", "random");

      const files = scanDirectory(testDir, testDir, [], [".gd"]);
      expect(files.length).toBe(1);
      expect(files[0].path).toBe("script.gd");
    });

    test("scans subdirectories recursively", () => {
      mkdirSync(join(testDir, "scripts"), { recursive: true });
      writeTestFile("scripts/player.gd", "extends CharacterBody2D");

      const files = scanDirectory(testDir, testDir, [], [".gd"]);
      expect(files.length).toBe(1);
      expect(files[0].path).toContain("scripts/player.gd");
    });

    test("computes hash and size for each file", () => {
      writeTestFile("test.gd", "extends Node2D");

      const files = scanDirectory(testDir, testDir, [], [".gd"]);
      expect(files[0].hash).toMatch(/^[a-f0-9]{12}$/);
      expect(files[0].size).toBeGreaterThan(0);
    });

    test("returns empty for nonexistent directory", () => {
      const files = scanDirectory("/nonexistent/path", "/nonexistent", [], []);
      expect(files).toEqual([]);
    });

    test("assigns correct categories", () => {
      writeTestFile("level.tscn", "[gd_scene]");
      writeTestFile("code.gd", "extends Node");

      const files = scanDirectory(testDir, testDir, [], [".tscn", ".gd"]);
      const scene = files.find((f) => f.path === "level.tscn");
      const script = files.find((f) => f.path === "code.gd");

      expect(scene!.category).toBe("scene");
      expect(script!.category).toBe("script");
    });
  });

  describe("initAutoCommit", () => {
    test("creates .autocommit directory structure", () => {
      const result = initAutoCommit(makeConfig());

      expect(result).toBe(true);
      expect(existsSync(join(testDir, ".autocommit"))).toBe(true);
      expect(existsSync(join(testDir, ".autocommit", "commits"))).toBe(true);
      expect(existsSync(join(testDir, ".autocommit", "state.json"))).toBe(true);
      expect(existsSync(join(testDir, ".autocommit", "snapshots.json"))).toBe(true);
      expect(existsSync(join(testDir, ".autocommit", "config.json"))).toBe(true);
    });

    test("returns false if already initialized", () => {
      initAutoCommit(makeConfig());
      const result = initAutoCommit(makeConfig());
      expect(result).toBe(false);
    });

    test("saves config to disk", () => {
      initAutoCommit(makeConfig({ strategy: "batched", batchSize: 10 }));

      const config = JSON.parse(readFileSync(join(testDir, ".autocommit", "config.json"), "utf-8"));
      expect(config.strategy).toBe("batched");
      expect(config.batchSize).toBe(10);
    });

    test("initializes state correctly", () => {
      initAutoCommit(makeConfig());

      const state = JSON.parse(readFileSync(join(testDir, ".autocommit", "state.json"), "utf-8"));
      expect(state.lastCommitId).toBeNull();
      expect(state.lastCommitTime).toBeNull();
      expect(state.totalCommits).toBe(0);
      expect(state.pendingChanges).toEqual([]);
      expect(state.isRunning).toBe(false);
    });
  });

  describe("hasAutoCommit", () => {
    test("returns false for uninitialized project", () => {
      expect(hasAutoCommit(testDir)).toBe(false);
    });

    test("returns true after initialization", () => {
      initAutoCommit(makeConfig());
      expect(hasAutoCommit(testDir)).toBe(true);
    });
  });

  describe("getState", () => {
    test("returns null for uninitialized project", () => {
      expect(getState(testDir)).toBeNull();
    });

    test("returns current state after init", () => {
      initAutoCommit(makeConfig());
      const state = getState(testDir);
      expect(state).not.toBeNull();
      expect(state!.config.projectId).toBe(PROJECT_ID);
      expect(state!.isRunning).toBe(false);
    });
  });

  describe("updateConfig", () => {
    test("updates strategy", () => {
      initAutoCommit(makeConfig());
      const updated = updateConfig(testDir, { strategy: "batched" });
      expect(updated.strategy).toBe("batched");

      const state = getState(testDir);
      expect(state!.config.strategy).toBe("batched");
    });

    test("updates intervalMs", () => {
      initAutoCommit(makeConfig({ strategy: "interval" }));
      const updated = updateConfig(testDir, { intervalMs: 30000 });
      expect(updated.intervalMs).toBe(30000);
    });

    test("throws if not initialized", () => {
      expect(() => updateConfig(testDir, { strategy: "manual" })).toThrow("Auto-commit not initialized");
    });

    test("preserves unmodified fields", () => {
      initAutoCommit(makeConfig({ strategy: "immediate", batchSize: 5 }));
      updateConfig(testDir, { strategy: "batched" });

      const state = getState(testDir);
      expect(state!.config.batchSize).toBe(5);
      expect(state!.config.author).toBe(AUTHOR);
    });
  });

  describe("detectChanges", () => {
    test("detects added files", () => {
      initAndWriteFiles();
      writeTestFile("new_script.gd", "extends Node2D");

      const changes = detectChanges(testDir);
      const added = changes.filter((c) => c.type === "added");
      expect(added.length).toBe(1);
      expect(added[0].path).toBe("new_script.gd");
      expect(added[0].category).toBe("script");
    });

    test("detects modified files", () => {
      writeTestFile("player.gd", "extends Node2D");
      initAndWriteFiles();
      writeTestFile("player.gd", "extends CharacterBody2D\nvar speed = 200");

      const changes = detectChanges(testDir);
      const modified = changes.filter((c) => c.type === "modified");
      expect(modified.length).toBe(1);
      expect(modified[0].path).toBe("player.gd");
    });

    test("detects deleted files", () => {
      writeTestFile("temp.gd", "extends Node");
      initAndWriteFiles();
      rmSync(join(testDir, "temp.gd"));

      const changes = detectChanges(testDir);
      const deleted = changes.filter((c) => c.type === "deleted");
      expect(deleted.length).toBe(1);
      expect(deleted[0].path).toBe("temp.gd");
    });

    test("returns empty array when no changes", () => {
      writeTestFile("stable.gd", "extends Node");
      initAndWriteFiles();

      const changes = detectChanges(testDir);
      expect(changes).toEqual([]);
    });

    test("throws if not initialized", () => {
      expect(() => detectChanges(testDir)).toThrow("Auto-commit not initialized");
    });

    test("detects multiple change types simultaneously", () => {
      writeTestFile("existing.gd", "extends Node");
      writeTestFile("to_delete.gd", "extends Node");
      initAndWriteFiles();

      writeTestFile("existing.gd", "extends Node2D\nvar x = 1");
      writeTestFile("brand_new.gd", "extends Sprite2D");
      rmSync(join(testDir, "to_delete.gd"));

      const changes = detectChanges(testDir);
      expect(changes.filter((c) => c.type === "added").length).toBe(1);
      expect(changes.filter((c) => c.type === "modified").length).toBe(1);
      expect(changes.filter((c) => c.type === "deleted").length).toBe(1);
    });

    test("includes size delta for modified files", () => {
      writeTestFile("grow.gd", "short");
      initAndWriteFiles();
      writeTestFile("grow.gd", "this is much longer content than before");

      const changes = detectChanges(testDir);
      const modified = changes.find((c) => c.type === "modified");
      expect(modified).toBeDefined();
      expect(modified!.sizeDelta).toBeGreaterThan(0);
    });
  });

  describe("generateCommitMessage", () => {
    test("generates message for single added file", () => {
      const msg = generateCommitMessage([
        { path: "player.gd", type: "added", category: "script" },
      ]);
      expect(msg).toBe("Add player.gd");
    });

    test("generates message for multiple added files of same category", () => {
      const msg = generateCommitMessage([
        { path: "a.gd", type: "added", category: "script" },
        { path: "b.gd", type: "added", category: "script" },
      ]);
      expect(msg).toBe("Add 2 script files");
    });

    test("generates message for multiple added files of mixed categories", () => {
      const msg = generateCommitMessage([
        { path: "a.gd", type: "added", category: "script" },
        { path: "b.tscn", type: "added", category: "scene" },
      ]);
      expect(msg).toBe("Add 2 files");
    });

    test("generates message for single modified file", () => {
      const msg = generateCommitMessage([
        { path: "player.gd", type: "modified", category: "script" },
      ]);
      expect(msg).toBe("Update player.gd");
    });

    test("generates message for single deleted file", () => {
      const msg = generateCommitMessage([
        { path: "old.gd", type: "deleted", category: "script" },
      ]);
      expect(msg).toBe("Remove old.gd");
    });

    test("generates combined message for add + modify + delete", () => {
      const msg = generateCommitMessage([
        { path: "new.gd", type: "added", category: "script" },
        { path: "existing.gd", type: "modified", category: "script" },
        { path: "old.gd", type: "deleted", category: "script" },
      ]);
      expect(msg).toContain("Add new.gd");
      expect(msg).toContain("Update existing.gd");
      expect(msg).toContain("Remove old.gd");
    });

    test("returns 'No changes' for empty changes", () => {
      expect(generateCommitMessage([])).toBe("No changes");
    });

    test("generates message for multiple deleted files", () => {
      const msg = generateCommitMessage([
        { path: "a.gd", type: "deleted", category: "script" },
        { path: "b.gd", type: "deleted", category: "script" },
      ]);
      expect(msg).toBe("Remove 2 files");
    });
  });

  describe("takeSnapshot", () => {
    test("captures current file state", () => {
      initAutoCommit(makeConfig());
      writeTestFile("test.gd", "extends Node");

      const snapshots = takeSnapshot(testDir);
      expect(Object.keys(snapshots).length).toBe(1);
      expect(snapshots["test.gd"]).toBeDefined();
      expect(snapshots["test.gd"].hash).toMatch(/^[a-f0-9]{12}$/);
    });

    test("throws if not initialized", () => {
      expect(() => takeSnapshot(testDir)).toThrow("Auto-commit not initialized");
    });

    test("persists snapshots to disk", () => {
      initAutoCommit(makeConfig());
      writeTestFile("data.gd", "var x = 1");
      takeSnapshot(testDir);

      const raw = JSON.parse(readFileSync(join(testDir, ".autocommit", "snapshots.json"), "utf-8"));
      expect(raw["data.gd"]).toBeDefined();
    });
  });

  describe("createCommit", () => {
    test("creates commit from detected changes", () => {
      initAndWriteFiles();
      writeTestFile("new.gd", "extends Node");

      const commit = createCommit(testDir);
      expect(commit).not.toBeNull();
      expect(commit!.id).toMatch(/^[a-f0-9]{12}$/);
      expect(commit!.changes.length).toBe(1);
      expect(commit!.projectId).toBe(PROJECT_ID);
      expect(commit!.author).toBe(AUTHOR);
    });

    test("returns null when no changes", () => {
      writeTestFile("stable.gd", "extends Node");
      initAndWriteFiles();

      const commit = createCommit(testDir);
      expect(commit).toBeNull();
    });

    test("generates auto message", () => {
      initAndWriteFiles();
      writeTestFile("player.gd", "extends CharacterBody2D");

      const commit = createCommit(testDir);
      expect(commit!.message).toBe("Add player.gd");
    });

    test("uses custom message when provided", () => {
      initAndWriteFiles();
      writeTestFile("test.gd", "extends Node");

      const commit = createCommit(testDir, { message: "Custom commit message" });
      expect(commit!.message).toBe("Custom commit message");
    });

    test("chains commits with parentId", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "extends Node");
      const first = createCommit(testDir)!;

      writeTestFile("b.gd", "extends Node");
      const second = createCommit(testDir)!;

      expect(first.parentId).toBeNull();
      expect(second.parentId).toBe(first.id);
    });

    test("updates state after commit", () => {
      initAndWriteFiles();
      writeTestFile("file.gd", "extends Node");
      const commit = createCommit(testDir)!;

      const state = getState(testDir);
      expect(state!.lastCommitId).toBe(commit.id);
      expect(state!.totalCommits).toBe(1);
      expect(state!.lastCommitTime).toBeGreaterThan(0);
    });

    test("persists commit to disk", () => {
      initAndWriteFiles();
      writeTestFile("test.gd", "extends Node");
      const commit = createCommit(testDir)!;

      const commitPath = join(testDir, ".autocommit", "commits", `${commit.id}.json`);
      expect(existsSync(commitPath)).toBe(true);
    });

    test("accepts custom changes", () => {
      initAutoCommit(makeConfig());
      const changes: CommitChange[] = [
        { path: "manual.gd", type: "added", category: "script" },
      ];

      const commit = createCommit(testDir, { changes });
      expect(commit).not.toBeNull();
      expect(commit!.changes).toEqual(changes);
    });

    test("throws if not initialized", () => {
      expect(() => createCommit(testDir)).toThrow("Auto-commit not initialized");
    });

    test("includes tags and metadata", () => {
      initAndWriteFiles();
      writeTestFile("tagged.gd", "extends Node");

      const commit = createCommit(testDir, {
        tags: ["v1", "release"],
        metadata: { tool: "auto-commit" },
      });

      expect(commit!.tags).toEqual(["v1", "release"]);
      expect(commit!.metadata).toEqual({ tool: "auto-commit" });
    });

    test("records strategy from config", () => {
      initAutoCommit(makeConfig({ strategy: "batched" }));
      takeSnapshot(testDir);
      writeTestFile("file.gd", "extends Node");

      const commit = createCommit(testDir)!;
      expect(commit.strategy).toBe("batched");
    });

    test("updates snapshots after commit so next detect is clean", () => {
      initAndWriteFiles();
      writeTestFile("new.gd", "extends Node");
      createCommit(testDir);

      const nextChanges = detectChanges(testDir);
      expect(nextChanges).toEqual([]);
    });

    test("enforces maxCommits when set", () => {
      initAutoCommit(makeConfig({ maxCommits: 2 }));
      takeSnapshot(testDir);

      writeTestFile("a.gd", "extends Node");
      createCommit(testDir);
      writeTestFile("b.gd", "extends Node");
      createCommit(testDir);
      writeTestFile("c.gd", "extends Node");
      createCommit(testDir);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(2);
    });
  });

  describe("getCommit", () => {
    test("retrieves a stored commit", () => {
      initAndWriteFiles();
      writeTestFile("test.gd", "extends Node");
      const original = createCommit(testDir)!;

      const retrieved = getCommit(testDir, original.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(original.id);
      expect(retrieved!.message).toBe(original.message);
    });

    test("returns null for nonexistent commit", () => {
      initAutoCommit(makeConfig());
      expect(getCommit(testDir, "nonexistent")).toBeNull();
    });
  });

  describe("getHistory", () => {
    test("returns empty for no commits", () => {
      initAutoCommit(makeConfig());
      const history = getHistory(testDir);
      expect(history.commits).toEqual([]);
      expect(history.totalCount).toBe(0);
    });

    test("returns commits newest-first", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "extends Node");
      const c1 = createCommit(testDir)!;
      writeTestFile("b.gd", "extends Node");
      const c2 = createCommit(testDir)!;

      const history = getHistory(testDir);
      expect(history.commits[0].id).toBe(c2.id);
      expect(history.commits[1].id).toBe(c1.id);
    });

    test("filters by author", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "extends Node");
      createCommit(testDir, { author: "alice" });
      writeTestFile("b.gd", "extends Node");
      createCommit(testDir, { author: "bob" });

      const history = getHistory(testDir, { author: "alice" });
      expect(history.totalCount).toBe(1);
      expect(history.commits[0].author).toBe("alice");
    });

    test("filters by search text", () => {
      initAndWriteFiles();
      writeTestFile("player.gd", "extends Node");
      createCommit(testDir, { message: "Add player logic" });
      writeTestFile("enemy.gd", "extends Node");
      createCommit(testDir, { message: "Add enemy AI" });

      const history = getHistory(testDir, { search: "player" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by category", () => {
      initAutoCommit(makeConfig());
      takeSnapshot(testDir);

      writeTestFile("scene.tscn", "[gd_scene]");
      createCommit(testDir);
      writeTestFile("code.gd", "extends Node");
      createCommit(testDir);

      const history = getHistory(testDir, { category: "scene" });
      expect(history.totalCount).toBe(1);
    });

    test("applies limit and offset", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "a");
      createCommit(testDir);
      writeTestFile("b.gd", "b");
      createCommit(testDir);
      writeTestFile("c.gd", "c");
      createCommit(testDir);

      const page = getHistory(testDir, { limit: 1, offset: 1 });
      expect(page.commits.length).toBe(1);
      expect(page.totalCount).toBe(3);
    });

    test("returns empty for uninitialized project", () => {
      const history = getHistory(testDir);
      expect(history.commits).toEqual([]);
    });

    test("filters by since timestamp", async () => {
      initAndWriteFiles();
      writeTestFile("old.gd", "extends Node");
      createCommit(testDir);

      await Bun.sleep(5);
      const cutoff = Date.now();

      await Bun.sleep(5);
      writeTestFile("new.gd", "extends Node");
      const c2 = createCommit(testDir)!;

      const history = getHistory(testDir, { since: cutoff });
      expect(history.totalCount).toBe(1);
      expect(history.commits[0].id).toBe(c2.id);
    });

    test("filters by until timestamp excludes later", () => {
      initAndWriteFiles();
      writeTestFile("first.gd", "extends Node");
      const c1 = createCommit(testDir)!;

      writeTestFile("second.gd", "extends Node");
      const c2 = createCommit(testDir)!;

      const beforeSecond = c2.timestamp - 1;
      const history = getHistory(testDir, { until: beforeSecond });
      expect(history.commits.every((c) => c.timestamp <= beforeSecond)).toBe(true);
    });
  });

  describe("addPendingChanges", () => {
    test("adds detected changes to pending list", () => {
      initAndWriteFiles();
      writeTestFile("pending.gd", "extends Node");

      const pending = addPendingChanges(testDir);
      expect(pending.length).toBeGreaterThan(0);

      const state = getState(testDir);
      expect(state!.pendingChanges.length).toBeGreaterThan(0);
    });

    test("accumulates multiple rounds of changes", () => {
      initAndWriteFiles();

      const changes1: CommitChange[] = [
        { path: "a.gd", type: "added", category: "script" },
      ];
      addPendingChanges(testDir, changes1);

      const changes2: CommitChange[] = [
        { path: "b.gd", type: "added", category: "script" },
      ];
      const all = addPendingChanges(testDir, changes2);
      expect(all.length).toBe(2);
    });

    test("throws if not initialized", () => {
      expect(() => addPendingChanges(testDir)).toThrow("Auto-commit not initialized");
    });
  });

  describe("flushPendingChanges", () => {
    test("creates commit from pending changes", () => {
      initAutoCommit(makeConfig({ strategy: "batched" }));
      takeSnapshot(testDir);

      addPendingChanges(testDir, [
        { path: "a.gd", type: "added", category: "script" },
        { path: "b.gd", type: "added", category: "script" },
      ]);

      const commit = flushPendingChanges(testDir);
      expect(commit).not.toBeNull();
      expect(commit!.changes.length).toBe(2);
    });

    test("returns null when no pending changes", () => {
      initAutoCommit(makeConfig());
      const commit = flushPendingChanges(testDir);
      expect(commit).toBeNull();
    });

    test("clears pending changes after flush", () => {
      initAutoCommit(makeConfig());
      takeSnapshot(testDir);

      addPendingChanges(testDir, [
        { path: "test.gd", type: "added", category: "script" },
      ]);
      flushPendingChanges(testDir);

      const state = getState(testDir);
      expect(state!.pendingChanges).toEqual([]);
    });

    test("accepts custom message", () => {
      initAutoCommit(makeConfig());
      takeSnapshot(testDir);

      addPendingChanges(testDir, [
        { path: "test.gd", type: "added", category: "script" },
      ]);
      const commit = flushPendingChanges(testDir, { message: "Batch flush" });
      expect(commit!.message).toBe("Batch flush");
    });

    test("throws if not initialized", () => {
      expect(() => flushPendingChanges(testDir)).toThrow("Auto-commit not initialized");
    });
  });

  describe("shouldCommit", () => {
    test("returns true for immediate strategy", () => {
      initAutoCommit(makeConfig({ strategy: "immediate" }));
      expect(shouldCommit(testDir)).toBe(true);
    });

    test("returns false for manual strategy", () => {
      initAutoCommit(makeConfig({ strategy: "manual" }));
      expect(shouldCommit(testDir)).toBe(false);
    });

    test("returns true for batched when threshold reached", () => {
      initAutoCommit(makeConfig({ strategy: "batched", batchSize: 2 }));
      addPendingChanges(testDir, [
        { path: "a.gd", type: "added", category: "script" },
        { path: "b.gd", type: "added", category: "script" },
      ]);
      expect(shouldCommit(testDir)).toBe(true);
    });

    test("returns false for batched when below threshold", () => {
      initAutoCommit(makeConfig({ strategy: "batched", batchSize: 5 }));
      addPendingChanges(testDir, [
        { path: "a.gd", type: "added", category: "script" },
      ]);
      expect(shouldCommit(testDir)).toBe(false);
    });

    test("returns true for interval when enough time passed", async () => {
      initAutoCommit(makeConfig({ strategy: "interval", intervalMs: 5 }));
      takeSnapshot(testDir);
      writeTestFile("file.gd", "extends Node");
      createCommit(testDir);

      await Bun.sleep(10);
      expect(shouldCommit(testDir)).toBe(true);
    });

    test("returns true for interval on first commit (no previous time)", () => {
      initAutoCommit(makeConfig({ strategy: "interval", intervalMs: 60000 }));
      expect(shouldCommit(testDir)).toBe(true);
    });

    test("returns false for uninitialized project", () => {
      expect(shouldCommit(testDir)).toBe(false);
    });
  });

  describe("startTracking / stopTracking", () => {
    test("starts tracking and sets isRunning", () => {
      initAutoCommit(makeConfig());
      expect(startTracking(testDir)).toBe(true);

      const state = getState(testDir);
      expect(state!.isRunning).toBe(true);
    });

    test("returns false if already running", () => {
      initAutoCommit(makeConfig());
      startTracking(testDir);
      expect(startTracking(testDir)).toBe(false);
    });

    test("stops tracking and clears isRunning", () => {
      initAutoCommit(makeConfig());
      startTracking(testDir);
      expect(stopTracking(testDir)).toBe(true);

      const state = getState(testDir);
      expect(state!.isRunning).toBe(false);
    });

    test("returns false if not running", () => {
      initAutoCommit(makeConfig());
      expect(stopTracking(testDir)).toBe(false);
    });

    test("start throws if not initialized", () => {
      expect(() => startTracking(testDir)).toThrow("Auto-commit not initialized");
    });

    test("stop throws if not initialized", () => {
      expect(() => stopTracking(testDir)).toThrow("Auto-commit not initialized");
    });

    test("takes initial snapshot on start", () => {
      initAutoCommit(makeConfig());
      writeTestFile("existing.gd", "extends Node");
      startTracking(testDir);

      const snapshots = JSON.parse(readFileSync(join(testDir, ".autocommit", "snapshots.json"), "utf-8"));
      expect(snapshots["existing.gd"]).toBeDefined();
    });
  });

  describe("getStats", () => {
    test("returns null for uninitialized project", () => {
      expect(getStats(testDir)).toBeNull();
    });

    test("returns zero stats for empty history", () => {
      initAutoCommit(makeConfig());
      const stats = getStats(testDir);

      expect(stats).not.toBeNull();
      expect(stats!.totalCommits).toBe(0);
      expect(stats!.totalChanges).toBe(0);
      expect(stats!.averageChangesPerCommit).toBe(0);
    });

    test("computes accurate stats", () => {
      initAndWriteFiles();

      writeTestFile("a.gd", "extends Node");
      writeTestFile("b.tscn", "[gd_scene]");
      createCommit(testDir);

      writeTestFile("c.gd", "extends Node2D");
      createCommit(testDir);

      const stats = getStats(testDir);
      expect(stats!.totalCommits).toBe(2);
      expect(stats!.totalChanges).toBe(3);
      expect(stats!.filesAdded).toBe(3);
      expect(stats!.categoryCounts["script"]).toBe(2);
      expect(stats!.categoryCounts["scene"]).toBe(1);
      expect(stats!.firstCommit).toBeGreaterThan(0);
      expect(stats!.lastCommit).toBeGreaterThanOrEqual(stats!.firstCommit!);
      expect(stats!.averageChangesPerCommit).toBe(1.5);
    });

    test("counts deleted and modified files", () => {
      writeTestFile("existing.gd", "old content");
      initAndWriteFiles();

      writeTestFile("existing.gd", "new content updated");
      createCommit(testDir);

      const stats = getStats(testDir);
      expect(stats!.filesModified).toBe(1);
    });
  });

  describe("pruneCommits", () => {
    test("removes old commits beyond keepCount", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "a");
      createCommit(testDir);
      writeTestFile("b.gd", "b");
      createCommit(testDir);
      writeTestFile("c.gd", "c");
      createCommit(testDir);

      const deleted = pruneCommits(testDir, 2);
      expect(deleted).toBe(1);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(2);
    });

    test("does nothing when within limit", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "a");
      createCommit(testDir);

      const deleted = pruneCommits(testDir, 10);
      expect(deleted).toBe(0);
    });

    test("sets oldest kept commit parentId to null", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "a");
      createCommit(testDir);
      writeTestFile("b.gd", "b");
      createCommit(testDir);
      writeTestFile("c.gd", "c");
      createCommit(testDir);

      pruneCommits(testDir, 2);

      const history = getHistory(testDir);
      const oldest = history.commits[history.commits.length - 1];
      expect(oldest.parentId).toBeNull();
    });
  });

  describe("formatCommitOneline", () => {
    test("formats with short ID and message", () => {
      initAndWriteFiles();
      writeTestFile("test.gd", "extends Node");
      const commit = createCommit(testDir)!;

      const line = formatCommitOneline(commit);
      expect(line).toContain(commit.id.slice(0, 7));
      expect(line).toContain(commit.message);
    });

    test("includes change count", () => {
      initAutoCommit(makeConfig());
      takeSnapshot(testDir);
      writeTestFile("a.gd", "a");
      writeTestFile("b.gd", "b");
      const commit = createCommit(testDir)!;

      const line = formatCommitOneline(commit);
      expect(line).toContain("(2 changes)");
    });

    test("uses singular for single change", () => {
      initAndWriteFiles();
      writeTestFile("one.gd", "extends Node");
      const commit = createCommit(testDir)!;

      const line = formatCommitOneline(commit);
      expect(line).toContain("(1 change)");
    });

    test("omits change count when zero", () => {
      const commit = {
        id: "abcdef123456",
        projectId: PROJECT_ID,
        timestamp: Date.now(),
        message: "Empty commit",
        author: AUTHOR,
        changes: [],
        strategy: "manual" as const,
        parentId: null,
      };

      const line = formatCommitOneline(commit);
      expect(line).not.toContain("change");
    });
  });

  describe("formatCommitFull", () => {
    test("includes all commit details", () => {
      initAndWriteFiles();
      writeTestFile("player.gd", "extends CharacterBody2D");
      const commit = createCommit(testDir, {
        tags: ["v1"],
        metadata: { tool: "test" },
      })!;

      const full = formatCommitFull(commit);
      expect(full).toContain(`commit ${commit.id}`);
      expect(full).toContain(`Author:   ${AUTHOR}`);
      expect(full).toContain("Strategy: immediate");
      expect(full).toContain("Tags:     v1");
      expect(full).toContain(commit.message);
      expect(full).toContain("+ [script] player.gd");
    });

    test("includes parent when present", () => {
      initAndWriteFiles();
      writeTestFile("a.gd", "a");
      createCommit(testDir);
      writeTestFile("b.gd", "b");
      const second = createCommit(testDir)!;

      const full = formatCommitFull(second);
      expect(full).toContain("Parent:");
    });

    test("shows deleted files with minus prefix", () => {
      const commit = {
        id: "abcdef123456",
        projectId: PROJECT_ID,
        timestamp: Date.now(),
        message: "Remove file",
        author: AUTHOR,
        changes: [{ path: "old.gd", type: "deleted" as const, category: "script" as const }],
        strategy: "manual" as const,
        parentId: null,
      };

      const full = formatCommitFull(commit);
      expect(full).toContain("- [script] old.gd");
    });

    test("shows modified files with M prefix", () => {
      const commit = {
        id: "abcdef123456",
        projectId: PROJECT_ID,
        timestamp: Date.now(),
        message: "Modify file",
        author: AUTHOR,
        changes: [{ path: "code.gd", type: "modified" as const, category: "script" as const, sizeDelta: 42 }],
        strategy: "manual" as const,
        parentId: null,
      };

      const full = formatCommitFull(commit);
      expect(full).toContain("M [script] code.gd (+42B)");
    });

    test("omits tags line when no tags", () => {
      initAndWriteFiles();
      writeTestFile("notag.gd", "extends Node");
      const commit = createCommit(testDir)!;

      const full = formatCommitFull(commit);
      expect(full).not.toContain("Tags:");
    });
  });

  describe("destroyAutoCommit", () => {
    test("removes entire .autocommit directory", () => {
      initAutoCommit(makeConfig());
      expect(destroyAutoCommit(testDir)).toBe(true);
      expect(existsSync(join(testDir, ".autocommit"))).toBe(false);
    });

    test("returns false when not initialized", () => {
      expect(destroyAutoCommit(testDir)).toBe(false);
    });

    test("project directory remains intact", () => {
      initAutoCommit(makeConfig());
      destroyAutoCommit(testDir);
      expect(existsSync(testDir)).toBe(true);
    });
  });

  describe("integration: full workflow", () => {
    test("init -> track -> commit -> query -> stats -> destroy", () => {
      expect(initAutoCommit(makeConfig())).toBe(true);
      expect(hasAutoCommit(testDir)).toBe(true);

      expect(startTracking(testDir)).toBe(true);

      mkdirSync(join(testDir, "scenes"), { recursive: true });
      mkdirSync(join(testDir, "scripts"), { recursive: true });
      writeTestFile("scenes/main.tscn", "[gd_scene format=3]");
      writeTestFile("scripts/player.gd", "extends CharacterBody2D\nvar speed = 200");

      const c1 = createCommit(testDir, { tags: ["initial"] });
      expect(c1).not.toBeNull();
      expect(c1!.changes.length).toBeGreaterThan(0);

      writeTestFile("scripts/player.gd", "extends CharacterBody2D\nvar speed = 300\nvar health = 100");
      const c2 = createCommit(testDir);
      expect(c2).not.toBeNull();
      expect(c2!.parentId).toBe(c1!.id);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(2);
      expect(history.commits[0].id).toBe(c2!.id);

      const stats = getStats(testDir);
      expect(stats!.totalCommits).toBe(2);
      expect(stats!.firstCommit).toBeGreaterThan(0);

      expect(stopTracking(testDir)).toBe(true);
      expect(destroyAutoCommit(testDir)).toBe(true);
      expect(hasAutoCommit(testDir)).toBe(false);
    });

    test("batched strategy workflow", () => {
      initAutoCommit(makeConfig({ strategy: "batched", batchSize: 3 }));
      takeSnapshot(testDir);

      addPendingChanges(testDir, [
        { path: "a.gd", type: "added", category: "script" },
      ]);
      expect(shouldCommit(testDir)).toBe(false);

      addPendingChanges(testDir, [
        { path: "b.gd", type: "added", category: "script" },
      ]);
      expect(shouldCommit(testDir)).toBe(false);

      addPendingChanges(testDir, [
        { path: "c.gd", type: "added", category: "script" },
      ]);
      expect(shouldCommit(testDir)).toBe(true);

      const commit = flushPendingChanges(testDir);
      expect(commit).not.toBeNull();
      expect(commit!.changes.length).toBe(3);

      const state = getState(testDir);
      expect(state!.pendingChanges).toEqual([]);
      expect(state!.totalCommits).toBe(1);
    });

    test("config update mid-session", () => {
      initAutoCommit(makeConfig({ strategy: "manual" }));
      expect(shouldCommit(testDir)).toBe(false);

      updateConfig(testDir, { strategy: "immediate" });
      expect(shouldCommit(testDir)).toBe(true);

      const state = getState(testDir);
      expect(state!.config.strategy).toBe("immediate");
    });
  });
});
