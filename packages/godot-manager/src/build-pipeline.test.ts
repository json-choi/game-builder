import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  type BuildPipelineConfig,
  type BuildPlatform,
  type BuildMatrix,
  type PlatformConfig,
  type BuildRun,
  getDefaultPlatformConfigs,
  getDefaultPlatformConfig,
  getSupportedPlatforms,
  getArtifactType,
  validatePipelineConfig,
  initPipeline,
  hasPipeline,
  getState,
  updateConfig,
  getEnabledPlatforms,
  setPlatformEnabled,
  addPlatform,
  removePlatform,
  createBuildMatrix,
  executeBuild,
  cancelBuild,
  getRun,
  getHistory,
  getStats,
  getPlatformResult,
  isRunSuccessful,
  getFailedPlatforms,
  getSucceededPlatforms,
  getRunArtifacts,
  pruneRuns,
  formatRunOneline,
  formatRunFull,
  generateBuildSummary,
  destroyPipeline,
} from "./build-pipeline";

let testDir: string;
const PROJECT_ID = "test-build-project";

function makeConfig(overrides?: Partial<BuildPipelineConfig>): BuildPipelineConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    platforms: getDefaultPlatformConfigs(),
    defaultProfile: "release",
    parallelBuilds: false,
    maxRetries: 0,
    artifactRetention: 0,
    cleanBefore: false,
    ...overrides,
  };
}

function initDefault(overrides?: Partial<BuildPipelineConfig>): void {
  initPipeline(makeConfig(overrides));
}

