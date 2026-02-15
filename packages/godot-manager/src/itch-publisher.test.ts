import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  type ItchPublishConfig,
  type ItchChannel,
  type ItchChannelConfig,
  type PublishRun,
  type PublishOptions,
  getDefaultChannels,
  getDefaultChannelNames,
  parseItchTarget,
  formatItchTarget,
  validatePublishConfig,
  initPublisher,
  hasPublisher,
  getState,
  updateConfig,
  getEnabledChannels,
  setChannelEnabled,
  addChannel,
  removeChannel,
  buildPushArgs,
  executePublish,
  cancelPublish,
  getRun,
  getHistory,
  getStats,
  getChannelResult,
  isRunSuccessful,
  getFailedChannels,
  getSucceededChannels,
  pruneRuns,
  formatRunOneline,
  formatRunFull,
  generatePublishSummary,
  destroyPublisher,
} from "./itch-publisher";

let testDir: string;
const PROJECT_ID = "test-itch-project";
const ITCH_TARGET = "testuser/testgame";

function makeConfig(overrides?: Partial<ItchPublishConfig>): ItchPublishConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    itchTarget: ITCH_TARGET,
    channels: getDefaultChannels(),
    butlerPath: "butler",
    ifChanged: false,
    fixPermissions: true,
    pushTimeout: 300_000,
    publishRetention: 0,
    ...overrides,
  };
}

function initDefault(overrides?: Partial<ItchPublishConfig>): void {
  initPublisher(makeConfig(overrides));
}

