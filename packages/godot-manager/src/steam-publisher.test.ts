import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  type SteamPublishConfig,
  type SteamDepotConfig,
  type SteamPublishRun,
  type SteamPublishOptions,
  getDefaultDepots,
  getDefaultDepotIds,
  parseSteamAppId,
  formatSteamTarget,
  validateSteamPublishConfig,
  initSteamPublisher,
  hasSteamPublisher,
  getSteamPublishState,
  updateSteamPublishConfig,
  getEnabledDepots,
  setDepotEnabled,
  addDepot,
  removeDepot,
  buildSteamUploadArgs,
  generateAppBuildVdf,
  executeSteamPublish,
  cancelSteamPublish,
  getSteamRun,
  getSteamHistory,
  getSteamStats,
  getDepotResult,
  isSteamRunSuccessful,
  getFailedDepots,
  getSucceededDepots,
  pruneSteamRuns,
  formatSteamRunOneline,
  formatSteamRunFull,
  generateSteamPublishSummary,
  destroySteamPublisher,
} from "./steam-publisher";

let testDir: string;
const PROJECT_ID = "test-steam-project";
const APP_ID = "480";

function makeConfig(overrides?: Partial<SteamPublishConfig>): SteamPublishConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    appId: APP_ID,
    depots: getDefaultDepots(),
    steamCmdPath: "steamcmd",
    branch: "beta",
    ifChanged: false,
    uploadTimeout: 600_000,
    publishRetention: 0,
    preview: false,
    ...overrides,
  };
}

function initDefault(overrides?: Partial<SteamPublishConfig>): void {
  initSteamPublisher(makeConfig(overrides));
}