beforeEach(() => {
  const id = `bp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("build-pipeline", () => {
  describe("getDefaultPlatformConfigs", () => {
    test("returns configs for all four platforms", () => {
      const configs = getDefaultPlatformConfigs();
      expect(configs).toHaveLength(4);
    });

    test("all defaults are enabled", () => {
      const configs = getDefaultPlatformConfigs();
      for (const c of configs) {
        expect(c.enabled).toBe(true);
      }
    });

    test("includes web platform", () => {
      const configs = getDefaultPlatformConfigs();
      expect(configs.some((c) => c.platform === "web")).toBe(true);
    });

    test("includes windows platform", () => {
      const configs = getDefaultPlatformConfigs();
      expect(configs.some((c) => c.platform === "windows")).toBe(true);
    });

    test("includes linux platform", () => {
      const configs = getDefaultPlatformConfigs();
      expect(configs.some((c) => c.platform === "linux")).toBe(true);
    });

    test("includes macos platform", () => {
      const configs = getDefaultPlatformConfigs();
      expect(configs.some((c) => c.platform === "macos")).toBe(true);
    });

    test("web has .html extension", () => {
      const configs = getDefaultPlatformConfigs();
      const web = configs.find((c) => c.platform === "web")!;
      expect(web.fileExtension).toBe(".html");
    });

    test("windows has .exe extension", () => {
      const configs = getDefaultPlatformConfigs();
      const win = configs.find((c) => c.platform === "windows")!;
      expect(win.fileExtension).toBe(".exe");
    });

    test("linux has empty extension", () => {
      const configs = getDefaultPlatformConfigs();
      const linux = configs.find((c) => c.platform === "linux")!;
      expect(linux.fileExtension).toBe("");
    });

    test("macos has .dmg extension", () => {
      const configs = getDefaultPlatformConfigs();
      const mac = configs.find((c) => c.platform === "macos")!;
      expect(mac.fileExtension).toBe(".dmg");
    });

    test("each platform has a preset name", () => {
      const configs = getDefaultPlatformConfigs();
      for (const c of configs) {
        expect(c.preset.length).toBeGreaterThan(0);
      }
    });

    test("each platform has an output directory", () => {
      const configs = getDefaultPlatformConfigs();
      for (const c of configs) {
        expect(c.outputDir.length).toBeGreaterThan(0);
      }
    });

    test("each platform has a timeout", () => {
      const configs = getDefaultPlatformConfigs();
      for (const c of configs) {
        expect(c.timeout).toBeGreaterThan(0);
      }
    });
  });

  describe("getDefaultPlatformConfig", () => {
    test("returns web config", () => {
      const c = getDefaultPlatformConfig("web");
      expect(c.platform).toBe("web");
      expect(c.preset).toBe("Web");
    });

    test("returns windows config", () => {
      const c = getDefaultPlatformConfig("windows");
      expect(c.platform).toBe("windows");
      expect(c.preset).toBe("Windows Desktop");
    });

    test("returns linux config", () => {
      const c = getDefaultPlatformConfig("linux");
      expect(c.platform).toBe("linux");
      expect(c.preset).toBe("Linux");
    });

    test("returns macos config", () => {
      const c = getDefaultPlatformConfig("macos");
      expect(c.platform).toBe("macos");
      expect(c.preset).toBe("macOS");
    });

    test("returned config is always enabled", () => {
      for (const p of getSupportedPlatforms()) {
        expect(getDefaultPlatformConfig(p).enabled).toBe(true);
      }
    });
  });

  describe("getSupportedPlatforms", () => {
    test("returns four platforms", () => {
      expect(getSupportedPlatforms()).toHaveLength(4);
    });

    test("includes all expected platforms", () => {
      const platforms = getSupportedPlatforms();
      expect(platforms).toContain("web");
      expect(platforms).toContain("windows");
      expect(platforms).toContain("linux");
      expect(platforms).toContain("macos");
    });

    test("returns a new array each time", () => {
      const a = getSupportedPlatforms();
      const b = getSupportedPlatforms();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("getArtifactType", () => {
    test("web returns web-bundle", () => {
      expect(getArtifactType("web")).toBe("web-bundle");
    });

    test("windows returns executable", () => {
      expect(getArtifactType("windows")).toBe("executable");
    });

    test("linux returns executable", () => {
      expect(getArtifactType("linux")).toBe("executable");
    });

    test("macos returns installer", () => {
      expect(getArtifactType("macos")).toBe("installer");
    });
  });

  describe("validatePipelineConfig", () => {
    test("valid config passes validation", () => {
      const result = validatePipelineConfig(makeConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("missing projectId is an error", () => {
      const result = validatePipelineConfig({ ...makeConfig(), projectId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectId"))).toBe(true);
    });

    test("missing projectPath is an error", () => {
      const result = validatePipelineConfig({ ...makeConfig(), projectPath: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectPath"))).toBe(true);
    });

    test("empty platforms array is an error", () => {
      const result = validatePipelineConfig({ ...makeConfig(), platforms: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("At least one platform"))).toBe(true);
    });

    test("all disabled platforms is a warning", () => {
      const platforms = getDefaultPlatformConfigs().map((p) => ({ ...p, enabled: false }));
      const result = validatePipelineConfig({ ...makeConfig(), platforms });
      expect(result.warnings.some((w) => w.includes("No platforms are enabled"))).toBe(true);
    });

    test("duplicate platform is an error", () => {
      const platforms = [
        getDefaultPlatformConfig("web"),
        getDefaultPlatformConfig("web"),
      ];
      const result = validatePipelineConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    test("empty preset is an error", () => {
      const platforms = [{ ...getDefaultPlatformConfig("web"), preset: "" }];
      const result = validatePipelineConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("preset"))).toBe(true);
    });

    test("empty outputDir is an error", () => {
      const platforms = [{ ...getDefaultPlatformConfig("web"), outputDir: "" }];
      const result = validatePipelineConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("outputDir"))).toBe(true);
    });

    test("negative timeout is an error", () => {
      const platforms = [{ ...getDefaultPlatformConfig("web"), timeout: -1 }];
      const result = validatePipelineConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("timeout"))).toBe(true);
    });

    test("negative maxRetries is an error", () => {
      const result = validatePipelineConfig({ ...makeConfig(), maxRetries: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("maxRetries"))).toBe(true);
    });

    test("negative artifactRetention is an error", () => {
      const result = validatePipelineConfig({ ...makeConfig(), artifactRetention: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("artifactRetention"))).toBe(true);
    });

    test("zero maxRetries is valid", () => {
      const result = validatePipelineConfig(makeConfig({ maxRetries: 0 }));
      expect(result.valid).toBe(true);
    });

    test("missing platforms field is an error", () => {
      const result = validatePipelineConfig({
        projectId: "test",
        projectPath: "/test",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("initPipeline", () => {
    test("creates .build-pipeline directory structure", () => {
      const result = initPipeline(makeConfig());
      expect(result).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline"))).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline", "runs"))).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline", "artifacts"))).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline", "state.json"))).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline", "config.json"))).toBe(true);
    });

    test("returns false if already initialized", () => {
      initDefault();
      expect(initPipeline(makeConfig())).toBe(false);
    });

    test("saves config to disk", () => {
      initDefault({ defaultProfile: "debug" });
      const config = JSON.parse(readFileSync(join(testDir, ".build-pipeline", "config.json"), "utf-8"));
      expect(config.defaultProfile).toBe("debug");
    });

    test("initializes state correctly", () => {
      initDefault();
      const state = JSON.parse(readFileSync(join(testDir, ".build-pipeline", "state.json"), "utf-8"));
      expect(state.lastRunId).toBeNull();
      expect(state.lastRunTime).toBeNull();
      expect(state.totalRuns).toBe(0);
      expect(state.isRunning).toBe(false);
      expect(state.currentPlatform).toBeNull();
    });

    test("stores all four platform configs", () => {
      initDefault();
      const config = JSON.parse(readFileSync(join(testDir, ".build-pipeline", "config.json"), "utf-8"));
      expect(config.platforms).toHaveLength(4);
    });
  });

  describe("hasPipeline", () => {
    test("returns false for uninitialized project", () => {
      expect(hasPipeline(testDir)).toBe(false);
    });

    test("returns true after initialization", () => {
      initDefault();
      expect(hasPipeline(testDir)).toBe(true);
    });
  });

  describe("getState", () => {
    test("returns null for uninitialized project", () => {
      expect(getState(testDir)).toBeNull();
    });

    test("returns state after init", () => {
      initDefault();
      const state = getState(testDir);
      expect(state).not.toBeNull();
      expect(state!.config.projectId).toBe(PROJECT_ID);
      expect(state!.isRunning).toBe(false);
    });

    test("state has correct timestamps", () => {
      const before = Date.now();
      initDefault();
      const after = Date.now();
      const state = getState(testDir)!;
      expect(state.createdAt).toBeGreaterThanOrEqual(before);
      expect(state.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("updateConfig", () => {
    test("updates defaultProfile", () => {
      initDefault();
      const updated = updateConfig(testDir, { defaultProfile: "debug" });
      expect(updated.defaultProfile).toBe("debug");
      expect(getState(testDir)!.config.defaultProfile).toBe("debug");
    });

    test("updates maxRetries", () => {
      initDefault();
      const updated = updateConfig(testDir, { maxRetries: 3 });
      expect(updated.maxRetries).toBe(3);
    });

    test("preserves unmodified fields", () => {
      initDefault({ maxRetries: 2, parallelBuilds: true });
      updateConfig(testDir, { maxRetries: 5 });
      const state = getState(testDir)!;
      expect(state.config.parallelBuilds).toBe(true);
      expect(state.config.maxRetries).toBe(5);
    });

    test("throws if not initialized", () => {
      expect(() => updateConfig(testDir, { maxRetries: 1 })).toThrow("Build pipeline not initialized");
    });

    test("persists to config.json", () => {
      initDefault();
      updateConfig(testDir, { cleanBefore: true });
      const config = JSON.parse(readFileSync(join(testDir, ".build-pipeline", "config.json"), "utf-8"));
      expect(config.cleanBefore).toBe(true);
    });
  });

  describe("getEnabledPlatforms", () => {
    test("returns all enabled platforms", () => {
      initDefault();
      const enabled = getEnabledPlatforms(testDir);
      expect(enabled).toHaveLength(4);
    });

    test("returns empty for uninitialized project", () => {
      expect(getEnabledPlatforms(testDir)).toEqual([]);
    });

    test("excludes disabled platforms", () => {
      const platforms = getDefaultPlatformConfigs().map((p) =>
        p.platform === "web" ? { ...p, enabled: false } : p,
      );
      initDefault({ platforms });
      const enabled = getEnabledPlatforms(testDir);
      expect(enabled).toHaveLength(3);
      expect(enabled.some((p) => p.platform === "web")).toBe(false);
    });
  });

  describe("setPlatformEnabled", () => {
    test("disables a platform", () => {
      initDefault();
      const result = setPlatformEnabled(testDir, "web", false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
      expect(getEnabledPlatforms(testDir)).toHaveLength(3);
    });

    test("enables a disabled platform", () => {
      const platforms = getDefaultPlatformConfigs().map((p) =>
        p.platform === "linux" ? { ...p, enabled: false } : p,
      );
      initDefault({ platforms });
      setPlatformEnabled(testDir, "linux", true);
      expect(getEnabledPlatforms(testDir)).toHaveLength(4);
    });

    test("returns null for nonexistent platform", () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const result = setPlatformEnabled(testDir, "windows", true);
      expect(result).toBeNull();
    });

    test("throws if not initialized", () => {
      expect(() => setPlatformEnabled(testDir, "web", false)).toThrow("Build pipeline not initialized");
    });
  });

  describe("addPlatform", () => {
    test("adds a new platform", () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const added = addPlatform(testDir, getDefaultPlatformConfig("linux"));
      expect(added).toBe(true);
      expect(getEnabledPlatforms(testDir)).toHaveLength(2);
    });

    test("returns false for duplicate platform", () => {
      initDefault();
      const added = addPlatform(testDir, getDefaultPlatformConfig("web"));
      expect(added).toBe(false);
    });

    test("throws if not initialized", () => {
      expect(() => addPlatform(testDir, getDefaultPlatformConfig("web"))).toThrow("Build pipeline not initialized");
    });

    test("persists to state", () => {
      initDefault({ platforms: [] as PlatformConfig[] });
      addPlatform(testDir, getDefaultPlatformConfig("windows"));
      const state = getState(testDir)!;
      expect(state.config.platforms).toHaveLength(1);
      expect(state.config.platforms[0].platform).toBe("windows");
    });
  });

  describe("removePlatform", () => {
    test("removes an existing platform", () => {
      initDefault();
      const removed = removePlatform(testDir, "web");
      expect(removed).toBe(true);
      const state = getState(testDir)!;
      expect(state.config.platforms).toHaveLength(3);
      expect(state.config.platforms.some((p) => p.platform === "web")).toBe(false);
    });

    test("returns false for nonexistent platform", () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      expect(removePlatform(testDir, "linux")).toBe(false);
    });

    test("throws if not initialized", () => {
      expect(() => removePlatform(testDir, "web")).toThrow("Build pipeline not initialized");
    });
  });

  describe("createBuildMatrix", () => {
    test("creates matrix with all enabled platforms", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir);
      expect(matrix.platforms).toHaveLength(4);
      expect(matrix.profile).toBe("release");
      expect(matrix.triggeredBy).toBe("manual");
    });

    test("filters to specified platforms", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web", "linux"] });
      expect(matrix.platforms).toHaveLength(2);
      expect(matrix.platforms).toContain("web");
      expect(matrix.platforms).toContain("linux");
    });

    test("filters out disabled platforms from request", () => {
      const platforms = getDefaultPlatformConfigs().map((p) =>
        p.platform === "windows" ? { ...p, enabled: false } : p,
      );
      initDefault({ platforms });
      const matrix = createBuildMatrix(testDir, { platforms: ["web", "windows"] });
      expect(matrix.platforms).toHaveLength(1);
      expect(matrix.platforms).toContain("web");
    });

    test("uses specified profile", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { profile: "debug" });
      expect(matrix.profile).toBe("debug");
    });

    test("uses specified triggeredBy", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { triggeredBy: "ci" });
      expect(matrix.triggeredBy).toBe("ci");
    });

    test("includes tags", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { tags: ["v1.0", "stable"] });
      expect(matrix.tags).toEqual(["v1.0", "stable"]);
    });

    test("includes metadata", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { metadata: { branch: "main" } });
      expect(matrix.metadata).toEqual({ branch: "main" });
    });

    test("throws if not initialized", () => {
      expect(() => createBuildMatrix(testDir)).toThrow("Build pipeline not initialized");
    });

    test("includes overrides", () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, {
        overrides: { web: { timeout: 999 } },
      });
      expect(matrix.overrides?.web?.timeout).toBe(999);
    });
  });

  describe("executeBuild", () => {
    test("dry-run succeeds for all platforms", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir);
      const run = await executeBuild(testDir, matrix);

      expect(run.id).toMatch(/^[a-f0-9]{12}$/);
      expect(run.status).toBe("succeeded");
      expect(run.results).toHaveLength(4);
      expect(run.results.every((r) => r.status === "succeeded")).toBe(true);
    });

    test("dry-run produces artifacts for all platforms", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir);
      const run = await executeBuild(testDir, matrix);

      for (const result of run.results) {
        expect(result.artifact).toBeDefined();
        expect(result.artifact!.hash.length).toBeGreaterThan(0);
      }
    });

    test("executor callback controls success/failure", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix, async (platform) => ({
        success: false,
        error: `${platform} build failed`,
        logs: ["step 1", "step 2 failed"],
      }));

      expect(run.status).toBe("failed");
      expect(run.results[0].status).toBe("failed");
      expect(run.results[0].error).toContain("web build failed");
    });

    test("successful executor produces artifact", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["linux"] });
      const run = await executeBuild(testDir, matrix, async () => ({
        success: true,
        logs: ["compiled"],
        artifactSize: 1024,
      }));

      expect(run.results[0].status).toBe("succeeded");
      expect(run.results[0].artifact).toBeDefined();
      expect(run.results[0].artifact!.size).toBe(1024);
    });

    test("retries on failure", async () => {
      initDefault({ maxRetries: 2 });
      let attempts = 0;
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix, async () => {
        attempts++;
        if (attempts < 3) return { success: false, error: "retry" };
        return { success: true, logs: ["ok"] };
      });

      expect(attempts).toBe(3);
      expect(run.results[0].status).toBe("succeeded");
    });

    test("respects maxRetries limit", async () => {
      initDefault({ maxRetries: 1 });
      let attempts = 0;
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix, async () => {
        attempts++;
        return { success: false, error: "always fails" };
      });

      expect(attempts).toBe(2);
      expect(run.results[0].status).toBe("failed");
    });

    test("handles executor throwing exceptions", async () => {
      initDefault({ maxRetries: 0 });
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix, async () => {
        throw new Error("unexpected crash");
      });

      expect(run.results[0].status).toBe("failed");
      expect(run.results[0].logs.some((l) => l.includes("unexpected crash"))).toBe(true);
    });

    test("skips unconfigured platforms", async () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const matrix: BuildMatrix = {
        platforms: ["web", "linux"],
        profile: "release",
        triggeredBy: "test",
      };
      const run = await executeBuild(testDir, matrix);

      expect(run.results).toHaveLength(2);
      const webResult = run.results.find((r) => r.platform === "web")!;
      const linuxResult = run.results.find((r) => r.platform === "linux")!;
      expect(webResult.status).toBe("succeeded");
      expect(linuxResult.status).toBe("skipped");
    });

    test("updates state after build", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix);

      const state = getState(testDir)!;
      expect(state.lastRunId).toBe(run.id);
      expect(state.totalRuns).toBe(1);
      expect(state.isRunning).toBe(false);
      expect(state.currentPlatform).toBeNull();
    });

    test("persists run to disk", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix);

      const runPath = join(testDir, ".build-pipeline", "runs", `${run.id}.json`);
      expect(existsSync(runPath)).toBe(true);
    });

    test("throws if already running", async () => {
      initDefault();
      const state = getState(testDir)!;
      state.isRunning = true;
      writeFileSync(
        join(testDir, ".build-pipeline", "state.json"),
        JSON.stringify(state, null, 2),
        "utf-8",
      );

      const matrix = createBuildMatrix(testDir);
      expect(executeBuild(testDir, matrix)).rejects.toThrow("already running");
    });

    test("throws if not initialized", async () => {
      const matrix: BuildMatrix = { platforms: ["web"], profile: "release", triggeredBy: "test" };
      expect(executeBuild(testDir, matrix)).rejects.toThrow("Build pipeline not initialized");
    });

    test("records duration", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix);

      expect(run.duration).toBeGreaterThanOrEqual(0);
      expect(run.results[0].duration).toBeGreaterThanOrEqual(0);
    });

    test("records tags and metadata", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, {
        platforms: ["web"],
        tags: ["v1"],
        metadata: { ci: true },
      });
      const run = await executeBuild(testDir, matrix);

      expect(run.tags).toEqual(["v1"]);
      expect(run.metadata).toEqual({ ci: true });
    });

    test("mixed success/failure results in failed status", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web", "linux"] });
      const run = await executeBuild(testDir, matrix, async (platform) => {
        if (platform === "web") return { success: true, logs: ["ok"] };
        return { success: false, error: "linux failed" };
      });

      expect(run.status).toBe("failed");
    });

    test("all skipped + succeeded = succeeded", async () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const matrix: BuildMatrix = {
        platforms: ["web", "linux"],
        profile: "release",
        triggeredBy: "test",
      };
      const run = await executeBuild(testDir, matrix);

      expect(run.status).toBe("succeeded");
    });

    test("applies platform overrides", async () => {
      initDefault();
      let receivedConfig: PlatformConfig | null = null;
      const matrix = createBuildMatrix(testDir, {
        platforms: ["web"],
        overrides: { web: { timeout: 999 } },
      });
      const run = await executeBuild(testDir, matrix, async (_platform, config) => {
        receivedConfig = config;
        return { success: true };
      });

      expect(receivedConfig).not.toBeNull();
      expect(receivedConfig!.timeout).toBe(999);
    });

    test("enforces artifactRetention", async () => {
      initDefault({ artifactRetention: 2 });
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });

      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(2);
    });

    test("onProgress fires during build", async () => {
      const messages: string[] = [];
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      await executeBuild(testDir, matrix, undefined, (_platform, msg) => messages.push(msg));

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.includes("Starting build"))).toBe(true);
    });

    test("handles non-Error thrown exceptions", async () => {
      initDefault({ maxRetries: 0 });
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const run = await executeBuild(testDir, matrix, async () => {
        throw "string error";
      });

      expect(run.results[0].status).toBe("failed");
    });

    test("multiple sequential builds increment totalRuns", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });

      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);

      expect(getState(testDir)!.totalRuns).toBe(2);
    });
  });

  describe("cancelBuild", () => {
    test("cancels a running build", () => {
      initDefault();
      const state = getState(testDir)!;
      state.isRunning = true;
      state.currentPlatform = "web";
      writeFileSync(
        join(testDir, ".build-pipeline", "state.json"),
        JSON.stringify(state, null, 2),
        "utf-8",
      );

      const result = cancelBuild(testDir);
      expect(result).toBe(true);
      expect(getState(testDir)!.isRunning).toBe(false);
      expect(getState(testDir)!.currentPlatform).toBeNull();
    });

    test("returns false if no build is running", () => {
      initDefault();
      expect(cancelBuild(testDir)).toBe(false);
    });

    test("throws if not initialized", () => {
      expect(() => cancelBuild(testDir)).toThrow("Build pipeline not initialized");
    });
  });

  describe("getRun", () => {
    test("retrieves a stored run", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const original = await executeBuild(testDir, matrix);

      const retrieved = getRun(testDir, original.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(original.id);
      expect(retrieved!.status).toBe(original.status);
    });

    test("returns null for nonexistent run", () => {
      initDefault();
      expect(getRun(testDir, "nonexistent")).toBeNull();
    });
  });

  describe("getHistory", () => {
    test("returns empty for no runs", () => {
      initDefault();
      const history = getHistory(testDir);
      expect(history.runs).toEqual([]);
      expect(history.totalCount).toBe(0);
    });

    test("returns runs newest-first", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const r1 = await executeBuild(testDir, matrix);
      await Bun.sleep(5);
      const r2 = await executeBuild(testDir, matrix);

      const history = getHistory(testDir);
      expect(history.runs[0].id).toBe(r2.id);
      expect(history.runs[1].id).toBe(r1.id);
    });

    test("filters by platform", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["linux"] }));

      const history = getHistory(testDir, { platform: "web" });
      expect(history.totalCount).toBe(1);
      expect(history.runs[0].platforms).toContain("web");
    });

    test("filters by status", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }), async () => ({
        success: false,
        error: "fail",
      }));

      const history = getHistory(testDir, { status: "succeeded" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by profile", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"], profile: "release" }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"], profile: "debug" }));

      const history = getHistory(testDir, { profile: "debug" });
      expect(history.totalCount).toBe(1);
      expect(history.runs[0].profile).toBe("debug");
    });

    test("filters by triggeredBy", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"], triggeredBy: "ci" }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"], triggeredBy: "manual" }));

      const history = getHistory(testDir, { triggeredBy: "ci" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by search text", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }), async () => ({
        success: true,
        logs: ["Building game assets"],
      }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["linux"] }), async () => ({
        success: true,
        logs: ["Compiling binary"],
      }));

      const history = getHistory(testDir, { search: "binary" });
      expect(history.totalCount).toBe(1);
    });

    test("applies limit and offset", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);

      const page = getHistory(testDir, { limit: 1, offset: 1 });
      expect(page.runs).toHaveLength(1);
      expect(page.totalCount).toBe(3);
    });

    test("returns empty for uninitialized project", () => {
      const history = getHistory(testDir);
      expect(history.runs).toEqual([]);
    });

    test("filters by since timestamp", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      await executeBuild(testDir, matrix);

      await Bun.sleep(5);
      const cutoff = Date.now();
      await Bun.sleep(5);

      const r2 = await executeBuild(testDir, matrix);
      const history = getHistory(testDir, { since: cutoff });
      expect(history.totalCount).toBe(1);
      expect(history.runs[0].id).toBe(r2.id);
    });

    test("filters by until timestamp", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      const r1 = await executeBuild(testDir, matrix);

      await Bun.sleep(5);
      const cutoff = Date.now();
      await Bun.sleep(5);

      await executeBuild(testDir, matrix);
      const history = getHistory(testDir, { until: cutoff });
      expect(history.totalCount).toBe(1);
      expect(history.runs[0].id).toBe(r1.id);
    });
  });

  describe("getStats", () => {
    test("returns null for uninitialized project", () => {
      expect(getStats(testDir)).toBeNull();
    });

    test("returns zero stats for empty history", () => {
      initDefault();
      const stats = getStats(testDir)!;
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalBuilds).toBe(0);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });

    test("computes accurate success stats", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["linux"] }), async () => ({
        success: false,
        error: "fail",
      }));

      const stats = getStats(testDir)!;
      expect(stats.totalRuns).toBe(2);
      expect(stats.totalBuilds).toBe(2);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(1);
    });

    test("computes platform counts", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web", "linux"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const stats = getStats(testDir)!;
      expect(stats.platformCounts["web"]).toBe(2);
      expect(stats.platformCounts["linux"]).toBe(1);
    });

    test("computes platform success rates", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }), async () => ({
        success: false,
        error: "fail",
      }));

      const stats = getStats(testDir)!;
      expect(stats.platformSuccessRates["web"]).toBe(50);
    });

    test("computes average duration", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const stats = getStats(testDir)!;
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    test("tracks first and last run", async () => {
      initDefault();
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      await Bun.sleep(5);
      await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const stats = getStats(testDir)!;
      expect(stats.firstRun).toBeGreaterThan(0);
      expect(stats.lastRun).toBeGreaterThanOrEqual(stats.firstRun!);
    });

    test("counts skipped builds", async () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const matrix: BuildMatrix = {
        platforms: ["web", "linux"],
        profile: "release",
        triggeredBy: "test",
      };
      await executeBuild(testDir, matrix);

      const stats = getStats(testDir)!;
      expect(stats.skipped).toBe(1);
    });
  });

  describe("getPlatformResult", () => {
    test("returns result for matching platform", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir));

      const webResult = getPlatformResult(run, "web");
      expect(webResult).not.toBeNull();
      expect(webResult!.platform).toBe("web");
    });

    test("returns null for non-matching platform", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      expect(getPlatformResult(run, "linux")).toBeNull();
    });
  });

  describe("isRunSuccessful", () => {
    test("returns true when all succeeded", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      expect(isRunSuccessful(run)).toBe(true);
    });

    test("returns true when mix of succeeded and skipped", async () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const matrix: BuildMatrix = {
        platforms: ["web", "linux"],
        profile: "release",
        triggeredBy: "test",
      };
      const run = await executeBuild(testDir, matrix);
      expect(isRunSuccessful(run)).toBe(true);
    });

    test("returns false when any failed", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web"] }),
        async () => ({ success: false, error: "fail" }),
      );
      expect(isRunSuccessful(run)).toBe(false);
    });
  });

  describe("getFailedPlatforms", () => {
    test("returns failed platforms", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web", "linux"] }),
        async (platform) => {
          if (platform === "linux") return { success: false, error: "fail" };
          return { success: true };
        },
      );

      expect(getFailedPlatforms(run)).toEqual(["linux"]);
    });

    test("returns empty when all succeeded", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));
      expect(getFailedPlatforms(run)).toEqual([]);
    });
  });

  describe("getSucceededPlatforms", () => {
    test("returns succeeded platforms", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web", "linux"] }),
        async (platform) => {
          if (platform === "web") return { success: true };
          return { success: false, error: "fail" };
        },
      );

      expect(getSucceededPlatforms(run)).toEqual(["web"]);
    });
  });

  describe("getRunArtifacts", () => {
    test("returns artifacts from successful builds", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web", "linux"] }));

      const artifacts = getRunArtifacts(run);
      expect(artifacts).toHaveLength(2);
      expect(artifacts.every((a) => a.hash.length > 0)).toBe(true);
    });

    test("excludes failed builds", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web", "linux"] }),
        async (platform) => {
          if (platform === "linux") return { success: false, error: "fail" };
          return { success: true };
        },
      );

      const artifacts = getRunArtifacts(run);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].platform).toBe("web");
    });

    test("returns empty for all-failed run", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web"] }),
        async () => ({ success: false, error: "fail" }),
      );
      expect(getRunArtifacts(run)).toEqual([]);
    });
  });

  describe("pruneRuns", () => {
    test("removes old runs beyond keepCount", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);
      await executeBuild(testDir, matrix);

      const deleted = pruneRuns(testDir, 2);
      expect(deleted).toBe(1);
      expect(getHistory(testDir).totalCount).toBe(2);
    });

    test("does nothing when within limit", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });
      await executeBuild(testDir, matrix);

      expect(pruneRuns(testDir, 10)).toBe(0);
    });

    test("handles empty history", () => {
      initDefault();
      expect(pruneRuns(testDir, 5)).toBe(0);
    });
  });

  describe("formatRunOneline", () => {
    test("includes short ID and platforms", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const line = formatRunOneline(run);
      expect(line).toContain(run.id.slice(0, 7));
      expect(line).toContain("web");
    });

    test("shows success icon for succeeded", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const line = formatRunOneline(run);
      expect(line).toContain("[+]");
    });

    test("shows failure icon for failed", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web"] }),
        async () => ({ success: false, error: "fail" }),
      );

      const line = formatRunOneline(run);
      expect(line).toContain("[x]");
    });

    test("includes profile", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const line = formatRunOneline(run);
      expect(line).toContain("release");
    });

    test("includes duration", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const line = formatRunOneline(run);
      expect(line).toMatch(/\d+\.\d+s/);
    });
  });

  describe("formatRunFull", () => {
    test("includes all run details", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, {
        platforms: ["web"],
        tags: ["v1"],
      }));

      const full = formatRunFull(run);
      expect(full).toContain(`Build ${run.id}`);
      expect(full).toContain("succeeded");
      expect(full).toContain("release");
      expect(full).toContain("web");
      expect(full).toContain("Tags:");
      expect(full).toContain("v1");
    });

    test("shows per-platform results", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web", "linux"] }));

      const full = formatRunFull(run);
      expect(full).toContain("web: succeeded");
      expect(full).toContain("linux: succeeded");
    });

    test("shows error for failed platform", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web"] }),
        async () => ({ success: false, error: "compilation error" }),
      );

      const full = formatRunFull(run);
      expect(full).toContain("Error: compilation error");
    });

    test("omits tags line when no tags", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const full = formatRunFull(run);
      expect(full).not.toContain("Tags:");
    });

    test("shows artifact info", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web"] }));

      const full = formatRunFull(run);
      expect(full).toContain("Artifact:");
    });
  });

  describe("generateBuildSummary", () => {
    test("summarizes all succeeded", async () => {
      initDefault();
      const run = await executeBuild(testDir, createBuildMatrix(testDir, { platforms: ["web", "linux"] }));

      const summary = generateBuildSummary(run);
      expect(summary).toContain("2 succeeded");
      expect(summary).toContain("2 total");
      expect(summary).toContain(run.id.slice(0, 7));
    });

    test("summarizes mixed results", async () => {
      initDefault();
      const run = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web", "linux"] }),
        async (platform) => {
          if (platform === "web") return { success: true };
          return { success: false, error: "fail" };
        },
      );

      const summary = generateBuildSummary(run);
      expect(summary).toContain("1 succeeded");
      expect(summary).toContain("1 failed");
    });

    test("shows skipped count", async () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      const matrix: BuildMatrix = {
        platforms: ["web", "linux"],
        profile: "release",
        triggeredBy: "test",
      };
      const run = await executeBuild(testDir, matrix);

      const summary = generateBuildSummary(run);
      expect(summary).toContain("1 succeeded");
      expect(summary).toContain("1 skipped");
    });
  });

  describe("destroyPipeline", () => {
    test("removes entire .build-pipeline directory", () => {
      initDefault();
      expect(destroyPipeline(testDir)).toBe(true);
      expect(existsSync(join(testDir, ".build-pipeline"))).toBe(false);
    });

    test("returns false when not initialized", () => {
      expect(destroyPipeline(testDir)).toBe(false);
    });

    test("project directory remains intact", () => {
      initDefault();
      destroyPipeline(testDir);
      expect(existsSync(testDir)).toBe(true);
    });
  });

  describe("integration: full workflow", () => {
    test("init -> configure -> build -> query -> stats -> destroy", async () => {
      expect(initPipeline(makeConfig())).toBe(true);
      expect(hasPipeline(testDir)).toBe(true);

      setPlatformEnabled(testDir, "macos", false);
      expect(getEnabledPlatforms(testDir)).toHaveLength(3);

      const matrix = createBuildMatrix(testDir);
      expect(matrix.platforms).toHaveLength(3);
      expect(matrix.platforms).not.toContain("macos");

      const run = await executeBuild(testDir, matrix);
      expect(run.status).toBe("succeeded");
      expect(run.results).toHaveLength(3);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(1);

      const stats = getStats(testDir)!;
      expect(stats.totalRuns).toBe(1);
      expect(stats.succeeded).toBe(3);

      const retrieved = getRun(testDir, run.id);
      expect(retrieved).not.toBeNull();

      expect(destroyPipeline(testDir)).toBe(true);
      expect(hasPipeline(testDir)).toBe(false);
    });

    test("multi-run with retries and failure recovery", async () => {
      initDefault({ maxRetries: 1 });

      let failCount = 0;
      const run1 = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["web", "linux"] }),
        async (platform) => {
          if (platform === "linux") {
            failCount++;
            if (failCount <= 2) return { success: false, error: "flaky" };
          }
          return { success: true, logs: ["ok"], artifactSize: 512 };
        },
      );

      expect(run1.results.find((r) => r.platform === "web")!.status).toBe("succeeded");
      expect(run1.results.find((r) => r.platform === "linux")!.status).toBe("failed");

      failCount = 0;
      const run2 = await executeBuild(
        testDir,
        createBuildMatrix(testDir, { platforms: ["linux"] }),
        async () => ({ success: true, logs: ["retry ok"], artifactSize: 1024 }),
      );

      expect(run2.results[0].status).toBe("succeeded");
      expect(getState(testDir)!.totalRuns).toBe(2);
    });

    test("config update mid-session affects next build", async () => {
      initDefault({ defaultProfile: "release" });

      const matrix1 = createBuildMatrix(testDir);
      expect(matrix1.profile).toBe("release");

      updateConfig(testDir, { defaultProfile: "debug" });

      const matrix2 = createBuildMatrix(testDir);
      expect(matrix2.profile).toBe("debug");
    });

    test("add and remove platforms dynamically", () => {
      initDefault({ platforms: [getDefaultPlatformConfig("web")] });
      expect(getEnabledPlatforms(testDir)).toHaveLength(1);

      addPlatform(testDir, getDefaultPlatformConfig("linux"));
      expect(getEnabledPlatforms(testDir)).toHaveLength(2);

      removePlatform(testDir, "web");
      expect(getEnabledPlatforms(testDir)).toHaveLength(1);
      expect(getEnabledPlatforms(testDir)[0].platform).toBe("linux");
    });

    test("pruning keeps only recent runs", async () => {
      initDefault();
      const matrix = createBuildMatrix(testDir, { platforms: ["web"] });

      await executeBuild(testDir, matrix);
      await Bun.sleep(5);
      await executeBuild(testDir, matrix);
      await Bun.sleep(5);
      const r3 = await executeBuild(testDir, matrix);

      pruneRuns(testDir, 1);

      const history = getHistory(testDir);
      expect(history.totalCount).toBe(1);
      expect(history.runs[0].id).toBe(r3.id);
    });

    test("build with all platforms disabled produces empty matrix", () => {
      const platforms = getDefaultPlatformConfigs().map((p) => ({ ...p, enabled: false }));
      initDefault({ platforms });

      const matrix = createBuildMatrix(testDir);
      expect(matrix.platforms).toHaveLength(0);
    });

    test("build matrix with overrides", async () => {
      initDefault();
      const configs: Record<string, number> = {};

      const matrix = createBuildMatrix(testDir, {
        platforms: ["web", "linux"],
        overrides: {
          web: { timeout: 5000 },
          linux: { timeout: 10000 },
        },
      });

      await executeBuild(testDir, matrix, async (platform, config) => {
        configs[platform] = config.timeout!;
        return { success: true };
      });

      expect(configs["web"]).toBe(5000);
      expect(configs["linux"]).toBe(10000);
    });
  });
});