beforeEach(() => {
  const id = `itch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("itch-publisher", () => {
  // ─── getDefaultChannels ───────────────────────────────────────────────

  describe("getDefaultChannels", () => {
    test("returns four channels", () => {
      expect(getDefaultChannels()).toHaveLength(4);
    });

    test("all defaults are enabled", () => {
      for (const c of getDefaultChannels()) {
        expect(c.enabled).toBe(true);
      }
    });

    test("includes windows channel", () => {
      expect(getDefaultChannels().some((c) => c.channel === "windows")).toBe(true);
    });

    test("includes linux channel", () => {
      expect(getDefaultChannels().some((c) => c.channel === "linux")).toBe(true);
    });

    test("includes macos channel", () => {
      expect(getDefaultChannels().some((c) => c.channel === "macos")).toBe(true);
    });

    test("includes web channel", () => {
      expect(getDefaultChannels().some((c) => c.channel === "web")).toBe(true);
    });

    test("each channel has a directory", () => {
      for (const c of getDefaultChannels()) {
        expect(c.directory.length).toBeGreaterThan(0);
      }
    });

    test("each channel has tags", () => {
      for (const c of getDefaultChannels()) {
        expect(c.tags).toBeDefined();
        expect(c.tags!.length).toBeGreaterThan(0);
      }
    });

    test("returns a new array each call", () => {
      const a = getDefaultChannels();
      const b = getDefaultChannels();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── getDefaultChannelNames ───────────────────────────────────────────

  describe("getDefaultChannelNames", () => {
    test("returns four names", () => {
      expect(getDefaultChannelNames()).toHaveLength(4);
    });

    test("includes all expected channels", () => {
      const names = getDefaultChannelNames();
      expect(names).toContain("windows");
      expect(names).toContain("linux");
      expect(names).toContain("macos");
      expect(names).toContain("web");
    });

    test("returns a new array each call", () => {
      const a = getDefaultChannelNames();
      const b = getDefaultChannelNames();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── parseItchTarget ─────────────────────────────────────────────────

  describe("parseItchTarget", () => {
    test("parses user/game", () => {
      const result = parseItchTarget("myuser/mygame");
      expect(result).toEqual({ user: "myuser", game: "mygame" });
    });

    test("parses user/game:channel", () => {
      const result = parseItchTarget("myuser/mygame:windows");
      expect(result).toEqual({ user: "myuser", game: "mygame", channel: "windows" });
    });

    test("returns null for empty string", () => {
      expect(parseItchTarget("")).toBeNull();
    });

    test("returns null for missing slash", () => {
      expect(parseItchTarget("noslash")).toBeNull();
    });

    test("returns null for empty user", () => {
      expect(parseItchTarget("/game")).toBeNull();
    });

    test("returns null for empty game", () => {
      expect(parseItchTarget("user/")).toBeNull();
    });

    test("returns null for too many slashes", () => {
      expect(parseItchTarget("a/b/c")).toBeNull();
    });

    test("channel can contain dashes", () => {
      const result = parseItchTarget("user/game:windows-beta");
      expect(result?.channel).toBe("windows-beta");
    });

    test("channel is undefined without colon", () => {
      const result = parseItchTarget("user/game");
      expect(result?.channel).toBeUndefined();
    });
  });

  // ─── formatItchTarget ────────────────────────────────────────────────

  describe("formatItchTarget", () => {
    test("formats user/game without channel", () => {
      expect(formatItchTarget("user", "game")).toBe("user/game");
    });

    test("formats user/game:channel", () => {
      expect(formatItchTarget("user", "game", "windows")).toBe("user/game:windows");
    });

    test("undefined channel omits colon", () => {
      expect(formatItchTarget("user", "game", undefined)).toBe("user/game");
    });
  });

  // ─── validatePublishConfig ────────────────────────────────────────────

  describe("validatePublishConfig", () => {
    test("valid config passes validation", () => {
      const result = validatePublishConfig(makeConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("missing projectId is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), projectId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectId"))).toBe(true);
    });

    test("missing projectPath is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), projectPath: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectPath"))).toBe(true);
    });

    test("missing itchTarget is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), itchTarget: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("itchTarget"))).toBe(true);
    });

    test("malformed itchTarget is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), itchTarget: "noslash" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("user/game"))).toBe(true);
    });

    test("empty channels array is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), channels: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("At least one channel"))).toBe(true);
    });

    test("duplicate channels is an error", () => {
      const channels = [
        { channel: "windows", directory: "a", enabled: true },
        { channel: "windows", directory: "b", enabled: true },
      ];
      const result = validatePublishConfig({ ...makeConfig(), channels });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    test("empty channel name is an error", () => {
      const channels = [{ channel: "", directory: "a", enabled: true }];
      const result = validatePublishConfig({ ...makeConfig(), channels });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    test("empty channel directory is an error", () => {
      const channels = [{ channel: "win", directory: "", enabled: true }];
      const result = validatePublishConfig({ ...makeConfig(), channels });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("directory"))).toBe(true);
    });

    test("no enabled channels is a warning", () => {
      const channels = getDefaultChannels().map((c) => ({ ...c, enabled: false }));
      const result = validatePublishConfig({ ...makeConfig(), channels });
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("enabled"))).toBe(true);
    });

    test("negative pushTimeout is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), pushTimeout: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("pushTimeout"))).toBe(true);
    });

    test("zero pushTimeout is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), pushTimeout: 0 });
      expect(result.valid).toBe(false);
    });

    test("negative publishRetention is an error", () => {
      const result = validatePublishConfig({ ...makeConfig(), publishRetention: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("publishRetention"))).toBe(true);
    });

    test("zero publishRetention is valid", () => {
      const result = validatePublishConfig(makeConfig({ publishRetention: 0 }));
      expect(result.valid).toBe(true);
    });
  });

  // ─── initPublisher / hasPublisher ─────────────────────────────────────

  describe("initPublisher", () => {
    test("returns true on first init", () => {
      expect(initPublisher(makeConfig())).toBe(true);
    });

    test("returns false on second init", () => {
      initDefault();
      expect(initPublisher(makeConfig())).toBe(false);
    });

    test("creates .itch-publisher directory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".itch-publisher"))).toBe(true);
    });

    test("creates runs subdirectory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".itch-publisher", "runs"))).toBe(true);
    });

    test("creates state.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".itch-publisher", "state.json"))).toBe(true);
    });

    test("creates config.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".itch-publisher", "config.json"))).toBe(true);
    });

    test("state has correct projectId", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });

    test("state starts with zero runs", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.totalRuns).toBe(0);
    });

    test("state starts not running", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.isRunning).toBe(false);
    });

    test("state has no last run", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.lastRunId).toBeNull();
      expect(state!.lastRunTime).toBeNull();
    });

    test("state has timestamps", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.createdAt).toBeGreaterThan(0);
      expect(state!.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("hasPublisher", () => {
    test("returns false before init", () => {
      expect(hasPublisher(testDir)).toBe(false);
    });

    test("returns true after init", () => {
      initDefault();
      expect(hasPublisher(testDir)).toBe(true);
    });

    test("returns false after destroy", () => {
      initDefault();
      destroyPublisher(testDir);
      expect(hasPublisher(testDir)).toBe(false);
    });
  });

  // ─── getState ─────────────────────────────────────────────────────────

  describe("getState", () => {
    test("returns null before init", () => {
      expect(getState(testDir)).toBeNull();
    });

    test("returns state after init", () => {
      initDefault();
      expect(getState(testDir)).not.toBeNull();
    });

    test("state config matches init config", () => {
      initDefault();
      const state = getState(testDir);
      expect(state!.config.itchTarget).toBe(ITCH_TARGET);
    });
  });

  // ─── updateConfig ─────────────────────────────────────────────────────

  describe("updateConfig", () => {
    test("throws if not initialized", () => {
      expect(() => updateConfig(testDir, {})).toThrow("not initialized");
    });

    test("updates itchTarget", () => {
      initDefault();
      const updated = updateConfig(testDir, { itchTarget: "newuser/newgame" });
      expect(updated.itchTarget).toBe("newuser/newgame");
    });

    test("persists to state", () => {
      initDefault();
      updateConfig(testDir, { itchTarget: "newuser/newgame" });
      const state = getState(testDir);
      expect(state!.config.itchTarget).toBe("newuser/newgame");
    });

    test("persists to config.json", () => {
      initDefault();
      updateConfig(testDir, { userVersion: "1.2.3" });
      const raw = JSON.parse(readFileSync(join(testDir, ".itch-publisher", "config.json"), "utf-8"));
      expect(raw.userVersion).toBe("1.2.3");
    });

    test("updates updatedAt", () => {
      initDefault();
      const before = getState(testDir)!.updatedAt;
      updateConfig(testDir, { ifChanged: true });
      const after = getState(testDir)!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("preserves unmodified fields", () => {
      initDefault();
      updateConfig(testDir, { ifChanged: true });
      const state = getState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
      expect(state!.config.butlerPath).toBe("butler");
    });
  });

  // ─── getEnabledChannels ───────────────────────────────────────────────

  describe("getEnabledChannels", () => {
    test("returns empty for uninitialized", () => {
      expect(getEnabledChannels(testDir)).toHaveLength(0);
    });

    test("returns all four by default", () => {
      initDefault();
      expect(getEnabledChannels(testDir)).toHaveLength(4);
    });

    test("excludes disabled channels", () => {
      initDefault();
      setChannelEnabled(testDir, "windows", false);
      expect(getEnabledChannels(testDir)).toHaveLength(3);
      expect(getEnabledChannels(testDir).some((c) => c.channel === "windows")).toBe(false);
    });
  });

  // ─── setChannelEnabled ────────────────────────────────────────────────

  describe("setChannelEnabled", () => {
    test("throws if not initialized", () => {
      expect(() => setChannelEnabled(testDir, "windows", false)).toThrow("not initialized");
    });

    test("disables a channel", () => {
      initDefault();
      const result = setChannelEnabled(testDir, "windows", false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    test("enables a channel", () => {
      initDefault();
      setChannelEnabled(testDir, "windows", false);
      const result = setChannelEnabled(testDir, "windows", true);
      expect(result!.enabled).toBe(true);
    });

    test("returns null for unknown channel", () => {
      initDefault();
      expect(setChannelEnabled(testDir, "nonexistent", false)).toBeNull();
    });

    test("persists change", () => {
      initDefault();
      setChannelEnabled(testDir, "linux", false);
      const state = getState(testDir);
      const linux = state!.config.channels.find((c) => c.channel === "linux");
      expect(linux!.enabled).toBe(false);
    });
  });

  // ─── addChannel ───────────────────────────────────────────────────────

  describe("addChannel", () => {
    test("throws if not initialized", () => {
      expect(() => addChannel(testDir, { channel: "android", directory: "exports/android", enabled: true })).toThrow("not initialized");
    });

    test("adds a new channel", () => {
      initDefault();
      const result = addChannel(testDir, { channel: "android", directory: "exports/android", enabled: true });
      expect(result).toBe(true);
    });

    test("returns false for duplicate", () => {
      initDefault();
      expect(addChannel(testDir, { channel: "windows", directory: "x", enabled: true })).toBe(false);
    });

    test("persists added channel", () => {
      initDefault();
      addChannel(testDir, { channel: "android", directory: "exports/android", enabled: true });
      const state = getState(testDir);
      expect(state!.config.channels.some((c) => c.channel === "android")).toBe(true);
    });

    test("increases channel count", () => {
      initDefault();
      addChannel(testDir, { channel: "android", directory: "exports/android", enabled: true });
      expect(getState(testDir)!.config.channels).toHaveLength(5);
    });
  });

  // ─── removeChannel ────────────────────────────────────────────────────

  describe("removeChannel", () => {
    test("throws if not initialized", () => {
      expect(() => removeChannel(testDir, "windows")).toThrow("not initialized");
    });

    test("removes existing channel", () => {
      initDefault();
      expect(removeChannel(testDir, "windows")).toBe(true);
    });

    test("returns false for unknown channel", () => {
      initDefault();
      expect(removeChannel(testDir, "nonexistent")).toBe(false);
    });

    test("persists removal", () => {
      initDefault();
      removeChannel(testDir, "windows");
      const state = getState(testDir);
      expect(state!.config.channels.some((c) => c.channel === "windows")).toBe(false);
    });

    test("decreases channel count", () => {
      initDefault();
      removeChannel(testDir, "windows");
      expect(getState(testDir)!.config.channels).toHaveLength(3);
    });
  });

  // ─── buildPushArgs ────────────────────────────────────────────────────

  describe("buildPushArgs", () => {
    test("basic push args include push command, directory, and target", () => {
      const config = makeConfig();
      const channelConfig: ItchChannelConfig = { channel: "windows", directory: "exports/windows", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args[0]).toBe("push");
      expect(args).toContain(`${ITCH_TARGET}:windows`);
    });

    test("includes --fix-permissions when enabled", () => {
      const config = makeConfig({ fixPermissions: true });
      const channelConfig: ItchChannelConfig = { channel: "linux", directory: "exports/linux", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).toContain("--fix-permissions");
    });

    test("omits --fix-permissions when disabled", () => {
      const config = makeConfig({ fixPermissions: false });
      const channelConfig: ItchChannelConfig = { channel: "linux", directory: "exports/linux", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).not.toContain("--fix-permissions");
    });

    test("includes --if-changed when enabled", () => {
      const config = makeConfig({ ifChanged: true });
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).toContain("--if-changed");
    });

    test("omits --if-changed when disabled", () => {
      const config = makeConfig({ ifChanged: false });
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).not.toContain("--if-changed");
    });

    test("includes --userversion from config", () => {
      const config = makeConfig({ userVersion: "1.0.0" });
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).toContain("--userversion");
      expect(args).toContain("1.0.0");
    });

    test("option userVersion overrides config", () => {
      const config = makeConfig({ userVersion: "1.0.0" });
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig, { userVersion: "2.0.0" });
      expect(args).toContain("2.0.0");
      expect(args).not.toContain("1.0.0");
    });

    test("includes --dry-run when set", () => {
      const config = makeConfig();
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig, { dryRun: true });
      expect(args).toContain("--dry-run");
    });

    test("omits --dry-run when not set", () => {
      const config = makeConfig();
      const channelConfig: ItchChannelConfig = { channel: "web", directory: "exports/web", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args).not.toContain("--dry-run");
    });

    test("directory is last-but-one arg, target is last", () => {
      const config = makeConfig();
      const channelConfig: ItchChannelConfig = { channel: "windows", directory: "exports/windows", enabled: true };
      const args = buildPushArgs(config, channelConfig);
      expect(args[args.length - 1]).toBe(`${ITCH_TARGET}:windows`);
      expect(args[args.length - 2]).toContain("exports/windows");
    });
  });

  // ─── executePublish ───────────────────────────────────────────────────

  describe("executePublish", () => {
    test("throws if not initialized", async () => {
      expect(executePublish(testDir)).rejects.toThrow("not initialized");
    });

    test("dry-run succeeds without executor", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.status).toBe("succeeded");
    });

    test("produces results for all enabled channels", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.results).toHaveLength(4);
    });

    test("run has correct projectId", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.projectId).toBe(PROJECT_ID);
    });

    test("run has correct itchTarget", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.itchTarget).toBe(ITCH_TARGET);
    });

    test("run has a unique id", async () => {
      initDefault();
      const run1 = await executePublish(testDir);
      const run2 = await executePublish(testDir);
      expect(run1.id).not.toBe(run2.id);
    });

    test("run has timestamp", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.timestamp).toBeGreaterThan(0);
    });

    test("run has duration", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    test("default triggeredBy is manual", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(run.triggeredBy).toBe("manual");
    });

    test("custom triggeredBy is preserved", async () => {
      initDefault();
      const run = await executePublish(testDir, { triggeredBy: "ci" });
      expect(run.triggeredBy).toBe("ci");
    });

    test("custom tags are preserved", async () => {
      initDefault();
      const run = await executePublish(testDir, { tags: ["release", "v1"] });
      expect(run.tags).toEqual(["release", "v1"]);
    });

    test("custom metadata is preserved", async () => {
      initDefault();
      const run = await executePublish(testDir, { metadata: { buildNumber: 42 } });
      expect(run.metadata).toEqual({ buildNumber: 42 });
    });

    test("respects channel filter", async () => {
      initDefault();
      const run = await executePublish(testDir, { channels: ["windows", "linux"] });
      expect(run.channels).toHaveLength(2);
      expect(run.channels).toContain("windows");
      expect(run.channels).toContain("linux");
    });

    test("skips disabled channels even if requested", async () => {
      initDefault();
      setChannelEnabled(testDir, "windows", false);
      const run = await executePublish(testDir, { channels: ["windows", "linux"] });
      expect(run.channels).toHaveLength(1);
      expect(run.channels).toContain("linux");
    });

    test("executor success produces succeeded status", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: ["ok"], buildId: "123" });
      const run = await executePublish(testDir, undefined, executor);
      expect(run.status).toBe("succeeded");
      expect(run.results.every((r) => r.status === "succeeded")).toBe(true);
    });

    test("executor failure produces failed status", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth failed", logs: ["err"] });
      const run = await executePublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
      expect(run.results.every((r) => r.status === "failed")).toBe(true);
    });

    test("executor exception produces failed result", async () => {
      initDefault();
      const executor = async () => { throw new Error("network error"); };
      const run = await executePublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
      expect(run.results[0].error).toBe("network error");
    });

    test("mixed results derive correct overall status", async () => {
      initDefault();
      let callCount = 0;
      const executor = async () => {
        callCount++;
        if (callCount === 1) return { success: true, logs: [] };
        return { success: false, error: "fail", logs: [] };
      };
      const run = await executePublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
    });

    test("buildId is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], buildId: "build-42" });
      const run = await executePublish(testDir, undefined, executor);
      expect(run.results[0].buildId).toBe("build-42");
    });

    test("bytesUploaded is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], bytesUploaded: 1024 });
      const run = await executePublish(testDir, undefined, executor);
      expect(run.results[0].bytesUploaded).toBe(1024);
    });

    test("updates state totalRuns", async () => {
      initDefault();
      await executePublish(testDir);
      expect(getState(testDir)!.totalRuns).toBe(1);
      await executePublish(testDir);
      expect(getState(testDir)!.totalRuns).toBe(2);
    });

    test("updates state lastRunId", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(getState(testDir)!.lastRunId).toBe(run.id);
    });

    test("updates state lastRunTime", async () => {
      initDefault();
      await executePublish(testDir);
      expect(getState(testDir)!.lastRunTime).toBeGreaterThan(0);
    });

    test("clears isRunning after completion", async () => {
      initDefault();
      await executePublish(testDir);
      expect(getState(testDir)!.isRunning).toBe(false);
    });

    test("clears currentChannel after completion", async () => {
      initDefault();
      await executePublish(testDir);
      expect(getState(testDir)!.currentChannel).toBeNull();
    });

    test("throws if already running", async () => {
      initDefault();
      const state = getState(testDir)!;
      state.isRunning = true;
      writeFileSync(join(testDir, ".itch-publisher", "state.json"), JSON.stringify(state, null, 2));
      expect(executePublish(testDir)).rejects.toThrow("already running");
    });

    test("persists run to disk", async () => {
      initDefault();
      const run = await executePublish(testDir);
      const loaded = getRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(run.id);
    });

    test("onProgress callback is called", async () => {
      initDefault();
      const messages: string[] = [];
      await executePublish(testDir, undefined, undefined, (_ch, msg) => messages.push(msg));
      expect(messages.length).toBeGreaterThan(0);
    });

    test("userVersion from options is used", async () => {
      initDefault();
      const run = await executePublish(testDir, { userVersion: "3.0.0" });
      expect(run.userVersion).toBe("3.0.0");
    });

    test("userVersion falls back to config", async () => {
      initDefault({ userVersion: "2.0.0" });
      const run = await executePublish(testDir);
      expect(run.userVersion).toBe("2.0.0");
    });

    test("publish retention prunes old runs", async () => {
      initDefault({ publishRetention: 2 });
      await executePublish(testDir);
      await executePublish(testDir);
      await executePublish(testDir);
      const history = getHistory(testDir);
      expect(history.totalCount).toBe(2);
    });
  });

  // ─── cancelPublish ────────────────────────────────────────────────────

  describe("cancelPublish", () => {
    test("throws if not initialized", () => {
      expect(() => cancelPublish(testDir)).toThrow("not initialized");
    });

    test("returns false if not running", () => {
      initDefault();
      expect(cancelPublish(testDir)).toBe(false);
    });

    test("returns true and clears state if running", () => {
      initDefault();
      const state = getState(testDir)!;
      state.isRunning = true;
      state.currentChannel = "windows";
      writeFileSync(join(testDir, ".itch-publisher", "state.json"), JSON.stringify(state, null, 2));

      expect(cancelPublish(testDir)).toBe(true);

      const after = getState(testDir)!;
      expect(after.isRunning).toBe(false);
      expect(after.currentChannel).toBeNull();
    });
  });

  // ─── getRun ───────────────────────────────────────────────────────────

  describe("getRun", () => {
    test("returns null for unknown id", () => {
      initDefault();
      expect(getRun(testDir, "nonexistent")).toBeNull();
    });

    test("returns run after publish", async () => {
      initDefault();
      const run = await executePublish(testDir);
      const loaded = getRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe(run.status);
    });
  });

  // ─── getHistory ───────────────────────────────────────────────────────

  describe("getHistory", () => {
    test("returns empty for uninitialized", () => {
      const history = getHistory(testDir);
      expect(history.runs).toHaveLength(0);
      expect(history.totalCount).toBe(0);
    });

    test("returns empty before any runs", () => {
      initDefault();
      const history = getHistory(testDir);
      expect(history.totalCount).toBe(0);
    });

    test("returns runs sorted newest first", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      await executePublish(testDir);
      const history = getHistory(testDir);
      expect(history.runs).toHaveLength(3);
      for (let i = 1; i < history.runs.length; i++) {
        expect(history.runs[i - 1].timestamp).toBeGreaterThanOrEqual(history.runs[i].timestamp);
      }
    });

    test("filters by channel", async () => {
      initDefault();
      await executePublish(testDir, { channels: ["windows"] });
      await executePublish(testDir, { channels: ["linux"] });
      const history = getHistory(testDir, { channel: "windows" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by status", async () => {
      initDefault();
      await executePublish(testDir);
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executePublish(testDir, undefined, executor);
      const history = getHistory(testDir, { status: "succeeded" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by triggeredBy", async () => {
      initDefault();
      await executePublish(testDir, { triggeredBy: "ci" });
      await executePublish(testDir, { triggeredBy: "manual" });
      const history = getHistory(testDir, { triggeredBy: "ci" });
      expect(history.totalCount).toBe(1);
    });

    test("respects limit", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      await executePublish(testDir);
      const history = getHistory(testDir, { limit: 2 });
      expect(history.runs).toHaveLength(2);
      expect(history.totalCount).toBe(3);
    });

    test("respects offset", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      await executePublish(testDir);
      const all = getHistory(testDir);
      const sliced = getHistory(testDir, { offset: 1, limit: 1 });
      expect(sliced.runs).toHaveLength(1);
      expect(sliced.runs[0].id).toBe(all.runs[1].id);
    });

    test("filters by search in target", async () => {
      initDefault();
      await executePublish(testDir);
      const history = getHistory(testDir, { search: "testuser" });
      expect(history.totalCount).toBe(1);
    });

    test("search returns empty for no match", async () => {
      initDefault();
      await executePublish(testDir);
      const history = getHistory(testDir, { search: "zzz_nomatch" });
      expect(history.totalCount).toBe(0);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────

  describe("getStats", () => {
    test("returns null for uninitialized", () => {
      expect(getStats(testDir)).toBeNull();
    });

    test("returns zero stats before any runs", () => {
      initDefault();
      const stats = getStats(testDir)!;
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalPushes).toBe(0);
    });

    test("counts total runs", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      const stats = getStats(testDir)!;
      expect(stats.totalRuns).toBe(2);
    });

    test("counts total pushes across channels", async () => {
      initDefault();
      await executePublish(testDir);
      const stats = getStats(testDir)!;
      expect(stats.totalPushes).toBe(4);
    });

    test("counts succeeded", async () => {
      initDefault();
      await executePublish(testDir);
      const stats = getStats(testDir)!;
      expect(stats.succeeded).toBe(4);
    });

    test("counts failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executePublish(testDir, undefined, executor);
      const stats = getStats(testDir)!;
      expect(stats.failed).toBe(4);
    });

    test("tracks channel counts", async () => {
      initDefault();
      await executePublish(testDir, { channels: ["windows"] });
      const stats = getStats(testDir)!;
      expect(stats.channelCounts["windows"]).toBe(1);
    });

    test("computes channel success rates", async () => {
      initDefault();
      await executePublish(testDir, { channels: ["windows"] });
      const stats = getStats(testDir)!;
      expect(stats.channelSuccessRates["windows"]).toBe(100);
    });

    test("computes average duration", async () => {
      initDefault();
      await executePublish(testDir);
      const stats = getStats(testDir)!;
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    test("tracks firstRun and lastRun", async () => {
      initDefault();
      await executePublish(testDir);
      const stats = getStats(testDir)!;
      expect(stats.firstRun).toBeGreaterThan(0);
      expect(stats.lastRun).toBeGreaterThan(0);
    });

    test("has correct projectId", async () => {
      initDefault();
      const stats = getStats(testDir)!;
      expect(stats.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── getChannelResult ─────────────────────────────────────────────────

  describe("getChannelResult", () => {
    test("returns result for existing channel", async () => {
      initDefault();
      const run = await executePublish(testDir);
      const result = getChannelResult(run, "windows");
      expect(result).not.toBeNull();
      expect(result!.channel).toBe("windows");
    });

    test("returns null for missing channel", async () => {
      initDefault();
      const run = await executePublish(testDir, { channels: ["windows"] });
      expect(getChannelResult(run, "android")).toBeNull();
    });
  });

  // ─── isRunSuccessful ──────────────────────────────────────────────────

  describe("isRunSuccessful", () => {
    test("returns true when all succeeded", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(isRunSuccessful(run)).toBe(true);
    });

    test("returns false when any failed", async () => {
      initDefault();
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return callCount === 1 ? { success: true, logs: [] } : { success: false, error: "f", logs: [] };
      };
      const run = await executePublish(testDir, undefined, executor);
      expect(isRunSuccessful(run)).toBe(false);
    });
  });

  // ─── getFailedChannels / getSucceededChannels ─────────────────────────

  describe("getFailedChannels", () => {
    test("returns empty when all succeeded", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(getFailedChannels(run)).toHaveLength(0);
    });

    test("returns failed channels", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executePublish(testDir, { channels: ["windows", "linux"] }, executor);
      expect(getFailedChannels(run)).toHaveLength(2);
    });
  });

  describe("getSucceededChannels", () => {
    test("returns all when all succeeded", async () => {
      initDefault();
      const run = await executePublish(testDir, { channels: ["windows", "linux"] });
      expect(getSucceededChannels(run)).toHaveLength(2);
    });

    test("returns empty when all failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executePublish(testDir, undefined, executor);
      expect(getSucceededChannels(run)).toHaveLength(0);
    });
  });

  // ─── pruneRuns ────────────────────────────────────────────────────────

  describe("pruneRuns", () => {
    test("keeps latest N runs", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      await executePublish(testDir);
      const deleted = pruneRuns(testDir, 1);
      expect(deleted).toBe(2);
      expect(getHistory(testDir).totalCount).toBe(1);
    });

    test("returns 0 when nothing to prune", async () => {
      initDefault();
      await executePublish(testDir);
      expect(pruneRuns(testDir, 10)).toBe(0);
    });

    test("prunes all with keepCount 0", async () => {
      initDefault();
      await executePublish(testDir);
      await executePublish(testDir);
      const deleted = pruneRuns(testDir, 0);
      expect(deleted).toBe(2);
    });
  });

  // ─── formatRunOneline ─────────────────────────────────────────────────

  describe("formatRunOneline", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executePublish(testDir);
      const line = formatRunOneline(run);
      expect(line).toContain(run.id.slice(0, 7));
    });

    test("includes target", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunOneline(run)).toContain(ITCH_TARGET);
    });

    test("shows + for succeeded", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunOneline(run)).toContain("[+]");
    });

    test("shows x for failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executePublish(testDir, undefined, executor);
      expect(formatRunOneline(run)).toContain("[x]");
    });

    test("includes duration", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunOneline(run)).toMatch(/[\d.]+s/);
    });
  });

  // ─── formatRunFull ────────────────────────────────────────────────────

  describe("formatRunFull", () => {
    test("includes run id", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunFull(run)).toContain(run.id);
    });

    test("includes status", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunFull(run)).toContain("succeeded");
    });

    test("includes target", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(formatRunFull(run)).toContain(ITCH_TARGET);
    });

    test("includes channel results", async () => {
      initDefault();
      const run = await executePublish(testDir, { channels: ["windows"] });
      const full = formatRunFull(run);
      expect(full).toContain("windows");
    });

    test("includes error for failed channels", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth error", logs: [] });
      const run = await executePublish(testDir, { channels: ["windows"] }, executor);
      expect(formatRunFull(run)).toContain("auth error");
    });

    test("includes version when set", async () => {
      initDefault();
      const run = await executePublish(testDir, { userVersion: "1.2.3" });
      expect(formatRunFull(run)).toContain("1.2.3");
    });

    test("includes tags when set", async () => {
      initDefault();
      const run = await executePublish(testDir, { tags: ["beta"] });
      expect(formatRunFull(run)).toContain("beta");
    });

    test("includes buildId when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], buildId: "b-999" });
      const run = await executePublish(testDir, { channels: ["windows"] }, executor);
      expect(formatRunFull(run)).toContain("b-999");
    });

    test("includes bytesUploaded when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], bytesUploaded: 2048 });
      const run = await executePublish(testDir, { channels: ["windows"] }, executor);
      expect(formatRunFull(run)).toContain("2048");
    });
  });

  // ─── generatePublishSummary ───────────────────────────────────────────

  describe("generatePublishSummary", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(generatePublishSummary(run)).toContain(run.id.slice(0, 7));
    });

    test("includes succeeded count", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(generatePublishSummary(run)).toContain("4 succeeded");
    });

    test("includes failed count", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "f", logs: [] });
      const run = await executePublish(testDir, { channels: ["windows", "linux"] }, executor);
      expect(generatePublishSummary(run)).toContain("2 failed");
    });

    test("includes total count", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(generatePublishSummary(run)).toContain("4 total");
    });

    test("includes target", async () => {
      initDefault();
      const run = await executePublish(testDir);
      expect(generatePublishSummary(run)).toContain(ITCH_TARGET);
    });
  });

  // ─── destroyPublisher ─────────────────────────────────────────────────

  describe("destroyPublisher", () => {
    test("returns false if not initialized", () => {
      expect(destroyPublisher(testDir)).toBe(false);
    });

    test("returns true after destroying", () => {
      initDefault();
      expect(destroyPublisher(testDir)).toBe(true);
    });

    test("removes .itch-publisher directory", () => {
      initDefault();
      destroyPublisher(testDir);
      expect(existsSync(join(testDir, ".itch-publisher"))).toBe(false);
    });

    test("getState returns null after destroy", () => {
      initDefault();
      destroyPublisher(testDir);
      expect(getState(testDir)).toBeNull();
    });
  });
});
