import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  type MobilePublishConfig,
  type MobileStore,
  type MobileStoreConfig,
  type MobilePublishRun,
  type MobilePublishOptions,
  type GooglePlayConfig,
  type AppStoreConfig,
  getDefaultStores,
  getSupportedStoreNames,
  isGooglePlayConfig,
  isAppStoreConfig,
  validateArtifact,
  validateMobilePublishConfig,
  initMobilePublisher,
  hasMobilePublisher,
  getMobilePublishState,
  updateMobilePublishConfig,
  getEnabledStores,
  setStoreEnabled,
  addStore,
  removeStore,
  buildGooglePlayUploadArgs,
  buildAppStoreUploadArgs,
  buildUploadArgs,
  executeMobilePublish,
  cancelMobilePublish,
  getMobileRun,
  getMobileHistory,
  getMobileStats,
  getStoreResult,
  isMobileRunSuccessful,
  getFailedStores,
  getSucceededStores,
  pruneMobileRuns,
  formatMobileRunOneline,
  formatMobileRunFull,
  generateMobilePublishSummary,
  destroyMobilePublisher,
} from "./mobile-publisher";

let testDir: string;
const PROJECT_ID = "test-mobile-project";
const APP_VERSION = "1.0.0";

function makeGooglePlayConfig(): GooglePlayConfig {
  return {
    serviceAccountKeyPath: "/path/to/key.json",
    packageName: "com.test.mygame",
    track: "internal",
    releaseStatus: "draft",
  };
}

function makeAppStoreConfig(): AppStoreConfig {
  return {
    apiKeyId: "KEY123",
    issuerId: "ISSUER456",
    privateKeyPath: "/path/to/key.p8",
    appleId: "123456789",
    bundleId: "com.test.mygame",
    releaseType: "manual",
  };
}

function makeStores(): MobileStoreConfig[] {
  return [
    {
      store: "google-play",
      enabled: true,
      artifactPath: "exports/android/game.aab",
      storeConfig: makeGooglePlayConfig(),
    },
    {
      store: "app-store",
      enabled: true,
      artifactPath: "exports/ios/game.ipa",
      storeConfig: makeAppStoreConfig(),
    },
  ];
}

function makeConfig(overrides?: Partial<MobilePublishConfig>): MobilePublishConfig {
  return {
    projectId: PROJECT_ID,
    projectPath: testDir,
    appVersion: APP_VERSION,
    stores: makeStores(),
    uploadTimeout: 600_000,
    publishRetention: 0,
    validateArtifact: true,
    ...overrides,
  };
}

function initDefault(overrides?: Partial<MobilePublishConfig>): void {
  initMobilePublisher(makeConfig(overrides));
}

