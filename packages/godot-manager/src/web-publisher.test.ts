import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  type WebPublishConfig,
  type WebPlatform,
  type WebPlatformConfig,
  type WebPublishRun,
  type NetlifyConfig,
  type VercelConfig,
  type GhPagesConfig,
  type S3Config,
  type CloudflarePagesConfig,
  getDefaultPlatforms,
  getSupportedPlatformNames,
  isNetlifyConfig,
  isVercelConfig,
  isGhPagesConfig,
  isS3Config,
  isCloudfarePagesConfig,
  checkWebAuth,
  validateWebPublishConfig,
  buildNetlifyDeployArgs,
  buildVercelDeployArgs,
  buildGhPagesDeployArgs,
  buildS3DeployArgs,
  buildDeployArgs,
  initWebPublisher,
  hasWebPublisher,
  getWebPublishState,
  updateWebPublishConfig,
  getEnabledPlatforms,
  setPlatformEnabled,
  addPlatform,
  removePlatform,
  executeWebPublish,
  cancelWebPublish,
  getWebRun,
  getWebHistory,
  getWebStats,
  getPlatformResult,
  isWebRunSuccessful,
  getFailedPlatforms,
  getSucceededPlatforms,
  pruneWebRuns,
  formatWebRunOneline,
  formatWebRunFull,
  generateWebPublishSummary,
  destroyWebPublisher,
} from "./web-publisher";

let testDir: string;
const PROJECT_ID = "test-web-project";

function makeNetlifyConfig(): NetlifyConfig {
  return { siteId: "site-123", authToken: "token-abc", production: false };
}

function makeGhPagesConf(): GhPagesConfig {
  return { repo: "user/repo", branch: "gh-pages", nojekyll: true };
}

function makeVercelConf(): VercelConfig {
  return { projectId: "prj-123", token: "tok-abc", production: false };
}

function makeS3Conf(): S3Config {
  return { bucket: "my-bucket", region: "us-east-1", acl: "public-read" };
}

function makeCfPagesConf(): CloudflarePagesConfig {
  return { projectName: "my-pages", apiToken: "cf-tok", accountId: "acc-123" };
}

function makeDefaultPlatforms(): WebPlatformConfig[] {
  return [
    { platform: "netlify", enabled: true, directory: "exports/web", platformConfig: makeNetlifyConfig() },
    { platform: "gh-pages", enabled: true, directory: "exports/web", platformConfig: makeGhPagesConf() },
  ];
}

function makeConfig(overrides?: Partial<WebPublishConfig>): WebPublishConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    platforms: makeDefaultPlatforms(),
    uploadTimeout: 300_000,
    publishRetention: 0,
    ...overrides,
  };
}

function initDefault(overrides?: Partial<WebPublishConfig>): void {
  initWebPublisher(makeConfig(overrides));
}