beforeEach(() => {
  const id = `steam-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("steam-publisher", () => {

  // ─── getDefaultDepots ─────────────────────────────────────────────────

  describe("getDefaultDepots", () => {
    test("returns three depots", () => {
      expect(getDefaultDepots()).toHaveLength(3);
    });

    test("all defaults are enabled", () => {
      for (const d of getDefaultDepots()) {
        expect(d.enabled).toBe(true);
      }
    });

    test("each depot has an id", () => {
      for (const d of getDefaultDepots()) {
        expect(d.depotId.length).toBeGreaterThan(0);
      }
    });

    test("each depot has a directory", () => {
      for (const d of getDefaultDepots()) {
        expect(d.directory.length).toBeGreaterThan(0);
      }
    });

    test("returns a new array each call", () => {
      const a = getDefaultDepots();
      const b = getDefaultDepots();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── getDefaultDepotIds ───────────────────────────────────────────────

  describe("getDefaultDepotIds", () => {
    test("returns three IDs", () => {
      expect(getDefaultDepotIds()).toHaveLength(3);
    });

    test("includes all expected IDs", () => {
      const ids = getDefaultDepotIds();
      expect(ids).toContain("1000001");
      expect(ids).toContain("1000002");
      expect(ids).toContain("1000003");
    });

    test("returns a new array each call", () => {
      const a = getDefaultDepotIds();
      const b = getDefaultDepotIds();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── parseSteamAppId ──────────────────────────────────────────────────

  describe("parseSteamAppId", () => {
    test("parses valid numeric app ID", () => {
      const result = parseSteamAppId("480");
      expect(result.valid).toBe(true);
      expect(result.appId).toBe("480");
    });

    test("trims whitespace", () => {
      const result = parseSteamAppId("  480  ");
      expect(result.valid).toBe(true);
      expect(result.appId).toBe("480");
    });

    test("rejects empty string", () => {
      expect(parseSteamAppId("").valid).toBe(false);
    });

    test("rejects non-numeric", () => {
      expect(parseSteamAppId("abc").valid).toBe(false);
    });

    test("rejects mixed alphanumeric", () => {
      expect(parseSteamAppId("480abc").valid).toBe(false);
    });

    test("accepts large numbers", () => {
      const result = parseSteamAppId("1234567890");
      expect(result.valid).toBe(true);
      expect(result.appId).toBe("1234567890");
    });
  });

  // ─── formatSteamTarget ────────────────────────────────────────────────

  describe("formatSteamTarget", () => {
    test("formats app:depot", () => {
      expect(formatSteamTarget("480", "481")).toBe("480:481");
    });

    test("handles large IDs", () => {
      expect(formatSteamTarget("1000000", "1000001")).toBe("1000000:1000001");
    });
  });

  // ─── validateSteamPublishConfig ───────────────────────────────────────

  describe("validateSteamPublishConfig", () => {
    test("valid config passes validation", () => {
      const result = validateSteamPublishConfig(makeConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("missing projectId is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), projectId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectId"))).toBe(true);
    });

    test("missing projectPath is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), projectPath: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectPath"))).toBe(true);
    });

    test("missing appId is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), appId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("appId"))).toBe(true);
    });

    test("non-numeric appId is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), appId: "abc" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("numeric"))).toBe(true);
    });

    test("empty depots array is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), depots: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("At least one depot"))).toBe(true);
    });

    test("duplicate depots is an error", () => {
      const depots = [
        { depotId: "1000001", directory: "a", enabled: true },
        { depotId: "1000001", directory: "b", enabled: true },
      ];
      const result = validateSteamPublishConfig({ ...makeConfig(), depots });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    test("empty depot ID is an error", () => {
      const depots = [{ depotId: "", directory: "a", enabled: true }];
      const result = validateSteamPublishConfig({ ...makeConfig(), depots });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    test("non-numeric depot ID is an error", () => {
      const depots = [{ depotId: "abc", directory: "a", enabled: true }];
      const result = validateSteamPublishConfig({ ...makeConfig(), depots });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("numeric"))).toBe(true);
    });

    test("empty depot directory is an error", () => {
      const depots = [{ depotId: "1000001", directory: "", enabled: true }];
      const result = validateSteamPublishConfig({ ...makeConfig(), depots });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("directory"))).toBe(true);
    });

    test("no enabled depots is a warning", () => {
      const depots = getDefaultDepots().map((d) => ({ ...d, enabled: false }));
      const result = validateSteamPublishConfig({ ...makeConfig(), depots });
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("enabled"))).toBe(true);
    });

    test("negative uploadTimeout is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), uploadTimeout: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("uploadTimeout"))).toBe(true);
    });

    test("zero uploadTimeout is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), uploadTimeout: 0 });
      expect(result.valid).toBe(false);
    });

    test("negative publishRetention is an error", () => {
      const result = validateSteamPublishConfig({ ...makeConfig(), publishRetention: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("publishRetention"))).toBe(true);
    });

    test("zero publishRetention is valid", () => {
      const result = validateSteamPublishConfig(makeConfig({ publishRetention: 0 }));
      expect(result.valid).toBe(true);
    });
  });

  // ─── initSteamPublisher / hasSteamPublisher ───────────────────────────

  describe("initSteamPublisher", () => {
    test("returns true on first init", () => {
      expect(initSteamPublisher(makeConfig())).toBe(true);
    });

    test("returns false on second init", () => {
      initDefault();
      expect(initSteamPublisher(makeConfig())).toBe(false);
    });

    test("creates .steam-publisher directory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".steam-publisher"))).toBe(true);
    });

    test("creates runs subdirectory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".steam-publisher", "runs"))).toBe(true);
    });

    test("creates state.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".steam-publisher", "state.json"))).toBe(true);
    });

    test("creates config.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".steam-publisher", "config.json"))).toBe(true);
    });

    test("state has correct projectId", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });

    test("state starts with zero runs", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.totalRuns).toBe(0);
    });

    test("state starts not running", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.isRunning).toBe(false);
    });

    test("state has no last run", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.lastRunId).toBeNull();
      expect(state!.lastRunTime).toBeNull();
    });

    test("state has timestamps", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.createdAt).toBeGreaterThan(0);
      expect(state!.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("hasSteamPublisher", () => {
    test("returns false before init", () => {
      expect(hasSteamPublisher(testDir)).toBe(false);
    });

    test("returns true after init", () => {
      initDefault();
      expect(hasSteamPublisher(testDir)).toBe(true);
    });

    test("returns false after destroy", () => {
      initDefault();
      destroySteamPublisher(testDir);
      expect(hasSteamPublisher(testDir)).toBe(false);
    });
  });

  // ─── getSteamPublishState ─────────────────────────────────────────────

  describe("getSteamPublishState", () => {
    test("returns null before init", () => {
      expect(getSteamPublishState(testDir)).toBeNull();
    });

    test("returns state after init", () => {
      initDefault();
      expect(getSteamPublishState(testDir)).not.toBeNull();
    });

    test("state config matches init config", () => {
      initDefault();
      const state = getSteamPublishState(testDir);
      expect(state!.config.appId).toBe(APP_ID);
    });
  });

  // ─── updateSteamPublishConfig ─────────────────────────────────────────

  describe("updateSteamPublishConfig", () => {
    test("throws if not initialized", () => {
      expect(() => updateSteamPublishConfig(testDir, {})).toThrow("not initialized");
    });

    test("updates appId", () => {
      initDefault();
      const updated = updateSteamPublishConfig(testDir, { appId: "730" });
      expect(updated.appId).toBe("730");
    });

    test("persists to state", () => {
      initDefault();
      updateSteamPublishConfig(testDir, { appId: "730" });
      const state = getSteamPublishState(testDir);
      expect(state!.config.appId).toBe("730");
    });

    test("persists to config.json", () => {
      initDefault();
      updateSteamPublishConfig(testDir, { branch: "staging" });
      const raw = JSON.parse(readFileSync(join(testDir, ".steam-publisher", "config.json"), "utf-8"));
      expect(raw.branch).toBe("staging");
    });

    test("updates updatedAt", () => {
      initDefault();
      const before = getSteamPublishState(testDir)!.updatedAt;
      updateSteamPublishConfig(testDir, { ifChanged: true });
      const after = getSteamPublishState(testDir)!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("preserves unmodified fields", () => {
      initDefault();
      updateSteamPublishConfig(testDir, { ifChanged: true });
      const state = getSteamPublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
      expect(state!.config.appId).toBe(APP_ID);
    });
  });

  // ─── getEnabledDepots ─────────────────────────────────────────────────

  describe("getEnabledDepots", () => {
    test("returns empty for uninitialized", () => {
      expect(getEnabledDepots(testDir)).toHaveLength(0);
    });

    test("returns all three by default", () => {
      initDefault();
      expect(getEnabledDepots(testDir)).toHaveLength(3);
    });

    test("excludes disabled depots", () => {
      initDefault();
      setDepotEnabled(testDir, "1000001", false);
      expect(getEnabledDepots(testDir)).toHaveLength(2);
      expect(getEnabledDepots(testDir).some((d) => d.depotId === "1000001")).toBe(false);
    });
  });

  // ─── setDepotEnabled ──────────────────────────────────────────────────

  describe("setDepotEnabled", () => {
    test("throws if not initialized", () => {
      expect(() => setDepotEnabled(testDir, "1000001", false)).toThrow("not initialized");
    });

    test("disables a depot", () => {
      initDefault();
      const result = setDepotEnabled(testDir, "1000001", false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    test("enables a depot", () => {
      initDefault();
      setDepotEnabled(testDir, "1000001", false);
      const result = setDepotEnabled(testDir, "1000001", true);
      expect(result!.enabled).toBe(true);
    });

    test("returns null for unknown depot", () => {
      initDefault();
      expect(setDepotEnabled(testDir, "9999999", false)).toBeNull();
    });

    test("persists change", () => {
      initDefault();
      setDepotEnabled(testDir, "1000002", false);
      const state = getSteamPublishState(testDir);
      const depot = state!.config.depots.find((d) => d.depotId === "1000002");
      expect(depot!.enabled).toBe(false);
    });
  });

  // ─── addDepot ─────────────────────────────────────────────────────────

  describe("addDepot", () => {
    test("throws if not initialized", () => {
      expect(() => addDepot(testDir, { depotId: "2000001", directory: "exports/dlc", enabled: true })).toThrow("not initialized");
    });

    test("adds a new depot", () => {
      initDefault();
      const result = addDepot(testDir, { depotId: "2000001", directory: "exports/dlc", enabled: true });
      expect(result).toBe(true);
    });

    test("returns false for duplicate", () => {
      initDefault();
      expect(addDepot(testDir, { depotId: "1000001", directory: "x", enabled: true })).toBe(false);
    });

    test("persists added depot", () => {
      initDefault();
      addDepot(testDir, { depotId: "2000001", directory: "exports/dlc", enabled: true });
      const state = getSteamPublishState(testDir);
      expect(state!.config.depots.some((d) => d.depotId === "2000001")).toBe(true);
    });

    test("increases depot count", () => {
      initDefault();
      addDepot(testDir, { depotId: "2000001", directory: "exports/dlc", enabled: true });
      expect(getSteamPublishState(testDir)!.config.depots).toHaveLength(4);
    });
  });

  // ─── removeDepot ──────────────────────────────────────────────────────

  describe("removeDepot", () => {
    test("throws if not initialized", () => {
      expect(() => removeDepot(testDir, "1000001")).toThrow("not initialized");
    });

    test("removes existing depot", () => {
      initDefault();
      expect(removeDepot(testDir, "1000001")).toBe(true);
    });

    test("returns false for unknown depot", () => {
      initDefault();
      expect(removeDepot(testDir, "9999999")).toBe(false);
    });

    test("persists removal", () => {
      initDefault();
      removeDepot(testDir, "1000001");
      const state = getSteamPublishState(testDir);
      expect(state!.config.depots.some((d) => d.depotId === "1000001")).toBe(false);
    });

    test("decreases depot count", () => {
      initDefault();
      removeDepot(testDir, "1000001");
      expect(getSteamPublishState(testDir)!.config.depots).toHaveLength(2);
    });
  });

  // ─── buildSteamUploadArgs ─────────────────────────────────────────────

  describe("buildSteamUploadArgs", () => {
    test("includes app_build command", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("+app_build");
    });

    test("includes app-id", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--app-id");
      expect(args).toContain(APP_ID);
    });

    test("includes depot-id", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--depot-id");
      expect(args).toContain("1000001");
    });

    test("includes content-dir", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--content-dir");
    });

    test("includes branch when not default", () => {
      const config = makeConfig({ branch: "beta" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--branch");
      expect(args).toContain("beta");
    });

    test("omits branch when default", () => {
      const config = makeConfig({ branch: "default" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).not.toContain("--branch");
    });

    test("includes description when set", () => {
      const config = makeConfig({ buildDescription: "Build v1.0" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--desc");
      expect(args).toContain("Build v1.0");
    });

    test("includes --preview when dryRun is true", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig, { dryRun: true });
      expect(args).toContain("--preview");
    });

    test("includes --preview when config.preview is true", () => {
      const config = makeConfig({ preview: true });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("--preview");
    });

    test("omits --preview when not set", () => {
      const config = makeConfig({ preview: false });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).not.toContain("--preview");
    });

    test("includes login when username set", () => {
      const config = makeConfig({ username: "testuser" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).toContain("+login");
      expect(args).toContain("testuser");
    });

    test("omits login when no username", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args).not.toContain("+login");
    });

    test("ends with +quit", () => {
      const config = makeConfig();
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig);
      expect(args[args.length - 1]).toBe("+quit");
    });

    test("option branch overrides config", () => {
      const config = makeConfig({ branch: "beta" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig, { branch: "staging" });
      expect(args).toContain("staging");
      expect(args).not.toContain("beta");
    });

    test("option buildDescription overrides config", () => {
      const config = makeConfig({ buildDescription: "old" });
      const depotConfig = getDefaultDepots()[0];
      const args = buildSteamUploadArgs(config, depotConfig, { buildDescription: "new" });
      expect(args).toContain("new");
      expect(args).not.toContain("old");
    });
  });

  // ─── generateAppBuildVdf ──────────────────────────────────────────────

  describe("generateAppBuildVdf", () => {
    test("contains AppBuild", () => {
      const config = makeConfig();
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain("AppBuild");
    });

    test("contains AppID", () => {
      const config = makeConfig();
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain(`"AppID" "${APP_ID}"`);
    });

    test("contains Depots section", () => {
      const config = makeConfig();
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"Depots"');
    });

    test("includes enabled depot IDs", () => {
      const config = makeConfig();
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"1000001"');
      expect(vdf).toContain('"1000002"');
      expect(vdf).toContain('"1000003"');
    });

    test("includes SetLive branch", () => {
      const config = makeConfig({ branch: "beta" });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"SetLive" "beta"');
    });

    test("includes description", () => {
      const config = makeConfig({ buildDescription: "Test build" });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"Desc" "Test build"');
    });

    test("includes Preview flag", () => {
      const config = makeConfig({ preview: true });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"Preview" "1"');
    });

    test("preview is 0 when disabled", () => {
      const config = makeConfig({ preview: false });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"Preview" "0"');
    });

    test("option preview overrides config", () => {
      const config = makeConfig({ preview: false });
      const vdf = generateAppBuildVdf(config, { preview: true });
      expect(vdf).toContain('"Preview" "1"');
    });

    test("includes FileMapping with Recursive", () => {
      const config = makeConfig();
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"FileMapping"');
      expect(vdf).toContain('"Recursive" "1"');
    });

    test("includes FileExclusion patterns", () => {
      const depots: SteamDepotConfig[] = [
        { depotId: "1000001", directory: "exports/windows", enabled: true, excludePatterns: ["*.pdb", "*.log"] },
      ];
      const config = makeConfig({ depots });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"FileExclusion" "*.pdb"');
      expect(vdf).toContain('"FileExclusion" "*.log"');
    });

    test("excludes disabled depots", () => {
      const depots: SteamDepotConfig[] = [
        { depotId: "1000001", directory: "exports/windows", enabled: true },
        { depotId: "1000002", directory: "exports/linux", enabled: false },
      ];
      const config = makeConfig({ depots });
      const vdf = generateAppBuildVdf(config);
      expect(vdf).toContain('"1000001"');
      expect(vdf).not.toContain('"1000002"');
    });
  });

  // ─── executeSteamPublish ──────────────────────────────────────────────

  describe("executeSteamPublish", () => {
    test("throws if not initialized", async () => {
      expect(executeSteamPublish(testDir)).rejects.toThrow("not initialized");
    });

    test("dry-run succeeds without executor", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.status).toBe("succeeded");
    });

    test("produces results for all enabled depots", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.results).toHaveLength(3);
    });

    test("run has correct projectId", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.projectId).toBe(PROJECT_ID);
    });

    test("run has correct appId", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.appId).toBe(APP_ID);
    });

    test("run has a unique id", async () => {
      initDefault();
      const run1 = await executeSteamPublish(testDir);
      const run2 = await executeSteamPublish(testDir);
      expect(run1.id).not.toBe(run2.id);
    });

    test("run has timestamp", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.timestamp).toBeGreaterThan(0);
    });

    test("run has duration", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    test("default triggeredBy is manual", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(run.triggeredBy).toBe("manual");
    });

    test("custom triggeredBy is preserved", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { triggeredBy: "ci" });
      expect(run.triggeredBy).toBe("ci");
    });

    test("custom tags are preserved", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { tags: ["release", "v1"] });
      expect(run.tags).toEqual(["release", "v1"]);
    });

    test("custom metadata is preserved", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { metadata: { buildNumber: 42 } });
      expect(run.metadata).toEqual({ buildNumber: 42 });
    });

    test("respects depot filter", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { depots: ["1000001", "1000002"] });
      expect(run.depots).toHaveLength(2);
      expect(run.depots).toContain("1000001");
      expect(run.depots).toContain("1000002");
    });

    test("skips disabled depots even if requested", async () => {
      initDefault();
      setDepotEnabled(testDir, "1000001", false);
      const run = await executeSteamPublish(testDir, { depots: ["1000001", "1000002"] });
      expect(run.depots).toHaveLength(1);
      expect(run.depots).toContain("1000002");
    });

    test("executor success produces succeeded status", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: ["ok"], manifestId: "m123" });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(run.status).toBe("succeeded");
      expect(run.results.every((r) => r.status === "succeeded")).toBe(true);
    });

    test("executor failure produces failed status", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth failed", logs: ["err"] });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
      expect(run.results.every((r) => r.status === "failed")).toBe(true);
    });

    test("executor exception produces failed result", async () => {
      initDefault();
      const executor = async () => { throw new Error("network error"); };
      const run = await executeSteamPublish(testDir, undefined, executor);
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
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
    });

    test("manifestId is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], manifestId: "manifest-42" });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(run.results[0].manifestId).toBe("manifest-42");
    });

    test("bytesUploaded is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], bytesUploaded: 1024 });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(run.results[0].bytesUploaded).toBe(1024);
    });

    test("updates state totalRuns", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.totalRuns).toBe(1);
      await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.totalRuns).toBe(2);
    });

    test("updates state lastRunId", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.lastRunId).toBe(run.id);
    });

    test("updates state lastRunTime", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.lastRunTime).toBeGreaterThan(0);
    });

    test("clears isRunning after completion", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.isRunning).toBe(false);
    });

    test("clears currentDepot after completion", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      expect(getSteamPublishState(testDir)!.currentDepot).toBeNull();
    });

    test("throws if already running", async () => {
      initDefault();
      const state = getSteamPublishState(testDir)!;
      state.isRunning = true;
      writeFileSync(join(testDir, ".steam-publisher", "state.json"), JSON.stringify(state, null, 2));
      expect(executeSteamPublish(testDir)).rejects.toThrow("already running");
    });

    test("persists run to disk", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      const loaded = getSteamRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(run.id);
    });

    test("onProgress callback is called", async () => {
      initDefault();
      const messages: string[] = [];
      await executeSteamPublish(testDir, undefined, undefined, (_depot, msg) => messages.push(msg));
      expect(messages.length).toBeGreaterThan(0);
    });

    test("branch from options is used", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { branch: "staging" });
      expect(run.branch).toBe("staging");
    });

    test("branch falls back to config", async () => {
      initDefault({ branch: "beta" });
      const run = await executeSteamPublish(testDir);
      expect(run.branch).toBe("beta");
    });

    test("buildDescription from options is used", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { buildDescription: "Test build" });
      expect(run.buildDescription).toBe("Test build");
    });

    test("publish retention prunes old runs", async () => {
      initDefault({ publishRetention: 2 });
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const history = getSteamHistory(testDir);
      expect(history.totalCount).toBe(2);
    });
  });

  // ─── cancelSteamPublish ───────────────────────────────────────────────

  describe("cancelSteamPublish", () => {
    test("throws if not initialized", () => {
      expect(() => cancelSteamPublish(testDir)).toThrow("not initialized");
    });

    test("returns false if not running", () => {
      initDefault();
      expect(cancelSteamPublish(testDir)).toBe(false);
    });

    test("returns true and clears state if running", () => {
      initDefault();
      const state = getSteamPublishState(testDir)!;
      state.isRunning = true;
      state.currentDepot = "1000001";
      writeFileSync(join(testDir, ".steam-publisher", "state.json"), JSON.stringify(state, null, 2));

      expect(cancelSteamPublish(testDir)).toBe(true);

      const after = getSteamPublishState(testDir)!;
      expect(after.isRunning).toBe(false);
      expect(after.currentDepot).toBeNull();
    });
  });

  // ─── getSteamRun ──────────────────────────────────────────────────────

  describe("getSteamRun", () => {
    test("returns null for unknown id", () => {
      initDefault();
      expect(getSteamRun(testDir, "nonexistent")).toBeNull();
    });

    test("returns run after publish", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      const loaded = getSteamRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe(run.status);
    });
  });

  // ─── getSteamHistory ──────────────────────────────────────────────────

  describe("getSteamHistory", () => {
    test("returns empty for uninitialized", () => {
      const history = getSteamHistory(testDir);
      expect(history.runs).toHaveLength(0);
      expect(history.totalCount).toBe(0);
    });

    test("returns empty before any runs", () => {
      initDefault();
      const history = getSteamHistory(testDir);
      expect(history.totalCount).toBe(0);
    });

    test("returns runs sorted newest first", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const history = getSteamHistory(testDir);
      expect(history.runs).toHaveLength(3);
      for (let i = 1; i < history.runs.length; i++) {
        expect(history.runs[i - 1].timestamp).toBeGreaterThanOrEqual(history.runs[i].timestamp);
      }
    });

    test("filters by depot", async () => {
      initDefault();
      await executeSteamPublish(testDir, { depots: ["1000001"] });
      await executeSteamPublish(testDir, { depots: ["1000002"] });
      const history = getSteamHistory(testDir, { depotId: "1000001" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by status", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeSteamPublish(testDir, undefined, executor);
      const history = getSteamHistory(testDir, { status: "succeeded" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by triggeredBy", async () => {
      initDefault();
      await executeSteamPublish(testDir, { triggeredBy: "ci" });
      await executeSteamPublish(testDir, { triggeredBy: "manual" });
      const history = getSteamHistory(testDir, { triggeredBy: "ci" });
      expect(history.totalCount).toBe(1);
    });

    test("respects limit", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const history = getSteamHistory(testDir, { limit: 2 });
      expect(history.runs).toHaveLength(2);
      expect(history.totalCount).toBe(3);
    });

    test("respects offset", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const all = getSteamHistory(testDir);
      const sliced = getSteamHistory(testDir, { offset: 1, limit: 1 });
      expect(sliced.runs).toHaveLength(1);
      expect(sliced.runs[0].id).toBe(all.runs[1].id);
    });

    test("filters by search in appId", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const history = getSteamHistory(testDir, { search: APP_ID });
      expect(history.totalCount).toBe(1);
    });

    test("search returns empty for no match", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const history = getSteamHistory(testDir, { search: "zzz_nomatch" });
      expect(history.totalCount).toBe(0);
    });

    test("filters by search in buildDescription", async () => {
      initDefault();
      await executeSteamPublish(testDir, { buildDescription: "Release v2.0" });
      const history = getSteamHistory(testDir, { search: "release" });
      expect(history.totalCount).toBe(1);
    });
  });

  // ─── getSteamStats ────────────────────────────────────────────────────

  describe("getSteamStats", () => {
    test("returns null for uninitialized", () => {
      expect(getSteamStats(testDir)).toBeNull();
    });

    test("returns zero stats before any runs", () => {
      initDefault();
      const stats = getSteamStats(testDir)!;
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalUploads).toBe(0);
    });

    test("counts total runs", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const stats = getSteamStats(testDir)!;
      expect(stats.totalRuns).toBe(2);
    });

    test("counts total uploads across depots", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const stats = getSteamStats(testDir)!;
      expect(stats.totalUploads).toBe(3);
    });

    test("counts succeeded", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const stats = getSteamStats(testDir)!;
      expect(stats.succeeded).toBe(3);
    });

    test("counts failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeSteamPublish(testDir, undefined, executor);
      const stats = getSteamStats(testDir)!;
      expect(stats.failed).toBe(3);
    });

    test("tracks depot counts", async () => {
      initDefault();
      await executeSteamPublish(testDir, { depots: ["1000001"] });
      const stats = getSteamStats(testDir)!;
      expect(stats.depotCounts["1000001"]).toBe(1);
    });

    test("computes depot success rates", async () => {
      initDefault();
      await executeSteamPublish(testDir, { depots: ["1000001"] });
      const stats = getSteamStats(testDir)!;
      expect(stats.depotSuccessRates["1000001"]).toBe(100);
    });

    test("computes average duration", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const stats = getSteamStats(testDir)!;
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    test("tracks firstRun and lastRun", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      const stats = getSteamStats(testDir)!;
      expect(stats.firstRun).toBeGreaterThan(0);
      expect(stats.lastRun).toBeGreaterThan(0);
    });

    test("has correct projectId", async () => {
      initDefault();
      const stats = getSteamStats(testDir)!;
      expect(stats.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── getDepotResult ───────────────────────────────────────────────────

  describe("getDepotResult", () => {
    test("returns result for existing depot", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      const result = getDepotResult(run, "1000001");
      expect(result).not.toBeNull();
      expect(result!.depotId).toBe("1000001");
    });

    test("returns null for missing depot", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { depots: ["1000001"] });
      expect(getDepotResult(run, "9999999")).toBeNull();
    });
  });

  // ─── isSteamRunSuccessful ─────────────────────────────────────────────

  describe("isSteamRunSuccessful", () => {
    test("returns true when all succeeded", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(isSteamRunSuccessful(run)).toBe(true);
    });

    test("returns false when any failed", async () => {
      initDefault();
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return callCount === 1 ? { success: true, logs: [] } : { success: false, error: "f", logs: [] };
      };
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(isSteamRunSuccessful(run)).toBe(false);
    });
  });

  // ─── getFailedDepots / getSucceededDepots ─────────────────────────────

  describe("getFailedDepots", () => {
    test("returns empty when all succeeded", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(getFailedDepots(run)).toHaveLength(0);
    });

    test("returns failed depots", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeSteamPublish(testDir, { depots: ["1000001", "1000002"] }, executor);
      expect(getFailedDepots(run)).toHaveLength(2);
    });
  });

  describe("getSucceededDepots", () => {
    test("returns all when all succeeded", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { depots: ["1000001", "1000002"] });
      expect(getSucceededDepots(run)).toHaveLength(2);
    });

    test("returns empty when all failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(getSucceededDepots(run)).toHaveLength(0);
    });
  });

  // ─── pruneSteamRuns ───────────────────────────────────────────────────

  describe("pruneSteamRuns", () => {
    test("keeps latest N runs", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const deleted = pruneSteamRuns(testDir, 1);
      expect(deleted).toBe(2);
      expect(getSteamHistory(testDir).totalCount).toBe(1);
    });

    test("returns 0 when nothing to prune", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      expect(pruneSteamRuns(testDir, 10)).toBe(0);
    });

    test("prunes all with keepCount 0", async () => {
      initDefault();
      await executeSteamPublish(testDir);
      await executeSteamPublish(testDir);
      const deleted = pruneSteamRuns(testDir, 0);
      expect(deleted).toBe(2);
    });
  });

  // ─── formatSteamRunOneline ────────────────────────────────────────────

  describe("formatSteamRunOneline", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      const line = formatSteamRunOneline(run);
      expect(line).toContain(run.id.slice(0, 7));
    });

    test("includes app id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunOneline(run)).toContain(APP_ID);
    });

    test("shows + for succeeded", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunOneline(run)).toContain("[+]");
    });

    test("shows x for failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeSteamPublish(testDir, undefined, executor);
      expect(formatSteamRunOneline(run)).toContain("[x]");
    });

    test("includes duration", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunOneline(run)).toMatch(/[\d.]+s/);
    });

    test("includes depot ids", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      const line = formatSteamRunOneline(run);
      expect(line).toContain("1000001");
    });
  });

  // ─── formatSteamRunFull ───────────────────────────────────────────────

  describe("formatSteamRunFull", () => {
    test("includes run id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunFull(run)).toContain(run.id);
    });

    test("includes status", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunFull(run)).toContain("succeeded");
    });

    test("includes app id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(formatSteamRunFull(run)).toContain(APP_ID);
    });

    test("includes depot results", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { depots: ["1000001"] });
      const full = formatSteamRunFull(run);
      expect(full).toContain("1000001");
    });

    test("includes error for failed depots", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth error", logs: [] });
      const run = await executeSteamPublish(testDir, { depots: ["1000001"] }, executor);
      expect(formatSteamRunFull(run)).toContain("auth error");
    });

    test("includes description when set", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { buildDescription: "Release v1.0" });
      expect(formatSteamRunFull(run)).toContain("Release v1.0");
    });

    test("includes branch", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { branch: "beta" });
      expect(formatSteamRunFull(run)).toContain("beta");
    });

    test("includes tags when set", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir, { tags: ["release"] });
      expect(formatSteamRunFull(run)).toContain("release");
    });

    test("includes manifestId when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], manifestId: "m-999" });
      const run = await executeSteamPublish(testDir, { depots: ["1000001"] }, executor);
      expect(formatSteamRunFull(run)).toContain("m-999");
    });

    test("includes bytesUploaded when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], bytesUploaded: 2048 });
      const run = await executeSteamPublish(testDir, { depots: ["1000001"] }, executor);
      expect(formatSteamRunFull(run)).toContain("2048");
    });
  });

  // ─── generateSteamPublishSummary ──────────────────────────────────────

  describe("generateSteamPublishSummary", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(generateSteamPublishSummary(run)).toContain(run.id.slice(0, 7));
    });

    test("includes succeeded count", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(generateSteamPublishSummary(run)).toContain("3 succeeded");
    });

    test("includes failed count", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "f", logs: [] });
      const run = await executeSteamPublish(testDir, { depots: ["1000001", "1000002"] }, executor);
      expect(generateSteamPublishSummary(run)).toContain("2 failed");
    });

    test("includes total count", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(generateSteamPublishSummary(run)).toContain("3 total");
    });

    test("includes app id", async () => {
      initDefault();
      const run = await executeSteamPublish(testDir);
      expect(generateSteamPublishSummary(run)).toContain(APP_ID);
    });
  });

  // ─── destroySteamPublisher ────────────────────────────────────────────

  describe("destroySteamPublisher", () => {
    test("returns false if not initialized", () => {
      expect(destroySteamPublisher(testDir)).toBe(false);
    });

    test("returns true after destroying", () => {
      initDefault();
      expect(destroySteamPublisher(testDir)).toBe(true);
    });

    test("removes .steam-publisher directory", () => {
      initDefault();
      destroySteamPublisher(testDir);
      expect(existsSync(join(testDir, ".steam-publisher"))).toBe(false);
    });

    test("getSteamPublishState returns null after destroy", () => {
      initDefault();
      destroySteamPublisher(testDir);
      expect(getSteamPublishState(testDir)).toBeNull();
    });
  });
});