beforeEach(() => {
  const id = `mobile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testDir = join(tmpdir(), id);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("mobile-publisher", () => {

  // ─── getDefaultStores ─────────────────────────────────────────────────

  describe("getDefaultStores", () => {
    test("returns two stores", () => {
      expect(getDefaultStores()).toHaveLength(2);
    });

    test("all defaults are enabled", () => {
      for (const s of getDefaultStores()) {
        expect(s.enabled).toBe(true);
      }
    });

    test("includes google-play store", () => {
      expect(getDefaultStores().some((s) => s.store === "google-play")).toBe(true);
    });

    test("includes app-store", () => {
      expect(getDefaultStores().some((s) => s.store === "app-store")).toBe(true);
    });

    test("each store has an artifact path", () => {
      for (const s of getDefaultStores()) {
        expect(s.artifactPath.length).toBeGreaterThan(0);
      }
    });

    test("google-play artifact is .aab", () => {
      const gp = getDefaultStores().find((s) => s.store === "google-play");
      expect(gp!.artifactPath).toContain(".aab");
    });

    test("app-store artifact is .ipa", () => {
      const as = getDefaultStores().find((s) => s.store === "app-store");
      expect(as!.artifactPath).toContain(".ipa");
    });

    test("returns a new array each call", () => {
      const a = getDefaultStores();
      const b = getDefaultStores();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── getSupportedStoreNames ───────────────────────────────────────────

  describe("getSupportedStoreNames", () => {
    test("returns two names", () => {
      expect(getSupportedStoreNames()).toHaveLength(2);
    });

    test("includes all expected stores", () => {
      const names = getSupportedStoreNames();
      expect(names).toContain("google-play");
      expect(names).toContain("app-store");
    });

    test("returns a new array each call", () => {
      const a = getSupportedStoreNames();
      const b = getSupportedStoreNames();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── isGooglePlayConfig / isAppStoreConfig ────────────────────────────

  describe("isGooglePlayConfig", () => {
    test("returns true for Google Play config", () => {
      expect(isGooglePlayConfig(makeGooglePlayConfig())).toBe(true);
    });

    test("returns false for App Store config", () => {
      expect(isGooglePlayConfig(makeAppStoreConfig())).toBe(false);
    });
  });

  describe("isAppStoreConfig", () => {
    test("returns true for App Store config", () => {
      expect(isAppStoreConfig(makeAppStoreConfig())).toBe(true);
    });

    test("returns false for Google Play config", () => {
      expect(isAppStoreConfig(makeGooglePlayConfig())).toBe(false);
    });
  });

  // ─── validateArtifact ─────────────────────────────────────────────────

  describe("validateArtifact", () => {
    test("empty path is invalid", () => {
      const result = validateArtifact("", "google-play");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("required"))).toBe(true);
    });

    test("aab is valid for google-play", () => {
      const result = validateArtifact("game.aab", "google-play");
      expect(result.valid).toBe(true);
    });

    test("apk is valid for google-play with warning", () => {
      const result = validateArtifact("game.apk", "google-play");
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("AAB"))).toBe(true);
    });

    test("ipa is invalid for google-play", () => {
      const result = validateArtifact("game.ipa", "google-play");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(".aab"))).toBe(true);
    });

    test("ipa is valid for app-store", () => {
      const result = validateArtifact("game.ipa", "app-store");
      expect(result.valid).toBe(true);
    });

    test("aab is invalid for app-store", () => {
      const result = validateArtifact("game.aab", "app-store");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(".ipa"))).toBe(true);
    });
  });

  // ─── validateMobilePublishConfig ──────────────────────────────────────

  describe("validateMobilePublishConfig", () => {
    test("valid config passes validation", () => {
      const result = validateMobilePublishConfig(makeConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("missing projectId is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), projectId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectId"))).toBe(true);
    });

    test("missing projectPath is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), projectPath: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("projectPath"))).toBe(true);
    });

    test("missing appVersion is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), appVersion: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("appVersion"))).toBe(true);
    });

    test("empty stores array is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), stores: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("At least one store"))).toBe(true);
    });

    test("duplicate stores is an error", () => {
      const stores: MobileStoreConfig[] = [
        { store: "google-play", enabled: true, artifactPath: "a.aab", storeConfig: makeGooglePlayConfig() },
        { store: "google-play", enabled: true, artifactPath: "b.aab", storeConfig: makeGooglePlayConfig() },
      ];
      const result = validateMobilePublishConfig({ ...makeConfig(), stores });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    test("empty artifact path is an error", () => {
      const stores: MobileStoreConfig[] = [
        { store: "google-play", enabled: true, artifactPath: "", storeConfig: makeGooglePlayConfig() },
      ];
      const result = validateMobilePublishConfig({ ...makeConfig(), stores });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("artifactPath"))).toBe(true);
    });

    test("missing Google Play packageName is an error", () => {
      const stores: MobileStoreConfig[] = [
        { store: "google-play", enabled: true, artifactPath: "game.aab", storeConfig: { ...makeGooglePlayConfig(), packageName: "" } },
      ];
      const result = validateMobilePublishConfig({ ...makeConfig(), stores });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("packageName"))).toBe(true);
    });

    test("missing App Store bundleId is an error", () => {
      const stores: MobileStoreConfig[] = [
        { store: "app-store", enabled: true, artifactPath: "game.ipa", storeConfig: { ...makeAppStoreConfig(), bundleId: "" } },
      ];
      const result = validateMobilePublishConfig({ ...makeConfig(), stores });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("bundleId"))).toBe(true);
    });

    test("no enabled stores is a warning", () => {
      const stores = makeStores().map((s) => ({ ...s, enabled: false }));
      const result = validateMobilePublishConfig({ ...makeConfig(), stores });
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("enabled"))).toBe(true);
    });

    test("negative uploadTimeout is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), uploadTimeout: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("uploadTimeout"))).toBe(true);
    });

    test("zero uploadTimeout is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), uploadTimeout: 0 });
      expect(result.valid).toBe(false);
    });

    test("negative publishRetention is an error", () => {
      const result = validateMobilePublishConfig({ ...makeConfig(), publishRetention: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("publishRetention"))).toBe(true);
    });

    test("zero publishRetention is valid", () => {
      const result = validateMobilePublishConfig(makeConfig({ publishRetention: 0 }));
      expect(result.valid).toBe(true);
    });
  });

  // ─── initMobilePublisher / hasMobilePublisher ─────────────────────────

  describe("initMobilePublisher", () => {
    test("returns true on first init", () => {
      expect(initMobilePublisher(makeConfig())).toBe(true);
    });

    test("returns false on second init", () => {
      initDefault();
      expect(initMobilePublisher(makeConfig())).toBe(false);
    });

    test("creates .mobile-publisher directory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".mobile-publisher"))).toBe(true);
    });

    test("creates runs subdirectory", () => {
      initDefault();
      expect(existsSync(join(testDir, ".mobile-publisher", "runs"))).toBe(true);
    });

    test("creates state.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".mobile-publisher", "state.json"))).toBe(true);
    });

    test("creates config.json", () => {
      initDefault();
      expect(existsSync(join(testDir, ".mobile-publisher", "config.json"))).toBe(true);
    });

    test("state has correct projectId", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
    });

    test("state starts with zero runs", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.totalRuns).toBe(0);
    });

    test("state starts not running", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.isRunning).toBe(false);
    });

    test("state has no last run", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.lastRunId).toBeNull();
      expect(state!.lastRunTime).toBeNull();
    });

    test("state has timestamps", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.createdAt).toBeGreaterThan(0);
      expect(state!.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("hasMobilePublisher", () => {
    test("returns false before init", () => {
      expect(hasMobilePublisher(testDir)).toBe(false);
    });

    test("returns true after init", () => {
      initDefault();
      expect(hasMobilePublisher(testDir)).toBe(true);
    });

    test("returns false after destroy", () => {
      initDefault();
      destroyMobilePublisher(testDir);
      expect(hasMobilePublisher(testDir)).toBe(false);
    });
  });

  // ─── getMobilePublishState ────────────────────────────────────────────

  describe("getMobilePublishState", () => {
    test("returns null before init", () => {
      expect(getMobilePublishState(testDir)).toBeNull();
    });

    test("returns state after init", () => {
      initDefault();
      expect(getMobilePublishState(testDir)).not.toBeNull();
    });

    test("state config matches init config", () => {
      initDefault();
      const state = getMobilePublishState(testDir);
      expect(state!.config.appVersion).toBe(APP_VERSION);
    });
  });

  // ─── updateMobilePublishConfig ────────────────────────────────────────

  describe("updateMobilePublishConfig", () => {
    test("throws if not initialized", () => {
      expect(() => updateMobilePublishConfig(testDir, {})).toThrow("not initialized");
    });

    test("updates appVersion", () => {
      initDefault();
      const updated = updateMobilePublishConfig(testDir, { appVersion: "2.0.0" });
      expect(updated.appVersion).toBe("2.0.0");
    });

    test("persists to state", () => {
      initDefault();
      updateMobilePublishConfig(testDir, { appVersion: "2.0.0" });
      const state = getMobilePublishState(testDir);
      expect(state!.config.appVersion).toBe("2.0.0");
    });

    test("persists to config.json", () => {
      initDefault();
      updateMobilePublishConfig(testDir, { appVersion: "3.0.0" });
      const raw = JSON.parse(readFileSync(join(testDir, ".mobile-publisher", "config.json"), "utf-8"));
      expect(raw.appVersion).toBe("3.0.0");
    });

    test("updates updatedAt", () => {
      initDefault();
      const before = getMobilePublishState(testDir)!.updatedAt;
      updateMobilePublishConfig(testDir, { validateArtifact: false });
      const after = getMobilePublishState(testDir)!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("preserves unmodified fields", () => {
      initDefault();
      updateMobilePublishConfig(testDir, { validateArtifact: false });
      const state = getMobilePublishState(testDir);
      expect(state!.config.projectId).toBe(PROJECT_ID);
      expect(state!.config.appVersion).toBe(APP_VERSION);
    });
  });

  // ─── getEnabledStores ─────────────────────────────────────────────────

  describe("getEnabledStores", () => {
    test("returns empty for uninitialized", () => {
      expect(getEnabledStores(testDir)).toHaveLength(0);
    });

    test("returns all two by default", () => {
      initDefault();
      expect(getEnabledStores(testDir)).toHaveLength(2);
    });

    test("excludes disabled stores", () => {
      initDefault();
      setStoreEnabled(testDir, "google-play", false);
      expect(getEnabledStores(testDir)).toHaveLength(1);
      expect(getEnabledStores(testDir).some((s) => s.store === "google-play")).toBe(false);
    });
  });

  // ─── setStoreEnabled ──────────────────────────────────────────────────

  describe("setStoreEnabled", () => {
    test("throws if not initialized", () => {
      expect(() => setStoreEnabled(testDir, "google-play", false)).toThrow("not initialized");
    });

    test("disables a store", () => {
      initDefault();
      const result = setStoreEnabled(testDir, "google-play", false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    test("enables a store", () => {
      initDefault();
      setStoreEnabled(testDir, "google-play", false);
      const result = setStoreEnabled(testDir, "google-play", true);
      expect(result!.enabled).toBe(true);
    });

    test("returns null for unknown store", () => {
      initDefault();
      expect(setStoreEnabled(testDir, "unknown-store" as MobileStore, false)).toBeNull();
    });

    test("persists change", () => {
      initDefault();
      setStoreEnabled(testDir, "app-store", false);
      const state = getMobilePublishState(testDir);
      const appStore = state!.config.stores.find((s) => s.store === "app-store");
      expect(appStore!.enabled).toBe(false);
    });
  });

  // ─── addStore ─────────────────────────────────────────────────────────

  describe("addStore", () => {
    test("throws if not initialized", () => {
      const config: MobileStoreConfig = {
        store: "google-play",
        enabled: true,
        artifactPath: "a.aab",
        storeConfig: makeGooglePlayConfig(),
      };
      expect(() => addStore(testDir, config)).toThrow("not initialized");
    });

    test("returns false for duplicate", () => {
      initDefault();
      const config: MobileStoreConfig = {
        store: "google-play",
        enabled: true,
        artifactPath: "a.aab",
        storeConfig: makeGooglePlayConfig(),
      };
      expect(addStore(testDir, config)).toBe(false);
    });

    test("adds new store when only one exists", () => {
      initDefault({ stores: [makeStores()[0]] });
      const asConfig: MobileStoreConfig = {
        store: "app-store",
        enabled: true,
        artifactPath: "game.ipa",
        storeConfig: makeAppStoreConfig(),
      };
      expect(addStore(testDir, asConfig)).toBe(true);
    });

    test("persists added store", () => {
      initDefault({ stores: [makeStores()[0]] });
      addStore(testDir, {
        store: "app-store",
        enabled: true,
        artifactPath: "game.ipa",
        storeConfig: makeAppStoreConfig(),
      });
      const state = getMobilePublishState(testDir);
      expect(state!.config.stores.some((s) => s.store === "app-store")).toBe(true);
    });

    test("increases store count", () => {
      initDefault({ stores: [makeStores()[0]] });
      addStore(testDir, {
        store: "app-store",
        enabled: true,
        artifactPath: "game.ipa",
        storeConfig: makeAppStoreConfig(),
      });
      expect(getMobilePublishState(testDir)!.config.stores).toHaveLength(2);
    });
  });

  // ─── removeStore ──────────────────────────────────────────────────────

  describe("removeStore", () => {
    test("throws if not initialized", () => {
      expect(() => removeStore(testDir, "google-play")).toThrow("not initialized");
    });

    test("removes existing store", () => {
      initDefault();
      expect(removeStore(testDir, "google-play")).toBe(true);
    });

    test("returns false for unknown store", () => {
      initDefault();
      expect(removeStore(testDir, "unknown-store" as MobileStore)).toBe(false);
    });

    test("persists removal", () => {
      initDefault();
      removeStore(testDir, "google-play");
      const state = getMobilePublishState(testDir);
      expect(state!.config.stores.some((s) => s.store === "google-play")).toBe(false);
    });

    test("decreases store count", () => {
      initDefault();
      removeStore(testDir, "google-play");
      expect(getMobilePublishState(testDir)!.config.stores).toHaveLength(1);
    });
  });

  // ─── buildGooglePlayUploadArgs ────────────────────────────────────────

  describe("buildGooglePlayUploadArgs", () => {
    test("includes upload command", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args[0]).toBe("upload");
    });

    test("includes package name", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--package-name");
      expect(args).toContain("com.test.mygame");
    });

    test("includes track", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--track");
      expect(args).toContain("internal");
    });

    test("includes release status", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--release-status");
      expect(args).toContain("draft");
    });

    test("includes service account key", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--service-account-key");
      expect(args).toContain("/path/to/key.json");
    });

    test("includes artifact path", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--artifact");
    });

    test("includes version name from config", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).toContain("--version-name");
      expect(args).toContain("1.0.0");
    });

    test("option appVersion overrides config", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig, { appVersion: "2.0.0" });
      expect(args).toContain("2.0.0");
      expect(args).not.toContain("1.0.0");
    });

    test("includes --dry-run when set", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig, { dryRun: true });
      expect(args).toContain("--dry-run");
    });

    test("omits --dry-run when not set", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildGooglePlayUploadArgs(config, storeConfig);
      expect(args).not.toContain("--dry-run");
    });

    test("includes mapping file when set", () => {
      const gp = { ...makeGooglePlayConfig(), mappingFile: "/path/to/mapping.txt" };
      const storeConfig: MobileStoreConfig = {
        store: "google-play",
        enabled: true,
        artifactPath: "game.aab",
        storeConfig: gp,
      };
      const args = buildGooglePlayUploadArgs(makeConfig(), storeConfig);
      expect(args).toContain("--mapping-file");
      expect(args).toContain("/path/to/mapping.txt");
    });

    test("includes changes-not-sent-for-review when set", () => {
      const gp = { ...makeGooglePlayConfig(), changesNotSentForReview: true };
      const storeConfig: MobileStoreConfig = {
        store: "google-play",
        enabled: true,
        artifactPath: "game.aab",
        storeConfig: gp,
      };
      const args = buildGooglePlayUploadArgs(makeConfig(), storeConfig);
      expect(args).toContain("--changes-not-sent-for-review");
    });
  });

  // ─── buildAppStoreUploadArgs ──────────────────────────────────────────

  describe("buildAppStoreUploadArgs", () => {
    test("includes altool command", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args[0]).toBe("altool");
      expect(args[1]).toBe("--upload-app");
    });

    test("includes type ios", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--type");
      expect(args).toContain("ios");
    });

    test("includes file path", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--file");
    });

    test("includes apiKey", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--apiKey");
      expect(args).toContain("KEY123");
    });

    test("includes apiIssuer", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--apiIssuer");
      expect(args).toContain("ISSUER456");
    });

    test("includes apple-id", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--apple-id");
      expect(args).toContain("123456789");
    });

    test("includes bundle-id", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).toContain("--bundle-id");
      expect(args).toContain("com.test.mygame");
    });

    test("uses --validate-app for dry run", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig, { dryRun: true });
      expect(args).toContain("--validate-app");
    });

    test("omits --validate-app when not dry run", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildAppStoreUploadArgs(config, storeConfig);
      expect(args).not.toContain("--validate-app");
    });
  });

  // ─── buildUploadArgs ──────────────────────────────────────────────────

  describe("buildUploadArgs", () => {
    test("dispatches to Google Play builder", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[0];
      const args = buildUploadArgs(config, storeConfig);
      expect(args[0]).toBe("upload");
      expect(args).toContain("--package-name");
    });

    test("dispatches to App Store builder", () => {
      const config = makeConfig();
      const storeConfig = makeStores()[1];
      const args = buildUploadArgs(config, storeConfig);
      expect(args[0]).toBe("altool");
      expect(args).toContain("--apiKey");
    });
  });

  // ─── executeMobilePublish ─────────────────────────────────────────────

  describe("executeMobilePublish", () => {
    test("throws if not initialized", async () => {
      expect(executeMobilePublish(testDir)).rejects.toThrow("not initialized");
    });

    test("dry-run succeeds without executor", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.status).toBe("succeeded");
    });

    test("produces results for all enabled stores", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.results).toHaveLength(2);
    });

    test("run has correct projectId", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.projectId).toBe(PROJECT_ID);
    });

    test("run has correct appVersion", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.appVersion).toBe(APP_VERSION);
    });

    test("run has a unique id", async () => {
      initDefault();
      const run1 = await executeMobilePublish(testDir);
      const run2 = await executeMobilePublish(testDir);
      expect(run1.id).not.toBe(run2.id);
    });

    test("run has timestamp", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.timestamp).toBeGreaterThan(0);
    });

    test("run has duration", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    test("default triggeredBy is manual", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(run.triggeredBy).toBe("manual");
    });

    test("custom triggeredBy is preserved", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { triggeredBy: "ci" });
      expect(run.triggeredBy).toBe("ci");
    });

    test("custom tags are preserved", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { tags: ["release", "v1"] });
      expect(run.tags).toEqual(["release", "v1"]);
    });

    test("custom metadata is preserved", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { metadata: { buildNumber: 42 } });
      expect(run.metadata).toEqual({ buildNumber: 42 });
    });

    test("respects store filter", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { stores: ["google-play"] });
      expect(run.stores).toHaveLength(1);
      expect(run.stores).toContain("google-play");
    });

    test("skips disabled stores even if requested", async () => {
      initDefault();
      setStoreEnabled(testDir, "google-play", false);
      const run = await executeMobilePublish(testDir, { stores: ["google-play", "app-store"] });
      expect(run.stores).toHaveLength(1);
      expect(run.stores).toContain("app-store");
    });

    test("executor success produces succeeded status", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: ["ok"], versionCode: 42 });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(run.status).toBe("succeeded");
      expect(run.results.every((r) => r.status === "succeeded")).toBe(true);
    });

    test("executor failure produces failed status", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth failed", logs: ["err"] });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
      expect(run.results.every((r) => r.status === "failed")).toBe(true);
    });

    test("executor exception produces failed result", async () => {
      initDefault();
      const executor = async () => { throw new Error("network error"); };
      const run = await executeMobilePublish(testDir, undefined, executor);
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
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(run.status).toBe("failed");
    });

    test("versionCode is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], versionCode: 99 });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(run.results[0].versionCode).toBe(99);
    });

    test("buildNumber is captured from executor", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], buildNumber: "42.1" });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(run.results[0].buildNumber).toBe("42.1");
    });

    test("updates state totalRuns", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.totalRuns).toBe(1);
      await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.totalRuns).toBe(2);
    });

    test("updates state lastRunId", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.lastRunId).toBe(run.id);
    });

    test("updates state lastRunTime", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.lastRunTime).toBeGreaterThan(0);
    });

    test("clears isRunning after completion", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.isRunning).toBe(false);
    });

    test("clears currentStore after completion", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      expect(getMobilePublishState(testDir)!.currentStore).toBeNull();
    });

    test("throws if already running", async () => {
      initDefault();
      const state = getMobilePublishState(testDir)!;
      state.isRunning = true;
      writeFileSync(join(testDir, ".mobile-publisher", "state.json"), JSON.stringify(state, null, 2));
      expect(executeMobilePublish(testDir)).rejects.toThrow("already running");
    });

    test("persists run to disk", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const loaded = getMobileRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(run.id);
    });

    test("onProgress callback is called", async () => {
      initDefault();
      const messages: string[] = [];
      await executeMobilePublish(testDir, undefined, undefined, (_store, msg) => messages.push(msg));
      expect(messages.length).toBeGreaterThan(0);
    });

    test("appVersion from options is used", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { appVersion: "3.0.0" });
      expect(run.appVersion).toBe("3.0.0");
    });

    test("appVersion falls back to config", async () => {
      initDefault({ appVersion: "2.0.0" });
      const run = await executeMobilePublish(testDir);
      expect(run.appVersion).toBe("2.0.0");
    });

    test("publish retention prunes old runs", async () => {
      initDefault({ publishRetention: 2 });
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const history = getMobileHistory(testDir);
      expect(history.totalCount).toBe(2);
    });
  });

  // ─── cancelMobilePublish ──────────────────────────────────────────────

  describe("cancelMobilePublish", () => {
    test("throws if not initialized", () => {
      expect(() => cancelMobilePublish(testDir)).toThrow("not initialized");
    });

    test("returns false if not running", () => {
      initDefault();
      expect(cancelMobilePublish(testDir)).toBe(false);
    });

    test("returns true and clears state if running", () => {
      initDefault();
      const state = getMobilePublishState(testDir)!;
      state.isRunning = true;
      state.currentStore = "google-play";
      writeFileSync(join(testDir, ".mobile-publisher", "state.json"), JSON.stringify(state, null, 2));

      expect(cancelMobilePublish(testDir)).toBe(true);

      const after = getMobilePublishState(testDir)!;
      expect(after.isRunning).toBe(false);
      expect(after.currentStore).toBeNull();
    });
  });

  // ─── getMobileRun ─────────────────────────────────────────────────────

  describe("getMobileRun", () => {
    test("returns null for unknown id", () => {
      initDefault();
      expect(getMobileRun(testDir, "nonexistent")).toBeNull();
    });

    test("returns run after publish", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const loaded = getMobileRun(testDir, run.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe(run.status);
    });
  });

  // ─── getMobileHistory ─────────────────────────────────────────────────

  describe("getMobileHistory", () => {
    test("returns empty for uninitialized", () => {
      const history = getMobileHistory(testDir);
      expect(history.runs).toHaveLength(0);
      expect(history.totalCount).toBe(0);
    });

    test("returns empty before any runs", () => {
      initDefault();
      const history = getMobileHistory(testDir);
      expect(history.totalCount).toBe(0);
    });

    test("returns runs sorted newest first", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const history = getMobileHistory(testDir);
      expect(history.runs).toHaveLength(3);
      for (let i = 1; i < history.runs.length; i++) {
        expect(history.runs[i - 1].timestamp).toBeGreaterThanOrEqual(history.runs[i].timestamp);
      }
    });

    test("filters by store", async () => {
      initDefault();
      await executeMobilePublish(testDir, { stores: ["google-play"] });
      await executeMobilePublish(testDir, { stores: ["app-store"] });
      const history = getMobileHistory(testDir, { store: "google-play" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by status", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeMobilePublish(testDir, undefined, executor);
      const history = getMobileHistory(testDir, { status: "succeeded" });
      expect(history.totalCount).toBe(1);
    });

    test("filters by triggeredBy", async () => {
      initDefault();
      await executeMobilePublish(testDir, { triggeredBy: "ci" });
      await executeMobilePublish(testDir, { triggeredBy: "manual" });
      const history = getMobileHistory(testDir, { triggeredBy: "ci" });
      expect(history.totalCount).toBe(1);
    });

    test("respects limit", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const history = getMobileHistory(testDir, { limit: 2 });
      expect(history.runs).toHaveLength(2);
      expect(history.totalCount).toBe(3);
    });

    test("respects offset", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const all = getMobileHistory(testDir);
      const sliced = getMobileHistory(testDir, { offset: 1, limit: 1 });
      expect(sliced.runs).toHaveLength(1);
      expect(sliced.runs[0].id).toBe(all.runs[1].id);
    });

    test("filters by search in version", async () => {
      initDefault();
      await executeMobilePublish(testDir, { appVersion: "1.0.0" });
      const history = getMobileHistory(testDir, { search: "1.0.0" });
      expect(history.totalCount).toBe(1);
    });

    test("search returns empty for no match", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const history = getMobileHistory(testDir, { search: "zzz_nomatch" });
      expect(history.totalCount).toBe(0);
    });
  });

  // ─── getMobileStats ───────────────────────────────────────────────────

  describe("getMobileStats", () => {
    test("returns null for uninitialized", () => {
      expect(getMobileStats(testDir)).toBeNull();
    });

    test("returns zero stats before any runs", () => {
      initDefault();
      const stats = getMobileStats(testDir)!;
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalUploads).toBe(0);
    });

    test("counts total runs", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const stats = getMobileStats(testDir)!;
      expect(stats.totalRuns).toBe(2);
    });

    test("counts total uploads across stores", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const stats = getMobileStats(testDir)!;
      expect(stats.totalUploads).toBe(2);
    });

    test("counts succeeded", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const stats = getMobileStats(testDir)!;
      expect(stats.succeeded).toBe(2);
    });

    test("counts failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      await executeMobilePublish(testDir, undefined, executor);
      const stats = getMobileStats(testDir)!;
      expect(stats.failed).toBe(2);
    });

    test("tracks store counts", async () => {
      initDefault();
      await executeMobilePublish(testDir, { stores: ["google-play"] });
      const stats = getMobileStats(testDir)!;
      expect(stats.storeCounts["google-play"]).toBe(1);
    });

    test("computes store success rates", async () => {
      initDefault();
      await executeMobilePublish(testDir, { stores: ["google-play"] });
      const stats = getMobileStats(testDir)!;
      expect(stats.storeSuccessRates["google-play"]).toBe(100);
    });

    test("computes average duration", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const stats = getMobileStats(testDir)!;
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    test("tracks firstRun and lastRun", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      const stats = getMobileStats(testDir)!;
      expect(stats.firstRun).toBeGreaterThan(0);
      expect(stats.lastRun).toBeGreaterThan(0);
    });

    test("has correct projectId", async () => {
      initDefault();
      const stats = getMobileStats(testDir)!;
      expect(stats.projectId).toBe(PROJECT_ID);
    });
  });

  // ─── getStoreResult ───────────────────────────────────────────────────

  describe("getStoreResult", () => {
    test("returns result for existing store", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const result = getStoreResult(run, "google-play");
      expect(result).not.toBeNull();
      expect(result!.store).toBe("google-play");
    });

    test("returns null for missing store", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { stores: ["google-play"] });
      expect(getStoreResult(run, "app-store")).toBeNull();
    });
  });

  // ─── isMobileRunSuccessful ────────────────────────────────────────────

  describe("isMobileRunSuccessful", () => {
    test("returns true when all succeeded", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(isMobileRunSuccessful(run)).toBe(true);
    });

    test("returns false when any failed", async () => {
      initDefault();
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return callCount === 1 ? { success: true, logs: [] } : { success: false, error: "f", logs: [] };
      };
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(isMobileRunSuccessful(run)).toBe(false);
    });
  });

  // ─── getFailedStores / getSucceededStores ─────────────────────────────

  describe("getFailedStores", () => {
    test("returns empty when all succeeded", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(getFailedStores(run)).toHaveLength(0);
    });

    test("returns failed stores", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(getFailedStores(run)).toHaveLength(2);
    });
  });

  describe("getSucceededStores", () => {
    test("returns all when all succeeded", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(getSucceededStores(run)).toHaveLength(2);
    });

    test("returns empty when all failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(getSucceededStores(run)).toHaveLength(0);
    });
  });

  // ─── pruneMobileRuns ──────────────────────────────────────────────────

  describe("pruneMobileRuns", () => {
    test("keeps latest N runs", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const deleted = pruneMobileRuns(testDir, 1);
      expect(deleted).toBe(2);
      expect(getMobileHistory(testDir).totalCount).toBe(1);
    });

    test("returns 0 when nothing to prune", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      expect(pruneMobileRuns(testDir, 10)).toBe(0);
    });

    test("prunes all with keepCount 0", async () => {
      initDefault();
      await executeMobilePublish(testDir);
      await executeMobilePublish(testDir);
      const deleted = pruneMobileRuns(testDir, 0);
      expect(deleted).toBe(2);
    });
  });

  // ─── formatMobileRunOneline ───────────────────────────────────────────

  describe("formatMobileRunOneline", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const line = formatMobileRunOneline(run);
      expect(line).toContain(run.id.slice(0, 7));
    });

    test("includes version", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunOneline(run)).toContain(APP_VERSION);
    });

    test("shows + for succeeded", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunOneline(run)).toContain("[+]");
    });

    test("shows x for failed", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "fail", logs: [] });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(formatMobileRunOneline(run)).toContain("[x]");
    });

    test("includes duration", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunOneline(run)).toMatch(/[\d.]+s/);
    });

    test("includes store names", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const line = formatMobileRunOneline(run);
      expect(line).toContain("google-play");
      expect(line).toContain("app-store");
    });
  });

  // ─── formatMobileRunFull ──────────────────────────────────────────────

  describe("formatMobileRunFull", () => {
    test("includes run id", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunFull(run)).toContain(run.id);
    });

    test("includes status", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunFull(run)).toContain("succeeded");
    });

    test("includes version", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(formatMobileRunFull(run)).toContain(APP_VERSION);
    });

    test("includes store results", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      const full = formatMobileRunFull(run);
      expect(full).toContain("google-play");
      expect(full).toContain("app-store");
    });

    test("includes error for failed stores", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "auth error", logs: [] });
      const run = await executeMobilePublish(testDir, { stores: ["google-play"] }, executor);
      expect(formatMobileRunFull(run)).toContain("auth error");
    });

    test("includes tags when set", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir, { tags: ["beta"] });
      expect(formatMobileRunFull(run)).toContain("beta");
    });

    test("includes versionCode when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], versionCode: 123 });
      const run = await executeMobilePublish(testDir, { stores: ["google-play"] }, executor);
      expect(formatMobileRunFull(run)).toContain("123");
    });

    test("includes buildNumber when present", async () => {
      initDefault();
      const executor = async () => ({ success: true, logs: [], buildNumber: "42.1" });
      const run = await executeMobilePublish(testDir, { stores: ["app-store"] }, executor);
      expect(formatMobileRunFull(run)).toContain("42.1");
    });
  });

  // ─── generateMobilePublishSummary ─────────────────────────────────────

  describe("generateMobilePublishSummary", () => {
    test("includes short id", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(generateMobilePublishSummary(run)).toContain(run.id.slice(0, 7));
    });

    test("includes succeeded count", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(generateMobilePublishSummary(run)).toContain("2 succeeded");
    });

    test("includes failed count", async () => {
      initDefault();
      const executor = async () => ({ success: false, error: "f", logs: [] });
      const run = await executeMobilePublish(testDir, undefined, executor);
      expect(generateMobilePublishSummary(run)).toContain("2 failed");
    });

    test("includes total count", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(generateMobilePublishSummary(run)).toContain("2 total");
    });

    test("includes version", async () => {
      initDefault();
      const run = await executeMobilePublish(testDir);
      expect(generateMobilePublishSummary(run)).toContain(APP_VERSION);
    });
  });

  // ─── destroyMobilePublisher ───────────────────────────────────────────

  describe("destroyMobilePublisher", () => {
    test("returns false if not initialized", () => {
      expect(destroyMobilePublisher(testDir)).toBe(false);
    });

    test("returns true after destroying", () => {
      initDefault();
      expect(destroyMobilePublisher(testDir)).toBe(true);
    });

    test("removes .mobile-publisher directory", () => {
      initDefault();
      destroyMobilePublisher(testDir);
      expect(existsSync(join(testDir, ".mobile-publisher"))).toBe(false);
    });

    test("getMobilePublishState returns null after destroy", () => {
      initDefault();
      destroyMobilePublisher(testDir);
      expect(getMobilePublishState(testDir)).toBeNull();
    });
  });

  // ─── checkGooglePlayAuth ──────────────────────────────────────────────

  describe("checkGooglePlayAuth", () => {
    test("returns not authenticated for empty path", () => {
      const { checkGooglePlayAuth } = require("./mobile-publisher");
      const result = checkGooglePlayAuth("");
      expect(result.authenticated).toBe(false);
      expect(result.store).toBe("google-play");
    });

    test("returns not authenticated for missing file", () => {
      const { checkGooglePlayAuth } = require("./mobile-publisher");
      const result = checkGooglePlayAuth("/nonexistent/path.json");
      expect(result.authenticated).toBe(false);
    });

    test("returns authenticated for valid service account key", () => {
      const { checkGooglePlayAuth } = require("./mobile-publisher");
      const keyPath = join(testDir, "sa-key.json");
      writeFileSync(keyPath, JSON.stringify({ client_email: "test@test.iam.gserviceaccount.com" }));
      const result = checkGooglePlayAuth(keyPath);
      expect(result.authenticated).toBe(true);
      expect(result.identity).toBe("test@test.iam.gserviceaccount.com");
    });

    test("returns not authenticated for invalid JSON", () => {
      const { checkGooglePlayAuth } = require("./mobile-publisher");
      const keyPath = join(testDir, "bad-key.json");
      writeFileSync(keyPath, "not json");
      const result = checkGooglePlayAuth(keyPath);
      expect(result.authenticated).toBe(false);
    });

    test("returns not authenticated for key without client_email", () => {
      const { checkGooglePlayAuth } = require("./mobile-publisher");
      const keyPath = join(testDir, "no-email.json");
      writeFileSync(keyPath, JSON.stringify({ type: "service_account" }));
      const result = checkGooglePlayAuth(keyPath);
      expect(result.authenticated).toBe(false);
    });
  });

  // ─── checkAppStoreAuth ────────────────────────────────────────────────

  describe("checkAppStoreAuth", () => {
    test("returns not authenticated for missing apiKeyId", () => {
      const { checkAppStoreAuth } = require("./mobile-publisher");
      const result = checkAppStoreAuth({ ...makeAppStoreConfig(), apiKeyId: "" });
      expect(result.authenticated).toBe(false);
      expect(result.store).toBe("app-store");
    });

    test("returns not authenticated for missing issuerId", () => {
      const { checkAppStoreAuth } = require("./mobile-publisher");
      const result = checkAppStoreAuth({ ...makeAppStoreConfig(), issuerId: "" });
      expect(result.authenticated).toBe(false);
    });

    test("returns not authenticated for missing privateKeyPath", () => {
      const { checkAppStoreAuth } = require("./mobile-publisher");
      const result = checkAppStoreAuth({ ...makeAppStoreConfig(), privateKeyPath: "" });
      expect(result.authenticated).toBe(false);
    });

    test("returns not authenticated for nonexistent key file", () => {
      const { checkAppStoreAuth } = require("./mobile-publisher");
      const result = checkAppStoreAuth(makeAppStoreConfig());
      expect(result.authenticated).toBe(false);
    });

    test("returns authenticated when all fields and file exist", () => {
      const { checkAppStoreAuth } = require("./mobile-publisher");
      const keyPath = join(testDir, "AuthKey.p8");
      writeFileSync(keyPath, "fake-key-content");
      const config = { ...makeAppStoreConfig(), privateKeyPath: keyPath };
      const result = checkAppStoreAuth(config);
      expect(result.authenticated).toBe(true);
      expect(result.identity).toContain("KEY123");
    });
  });
});