beforeEach(() => {
  const id = `web-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("web-publisher", () => {

  // ─── getDefaultPlatforms ──────────────────────────────────────────────

  describe("getDefaultPlatforms", () => {
    test("returns two platforms", () => {
      expect(getDefaultPlatforms()).toHaveLength(2);
    });

    test("all defaults are enabled", () => {
      for (const p of getDefaultPlatforms()) {
        expect(p.enabled).toBe(true);
      }
    });

    test("includes netlify", () => {
      expect(getDefaultPlatforms().some((p) => p.platform === "netlify")).toBe(true);
    });

    test("includes gh-pages", () => {
      expect(getDefaultPlatforms().some((p) => p.platform === "gh-pages")).toBe(true);
    });

    test("each platform has a directory", () => {
      for (const p of getDefaultPlatforms()) {
        expect(p.directory.length).toBeGreaterThan(0);
      }
    });

    test("returns a new array each call", () => {
      const a = getDefaultPlatforms();
      const b = getDefaultPlatforms();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── getSupportedPlatformNames ────────────────────────────────────────

  describe("getSupportedPlatformNames", () => {
    test("returns five platforms", () => {
      expect(getSupportedPlatformNames()).toHaveLength(5);
    });

    test("includes all expected platforms", () => {
      const names = getSupportedPlatformNames();
      expect(names).toContain("netlify");
      expect(names).toContain("vercel");
      expect(names).toContain("gh-pages");
      expect(names).toContain("s3");
      expect(names).toContain("cloudflare-pages");
    });

    test("returns a new array each call", () => {
      const a = getSupportedPlatformNames();
      const b = getSupportedPlatformNames();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── type guards ──────────────────────────────────────────────────────

  describe("isNetlifyConfig", () => {
    test("returns true for netlify config", () => {
      expect(isNetlifyConfig(makeNetlifyConfig())).toBe(true);
    });

    test("returns false for s3 config", () => {
      expect(isNetlifyConfig(makeS3Conf())).toBe(false);
    });
  });

  describe("isVercelConfig", () => {
    test("returns true for vercel config", () => {
      expect(isVercelConfig(makeVercelConf())).toBe(true);
    });

    test("returns false for netlify config", () => {
      expect(isVercelConfig(makeNetlifyConfig())).toBe(false);
    });
  });

  describe("isGhPagesConfig", () => {
    test("returns true for gh-pages config", () => {
      expect(isGhPagesConfig(makeGhPagesConf())).toBe(true);
    });

    test("returns false for s3 config", () => {
      expect(isGhPagesConfig(makeS3Conf())).toBe(false);
    });
  });

  describe("isS3Config", () => {
    test("returns true for s3 config", () => {
      expect(isS3Config(makeS3Conf())).toBe(true);
    });

    test("returns false for netlify config", () => {
      expect(isS3Config(makeNetlifyConfig())).toBe(false);
    });
  });

  describe("isCloudfarePagesConfig", () => {
    test("returns true for cloudflare pages config", () => {
      expect(isCloudfarePagesConfig(makeCfPagesConf())).toBe(true);
    });

    test("returns false for s3 config", () => {
      expect(isCloudfarePagesConfig(makeS3Conf())).toBe(false);
    });
  });

  // ─── checkWebAuth ─────────────────────────────────────────────────────

  describe("checkWebAuth", () => {
    test("netlify authenticated with token and siteId", () => {
      const result = checkWebAuth("netlify", makeNetlifyConfig());
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("site-123");
    });

    test("netlify not authenticated without token", () => {
      const result = checkWebAuth("netlify", { ...makeNetlifyConfig(), authToken: undefined });
      expect(result.authenticated).toBe(false);
    });

    test("vercel authenticated with token and projectId", () => {
      const result = checkWebAuth("vercel", makeVercelConf());
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("prj-123");
    });

    test("vercel not authenticated without token", () => {
      const result = checkWebAuth("vercel", { ...makeVercelConf(), token: undefined });
      expect(result.authenticated).toBe(false);
    });

    test("gh-pages authenticated with repo", () => {
      const result = checkWebAuth("gh-pages", makeGhPagesConf());
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("user/repo");
    });

    test("gh-pages not authenticated without repo", () => {
      const result = checkWebAuth("gh-pages", { ...makeGhPagesConf(), repo: "" });
      expect(result.authenticated).toBe(false);
    });

    test("s3 authenticated with bucket and region", () => {
      const result = checkWebAuth("s3", makeS3Conf());
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("my-bucket");
    });

    test("s3 not authenticated without bucket", () => {
      const result = checkWebAuth("s3", { ...makeS3Conf(), bucket: "" });
      expect(result.authenticated).toBe(false);
    });

    test("cloudflare authenticated with projectName and apiToken", () => {
      const result = checkWebAuth("cloudflare-pages", makeCfPagesConf());
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("my-pages");
    });

    test("cloudflare not authenticated without apiToken", () => {
      const result = checkWebAuth("cloudflare-pages", { ...makeCfPagesConf(), apiToken: undefined });
      expect(result.authenticated).toBe(false);
    });

    test("unknown platform returns not authenticated", () => {
      const result = checkWebAuth("unknown-platform", {} as any);
      expect(result.authenticated).toBe(false);
    });
  });

  // ─── validateWebPublishConfig ─────────────────────────────────────────

  describe("validateWebPublishConfig", () => {
    test("valid config passes validation", () => {
      const result = validateWebPublishConfig(makeConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("missing projectId is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), projectId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectId"))).toBe(true);
    });

    test("missing projectPath is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), projectPath: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectPath"))).toBe(true);
    });

    test("empty platforms array is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), platforms: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("At least one platform"))).toBe(true);
    });

    test("duplicate platforms is an error", () => {
      const platforms: WebPlatformConfig[] = [
        { platform: "netlify", enabled: true, directory: "a", platformConfig: makeNetlifyConfig() },
        { platform: "netlify", enabled: true, directory: "b", platformConfig: makeNetlifyConfig() },
      ];
      const result = validateWebPublishConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    test("empty platform name is an error", () => {
      const platforms: WebPlatformConfig[] = [
        { platform: "", enabled: true, directory: "a", platformConfig: makeNetlifyConfig() },
      ];
      const result = validateWebPublishConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    test("empty platform directory is an error", () => {
      const platforms: WebPlatformConfig[] = [
        { platform: "netlify", enabled: true, directory: "", platformConfig: makeNetlifyConfig() },
      ];
      const result = validateWebPublishConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("directory"))).toBe(true);
    });

    test("no enabled platforms is a warning", () => {
      const platforms = makeDefaultPlatforms().map((p) => ({ ...p, enabled: false }));
      const result = validateWebPublishConfig({ ...makeConfig(), platforms });
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("enabled"))).toBe(true);
    });

    test("negative uploadTimeout is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), uploadTimeout: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("uploadTimeout"))).toBe(true);
    });

    test("zero uploadTimeout is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), uploadTimeout: 0 });
      expect(result.valid).toBe(false);
    });

    test("negative publishRetention is an error", () => {
      const result = validateWebPublishConfig({ ...makeConfig(), publishRetention: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("publishRetention"))).toBe(true);
    });

    test("zero publishRetention is valid", () => {
      const result = validateWebPublishConfig(makeConfig({ publishRetention: 0 }));
      expect(result.valid).toBe(true);
    });
  });

  // ─── buildNetlifyDeployArgs ───────────────────────────────────────────

  describe("buildNetlifyDeployArgs", () => {
    test("includes deploy command", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig);
      expect(args[0]).toBe("deploy");
    });

    test("includes --dir", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig);
      expect(args).toContain("--dir");
    });

    test("includes --site when siteId set", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig);
      expect(args).toContain("--site");
      expect(args).toContain("site-123");
    });

    test("includes --auth when authToken set", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig);
      expect(args).toContain("--auth");
      expect(args).toContain("token-abc");
    });

    test("includes --prod when production is true", () => {
      const platConfig: WebPlatformConfig = {
        platform: "netlify",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeNetlifyConfig(), production: true },
      };
      const args = buildNetlifyDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--prod");
    });

    test("omits --prod when production is false", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig);
      expect(args).not.toContain("--prod");
    });

    test("omits --prod on dryRun even if production", () => {
      const platConfig: WebPlatformConfig = {
        platform: "netlify",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeNetlifyConfig(), production: true },
      };
      const args = buildNetlifyDeployArgs(makeConfig(), platConfig, { dryRun: true });
      expect(args).not.toContain("--prod");
    });

    test("includes --functions when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "netlify",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeNetlifyConfig(), functions: "functions" },
      };
      const args = buildNetlifyDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--functions");
      expect(args).toContain("functions");
    });

    test("includes --message when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "netlify",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeNetlifyConfig(), message: "Deploy v1" },
      };
      const args = buildNetlifyDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--message");
      expect(args).toContain("Deploy v1");
    });

    test("includes --build on dryRun", () => {
      const config = makeConfig();
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildNetlifyDeployArgs(config, platConfig, { dryRun: true });
      expect(args).toContain("--build");
    });
  });

  // ─── buildVercelDeployArgs ────────────────────────────────────────────

  describe("buildVercelDeployArgs", () => {
    test("includes deploy command", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      const args = buildVercelDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
    });

    test("includes --token when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      const args = buildVercelDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--token");
      expect(args).toContain("tok-abc");
    });

    test("includes --prod when production is true", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeVercelConf(), production: true },
      };
      const args = buildVercelDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--prod");
    });

    test("omits --prod on dryRun", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeVercelConf(), production: true },
      };
      const args = buildVercelDeployArgs(makeConfig(), platConfig, { dryRun: true });
      expect(args).not.toContain("--prod");
    });

    test("includes --yes", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      const args = buildVercelDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--yes");
    });
  });

  // ─── buildGhPagesDeployArgs ───────────────────────────────────────────

  describe("buildGhPagesDeployArgs", () => {
    test("includes deploy command", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeGhPagesConf(),
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
    });

    test("includes --dir", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeGhPagesConf(),
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--dir");
    });

    test("includes --branch", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeGhPagesConf(),
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--branch");
      expect(args).toContain("gh-pages");
    });

    test("includes --repo", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeGhPagesConf(),
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--repo");
      expect(args).toContain("user/repo");
    });

    test("includes --nojekyll", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeGhPagesConf(),
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--nojekyll");
    });

    test("includes --message when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "gh-pages",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeGhPagesConf(), message: "Deploy" },
      };
      const args = buildGhPagesDeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--message");
      expect(args).toContain("Deploy");
    });
  });

  // ─── buildS3DeployArgs ────────────────────────────────────────────────

  describe("buildS3DeployArgs", () => {
    test("includes s3 sync command", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("s3");
      expect(args[1]).toBe("sync");
    });

    test("includes s3 bucket target", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args.some((a) => a.includes("s3://my-bucket"))).toBe(true);
    });

    test("includes --region", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--region");
      expect(args).toContain("us-east-1");
    });

    test("includes --acl when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--acl");
      expect(args).toContain("public-read");
    });

    test("includes --dryrun when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig, { dryRun: true });
      expect(args).toContain("--dryrun");
    });

    test("includes --delete", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--delete");
    });

    test("includes prefix in target path", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeS3Conf(), prefix: "games/mygame" },
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args.some((a) => a.includes("games/mygame"))).toBe(true);
    });

    test("includes --cache-control when set", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: { ...makeS3Conf(), cacheControl: "max-age=3600" },
      };
      const args = buildS3DeployArgs(makeConfig(), platConfig);
      expect(args).toContain("--cache-control");
      expect(args).toContain("max-age=3600");
    });
  });

  // ─── buildDeployArgs ──────────────────────────────────────────────────

  describe("buildDeployArgs", () => {
    test("dispatches to netlify builder", () => {
      const platConfig = makeDefaultPlatforms()[0];
      const args = buildDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
      expect(args).toContain("--site");
    });

    test("dispatches to gh-pages builder", () => {
      const platConfig = makeDefaultPlatforms()[1];
      const args = buildDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
      expect(args).toContain("--branch");
    });

    test("dispatches to vercel builder", () => {
      const platConfig: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      const args = buildDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
      expect(args).toContain("--token");
    });

    test("dispatches to s3 builder", () => {
      const platConfig: WebPlatformConfig = {
        platform: "s3",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeS3Conf(),
      };
      const args = buildDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("s3");
      expect(args[1]).toBe("sync");
    });

    test("returns generic deploy for unknown platform", () => {
      const platConfig: WebPlatformConfig = {
        platform: "unknown",
        enabled: true,
        directory: "exports/web",
        platformConfig: {} as any,
      };
      const args = buildDeployArgs(makeConfig(), platConfig);
      expect(args[0]).toBe("deploy");
    });
  });

  // ─── initWebPublisher / hasWebPublisher ───────────────────────────────

  describe("initWebPublisher", () => {
    test("returns true on first init", () => {
      expect(initWebPublisher(makeConfig())).toBe(true);
    });

    test("returns false on second init", () => {
      initDefault();
      expect(initWebPublisher(makeConfig())).toBe(false);
    });

    test("creates .web-publisher directory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".web-publisher"))).toBe(true);
    });

    test("creates runs subdirectory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".web-publisher", "runs"))).toBe(true);
    });

    test("creates state.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".web-publisher", "state.json"))).toBe(true);
    });

    test("creates config.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".web-publisher", "config.json"))).toBe(true);
    });

    test("state has correct projectId", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });

    test("state starts with zero runs", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.totalRuns).toBe(0);
    });

    test("state starts not running", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.isRunning).toBe(false);
    });

    test("state has no last run", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.lastRunId).toBeNull();
      expect(state!.lastRunTime).toBeNull();
    });

    test("state has timestamps", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.createdAt).toBeGreaterThan(0);
      expect(state!.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("hasWebPublisher", () => {
    test("returns false before init", () => {
      expect(hasWebPublisher(testDir)).toBe(false);
    });

    test("returns true after init", () => {
      initDefault();
      expect(hasWebPublisher(testDir)).toBe(true);
    });

    test("returns false after destroy", () => {
      initDefault();
      destroyWebPublisher(testDir);
      expect(hasWebPublisher(testDir)).toBe(false);
    });
  });

  // ─── getWebPublishState ───────────────────────────────────────────────

  describe("getWebPublishState", () => {
    test("returns null before init", () => {
      expect(getWebPublishState(testDir)).toBeNull();
    });

    test("returns state after init", () => {
      initDefault();
      expect(getWebPublishState(testDir)).not.toBeNull();
    });

    test("state config matches init config", () => {
      initDefault();
      const state = getWebPublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── updateWebPublishConfig ───────────────────────────────────────────

  describe("updateWebPublishConfig", () => {
    test("throws if not initialized", () => {
      expect(() => updateWebPublishConfig(testDir, {})).toThrow("not initialized");
    });

    test("updates uploadTimeout", () => {
      initDefault();
      const updated = updateWebPublishConfig(testDir, { uploadTimeout: 120_000 });
      expect(updated.uploadTimeout).toBe(120_000);
    });

    test("persists to state", () => {
      initDefault();
      updateWebPublishConfig(testDir, { uploadTimeout: 120_000 });
      const state = getWebPublishState(testDir);
      expect(state!.config.uploadTimeout).toBe(120_000);
    });

    test("persists to config.json", () => {
      initDefault();
      updateWebPublishConfig(testDir, { publishRetention: 5 });
      const raw = JSON.parse(readFileSync(join(testDir, ".web-publisher", "config.json"), "utf-8"));
      expect(raw.publishRetention).toBe(5);
    });

    test("updates updatedAt", () => {
      initDefault();
      const before = getWebPublishState(testDir)!.updatedAt;
      updateWebPublishConfig(testDir, { uploadTimeout: 100_000 });
      const after = getWebPublishState(testDir)!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("preserves unmodified fields", () => {
      initDefault();
      updateWebPublishConfig(testDir, { uploadTimeout: 100_000 });
      const state = getWebPublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── getEnabledPlatforms ──────────────────────────────────────────────

  describe("getEnabledPlatforms", () => {
    test("returns empty for uninitialized", () => {
      expect(getEnabledPlatforms(testDir)).toHaveLength(0);
    });

    test("returns all two by default", () => {
      initDefault();
      expect(getEnabledPlatforms(testDir)).toHaveLength(2);
    });

    test("excludes disabled platforms", () => {
      initDefault();
      setPlatformEnabled(testDir, "netlify", false);
      expect(getEnabledPlatforms(testDir)).toHaveLength(1);
      expect(getEnabledPlatforms(testDir).some((p) => p.platform === "netlify")).toBe(false);
    });
  });

  // ─── setPlatformEnabled ───────────────────────────────────────────────

  describe("setPlatformEnabled", () => {
    test("throws if not initialized", () => {
      expect(() => setPlatformEnabled(testDir, "netlify", false)).toThrow("not initialized");
    });

    test("disables a platform", () => {
      initDefault();
      const result = setPlatformEnabled(testDir, "netlify", false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    test("enables a platform", () => {
      initDefault();
      setPlatformEnabled(testDir, "netlify", false);
      const result = setPlatformEnabled(testDir, "netlify", true);
      expect(result!.enabled).toBe(true);
    });

    test("returns null for unknown platform", () => {
      initDefault();
      expect(setPlatformEnabled(testDir, "nonexistent", false)).toBeNull();
    });

    test("persists change", () => {
      initDefault();
      setPlatformEnabled(testDir, "gh-pages", false);
      const state = getWebPublishState(testDir);
      const ghPages = state!.config.platforms.find((p) => p.platform === "gh-pages");
      expect(ghPages!.enabled).toBe(false);
    });
  });

  // ─── addPlatform ──────────────────────────────────────────────────────

  describe("addPlatform", () => {
    test("throws if not initialized", () => {
      const config: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      expect(() => addPlatform(testDir, config)).toThrow("not initialized");
    });

    test("adds a new platform", () => {
      initDefault();
      const config: WebPlatformConfig = {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      };
      expect(addPlatform(testDir, config)).toBe(true);
    });

    test("returns false for duplicate", () => {
      initDefault();
      const config: WebPlatformConfig = {
        platform: "netlify",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeNetlifyConfig(),
      };
      expect(addPlatform(testDir, config)).toBe(false);
    });

    test("persists added platform", () => {
      initDefault();
      addPlatform(testDir, {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      });
      const state = getWebPublishState(testDir);
      expect(state!.config.platforms.some((p) => p.platform === "vercel")).toBe(true);
    });

    test("increases platform count", () => {
      initDefault();
      addPlatform(testDir, {
        platform: "vercel",
        enabled: true,
        directory: "exports/web",
        platformConfig: makeVercelConf(),
      });
      expect(getWebPublishState(testDir)!.config.platforms).toHaveLength(3);
    });
  });

  // ─── removePlatform ───────────────────────────────────────────────────

  describe("removePlatform", () => {
    test("throws if not initialized", () => {
      expect(() => removePlatform(testDir, "netlify")).toThrow("not initialized");
    });

    test("removes existing platform", () => {
      initDefault();
      expect(removePlatform(testDir, "netlify")).toBe(true);
    });

    test("returns false for unknown platform", () => {
      initDefault();
      expect(removePlatform(testDir, "nonexistent")).toBe(false);
    });

    test("persists removal", () => {
      initDefault();
      removePlatform(testDir, "netlify");
      const state = getWebPublishState(testDir);
      expect(state!.config.platforms.some((p) => p.platform === "netlify")).toBe(false);
    });

    test("decreases platform count", () => {
      initDefault();
      removePlatform(testDir, "netlify");
      expect(getWebPublishState(testDir)!.config.platforms).toHaveLength(1);
    });
  });

  // ─── executeWebPublish ────────────────────────────────────────────────

  describe("executeWebPublish", () => {
    test("throws if not initialized", async () => {
      expect(executeWebPublish(testDir)).rejects.toThrow("not initialized");
    });

    test("dry-run succeeds without executor", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.status).toBe("succeeded");
    });

    test("produces results for all enabled platforms", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.results).toHaveLength(2);
    });

    test("run has correct projectId", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.projectId).toBe(PROJECT_ID);
    });

    test("run has a unique id", async () => {
      initDefault();
      const run1 = await executeWebPublish(testDir);
      const run2 = await executeWebPublish(testDir);
      expect(run1.id).not.toBe(run2.id);
    });

    test("run has timestamp", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.timestamp).toBeGreaterThan(0);
    });

    test("run has duration", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    test("default triggeredBy is manual", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(run.triggeredBy).toBe("manual");
    });

    test("custom triggeredBy is preserved", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { triggeredBy: "ci" });
      expect(run.triggeredBy).toBe("ci");
    });

    test("custom tags are preserved", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { tags: ["release", "v1"] });
      expect(run.tags).toEqual(["release", "v1"]);
    });

    test("custom metadata is preserved", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { metadata: { buildNumber: 42 } });
      expect(run.metadata).toEqual({ buildNumber: 42 });
    });

    test("respects platform filter", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { platforms: ["netlify"] });
      expect(run.platforms).toHaveLength(1);
      expect(run.platforms).toContain("netlify");
    });

    test("skips disabled platforms even if requested", async () => {
      initDefault();
      setPlatformEnabled(testDir, "netlify", false);
      const run = await executeWebPublish(testDir, { platforms: ["netlify", "gh-pages"] });
      expect(run.platforms).toHaveLength(1);
      expect(run.platforms).toContain("gh-pages");
    });

    test("executor success produces succeeded status", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: ["ok"], deployUrl: "https://example.com" });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(run.status).toBe("succeeded");
      expect(run.results.every((r) => r.status === "succeeded")).toBe(true);
    });

    test("executor failure produces failed status", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth failed", logs: ["err"] });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
      expect(run.results.every((r) => r.status === "failed")).toBe(true);
    });

    test("executor exception produces failed result", async () => {
      initDefault();
      const executor = async () => { throw new Error("network error"); };
      const run = await executeWebPublish(testDir, undefined, executor);
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
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
    });

    test("deployUrl is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], deployUrl: "https://app.netlify.app" });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(run.results[0].deployUrl).toBe("https://app.netlify.app");
    });

    test("deployId is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], deployId: "dep-42" });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(run.results[0].deployId).toBe("dep-42");
    });

    test("updates state totalRuns", async () => {
      initDefault();
      await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.totalRuns).toBe(1);
      await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.totalRuns).toBe(2);
    });

    test("updates state lastRunId", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.lastRunId).toBe(run.id);
    });

    test("updates state lastRunTime", async () => {
      initDefault();
      await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.lastRunTime).toBeGreaterThan(0);
    });

    test("clears isRunning after completion", async () => {
      initDefault();
      await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.isRunning).toBe(false);
    });

    test("clears currentPlatform after completion", async () => {
      initDefault();
      await executeWebPublish(testDir);
      expect(getWebPublishState(testDir)!.currentPlatform).toBeNull();
    });

    test("throws if already running", async () => {
      initDefault();
      const state = getWebPublishState(testDir)!;
      state.isRunning = true;
      writeFileSync(join(testDir, ".web-publisher", "state.json"), JSON.stringify(state, null, 2));
      expect(executeWebPublish(testDir)).rejects.toThrow("already running");
    });

    test("persists run to disk", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const loaded = getWebRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(run.id);
    });

    test("onProgress callback is called", async () => {
      initDefault();
      const messages: string[] = [];
      await executeWebPublish(testDir, undefined, undefined, (_plat, msg) => messages.push(msg));
      expect(messages.length).toBeGreaterThan(0);
    });

    test("publish retention prunes old runs", async () => {
      initDefault({ publishRetention: 2 });
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const history = getWebHistory(testDir);
      expect(history.totalCount).toBe(2);
    });
  });

  // ─── cancelWebPublish ─────────────────────────────────────────────────

  describe("cancelWebPublish", () => {
    test("throws if not initialized", () => {
      expect(() => cancelWebPublish(testDir)).toThrow("not initialized");
    });

    test("returns false if not running", () => {
      initDefault();
      expect(cancelWebPublish(testDir)).toBe(false);
    });

    test("returns true and clears state if running", () => {
      initDefault();
      const state = getWebPublishState(testDir)!;
      state.isRunning = true;
      state.currentPlatform = "netlify";
      writeFileSync(join(testDir, ".web-publisher", "state.json"), JSON.stringify(state, null, 2));

      expect(cancelWebPublish(testDir)).toBe(true);

      const after = getWebPublishState(testDir)!;
      expect(after.isRunning).toBe(false);
      expect(after.currentPlatform).toBeNull();
    });
  });

  // ─── getWebRun ────────────────────────────────────────────────────────

  describe("getWebRun", () => {
    test("returns null for unknown id", () => {
      initDefault();
      expect(getWebRun(testDir, "nonexistent")).toBeNull();
    });

    test("returns run after publish", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const loaded = getWebRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe(run.status);
    });
  });

  // ─── getWebHistory ────────────────────────────────────────────────────

  describe("getWebHistory", () => {
    test("returns empty for uninitialized", () => {
      const history = getWebHistory(testDir);
      expect(history.runs).toHaveLength(0);
      expect(history.totalCount).toBe(0);
    });

    test("returns empty before any runs", () => {
      initDefault();
      const history = getWebHistory(testDir);
      expect(history.totalCount).toBe(0);
    });

    test("returns runs sorted newest first", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const history = getWebHistory(testDir);
      expect(history.runs).toHaveLength(3);
      for (let i = 1; i < history.runs.length; i++) {
        expect(history.runs[i - 1].timestamp).toBeGreaterThanOrEqual(history.runs[i].timestamp);
      }
    });

    test("filters by platform", async () => {
      initDefault();
      await executeWebPublish(testDir, { platforms: ["netlify"] });
      await executeWebPublish(testDir, { platforms: ["gh-pages"] });
      const history = getWebHistory(testDir, { platform: "netlify" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by status", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeWebPublish(testDir, undefined, executor);
      const history = getWebHistory(testDir, { status: "succeeded" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by triggeredBy", async () => {
      initDefault();
      await executeWebPublish(testDir, { triggeredBy: "ci" });
      await executeWebPublish(testDir, { triggeredBy: "manual" });
      const history = getWebHistory(testDir, { triggeredBy: "ci" });
      expect(history.totalCount).toBe(1);
    });

    test("respects limit", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const history = getWebHistory(testDir, { limit: 2 });
      expect(history.runs).toHaveLength(2);
      expect(history.totalCount).toBe(3);
    });

    test("respects offset", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const all = getWebHistory(testDir);
      const sliced = getWebHistory(testDir, { offset: 1, limit: 1 });
      expect(sliced.runs).toHaveLength(1);
      expect(sliced.runs[0].id).toBe(all.runs[1].id);
    });

    test("filters by search in platform name", async () => {
      initDefault();
      await executeWebPublish(testDir, { platforms: ["netlify"] });
      const history = getWebHistory(testDir, { search: "netlify" });
      expect(history.totalCount).toBe(1);
    });

    test("search returns empty for no match", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const history = getWebHistory(testDir, { search: "zzz_nomatch" });
      expect(history.totalCount).toBe(0);
    });
  });

  // ─── getWebStats ──────────────────────────────────────────────────────

  describe("getWebStats", () => {
    test("returns null for uninitialized", () => {
      expect(getWebStats(testDir)).toBeNull();
    });

    test("returns zero stats before any runs", () => {
      initDefault();
      const stats = getWebStats(testDir)!;
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalDeploys).toBe(0);
    });

    test("counts total runs", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const stats = getWebStats(testDir)!;
      expect(stats.totalRuns).toBe(2);
    });

    test("counts total deploys across platforms", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const stats = getWebStats(testDir)!;
      expect(stats.totalDeploys).toBe(2);
    });

    test("counts succeeded", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const stats = getWebStats(testDir)!;
      expect(stats.succeeded).toBe(2);
    });

    test("counts failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeWebPublish(testDir, undefined, executor);
      const stats = getWebStats(testDir)!;
      expect(stats.failed).toBe(2);
    });

    test("tracks platform counts", async () => {
      initDefault();
      await executeWebPublish(testDir, { platforms: ["netlify"] });
      const stats = getWebStats(testDir)!;
      expect(stats.platformCounts["netlify"]).toBe(1);
    });

    test("computes platform success rates", async () => {
      initDefault();
      await executeWebPublish(testDir, { platforms: ["netlify"] });
      const stats = getWebStats(testDir)!;
      expect(stats.platformSuccessRates["netlify"]).toBe(100);
    });

    test("computes average duration", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const stats = getWebStats(testDir)!;
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    test("tracks firstRun and lastRun", async () => {
      initDefault();
      await executeWebPublish(testDir);
      const stats = getWebStats(testDir)!;
      expect(stats.firstRun).toBeGreaterThan(0);
      expect(stats.lastRun).toBeGreaterThan(0);
    });

    test("has correct projectId", async () => {
      initDefault();
      const stats = getWebStats(testDir)!;
      expect(stats.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── getPlatformResult ────────────────────────────────────────────────

  describe("getPlatformResult", () => {
    test("returns result for existing platform", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const result = getPlatformResult(run, "netlify");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("netlify");
    });

    test("returns null for missing platform", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { platforms: ["netlify"] });
      expect(getPlatformResult(run, "vercel")).toBeNull();
    });
  });

  // ─── isWebRunSuccessful ───────────────────────────────────────────────

  describe("isWebRunSuccessful", () => {
    test("returns true when all succeeded", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(isWebRunSuccessful(run)).toBe(true);
    });

    test("returns false when any failed", async () => {
      initDefault();
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return callCount === 1 ? { success: true, logs: [] } : { success: false, error: "f", logs: [] };
      };
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(isWebRunSuccessful(run)).toBe(false);
    });
  });

  // ─── getFailedPlatforms / getSucceededPlatforms ───────────────────────

  describe("getFailedPlatforms", () => {
    test("returns empty when all succeeded", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(getFailedPlatforms(run)).toHaveLength(0);
    });

    test("returns failed platforms", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(getFailedPlatforms(run)).toHaveLength(2);
    });
  });

  describe("getSucceededPlatforms", () => {
    test("returns all when all succeeded", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(getSucceededPlatforms(run)).toHaveLength(2);
    });

    test("returns empty when all failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(getSucceededPlatforms(run)).toHaveLength(0);
    });
  });

  // ─── pruneWebRuns ─────────────────────────────────────────────────────

  describe("pruneWebRuns", () => {
    test("keeps latest N runs", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const deleted = pruneWebRuns(testDir, 1);
      expect(deleted).toBe(2);
      expect(getWebHistory(testDir).totalCount).toBe(1);
    });

    test("returns 0 when nothing to prune", async () => {
      initDefault();
      await executeWebPublish(testDir);
      expect(pruneWebRuns(testDir, 10)).toBe(0);
    });

    test("prunes all with keepCount 0", async () => {
      initDefault();
      await executeWebPublish(testDir);
      await executeWebPublish(testDir);
      const deleted = pruneWebRuns(testDir, 0);
      expect(deleted).toBe(2);
    });
  });

  // ─── formatWebRunOneline ──────────────────────────────────────────────

  describe("formatWebRunOneline", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const line = formatWebRunOneline(run);
      expect(line).toContain(run.id.slice(0, 7));
    });

    test("includes platform names", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const line = formatWebRunOneline(run);
      expect(line).toContain("netlify");
      expect(line).toContain("gh-pages");
    });

    test("shows + for succeeded", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(formatWebRunOneline(run)).toContain("[+]");
    });

    test("shows x for failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(formatWebRunOneline(run)).toContain("[x]");
    });

    test("includes duration", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(formatWebRunOneline(run)).toMatch(/[\d.]+s/);
    });
  });

  // ─── formatWebRunFull ─────────────────────────────────────────────────

  describe("formatWebRunFull", () => {
    test("includes run id", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(formatWebRunFull(run)).toContain(run.id);
    });

    test("includes status", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(formatWebRunFull(run)).toContain("succeeded");
    });

    test("includes platform results", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const full = formatWebRunFull(run);
      expect(full).toContain("netlify");
      expect(full).toContain("gh-pages");
    });

    test("includes error for failed platforms", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth error", logs: [] });
      const run = await executeWebPublish(testDir, { platforms: ["netlify"] }, executor);
      expect(formatWebRunFull(run)).toContain("auth error");
    });

    test("includes tags when set", async () => {
      initDefault();
      const run = await executeWebPublish(testDir, { tags: ["beta"] });
      expect(formatWebRunFull(run)).toContain("beta");
    });

    test("includes deployUrl when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], deployUrl: "https://test.netlify.app" });
      const run = await executeWebPublish(testDir, { platforms: ["netlify"] }, executor);
      expect(formatWebRunFull(run)).toContain("https://test.netlify.app");
    });

    test("includes deployId when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], deployId: "dep-999" });
      const run = await executeWebPublish(testDir, { platforms: ["netlify"] }, executor);
      expect(formatWebRunFull(run)).toContain("dep-999");
    });
  });

  // ─── generateWebPublishSummary ────────────────────────────────────────

  describe("generateWebPublishSummary", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(generateWebPublishSummary(run)).toContain(run.id.slice(0, 7));
    });

    test("includes succeeded count", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(generateWebPublishSummary(run)).toContain("2 succeeded");
    });

    test("includes failed count", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "f", logs: [] });
      const run = await executeWebPublish(testDir, undefined, executor);
      expect(generateWebPublishSummary(run)).toContain("2 failed");
    });

    test("includes total count", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      expect(generateWebPublishSummary(run)).toContain("2 total");
    });

    test("includes platform names", async () => {
      initDefault();
      const run = await executeWebPublish(testDir);
      const summary = generateWebPublishSummary(run);
      expect(summary).toContain("netlify");
      expect(summary).toContain("gh-pages");
    });
  });

  // ─── destroyWebPublisher ──────────────────────────────────────────────

  describe("destroyWebPublisher", () => {
    test("returns false if not initialized", () => {
      expect(destroyWebPublisher(testDir)).toBe(false);
    });

    test("returns true after destroying", () => {
      initDefault();
      expect(destroyWebPublisher(testDir)).toBe(true);
    });

    test("removes .web-publisher directory", () => {
      initDefault();
      destroyWebPublisher(testDir);
      expect(existsSync(join(testDir, ".web-publisher"))).toBe(false);
    });

    test("getWebPublishState returns null after destroy", () => {
      initDefault();
      destroyWebPublisher(testDir);
      expect(getWebPublishState(testDir)).toBeNull();
    });
  });
});
