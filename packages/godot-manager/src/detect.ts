import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseGodotVersion,
  isVersionCompatible,
  formatVersion,
  type GodotVersion,
} from "./version.js";

export interface DetectionResult {
  found: boolean;
  path: string | null;
  version: GodotVersion | null;
  compatible: boolean;
  source: "path" | "common-location" | "user-config" | "none";
}

const MACOS_LOCATIONS = [
  "/Applications/Godot.app/Contents/MacOS/Godot",
  "/Applications/Godot_mono.app/Contents/MacOS/Godot",
  join(process.env.HOME ?? "", "Applications/Godot.app/Contents/MacOS/Godot"),
  "/opt/homebrew/bin/godot",
  "/usr/local/bin/godot",
];

const LINUX_LOCATIONS = [
  "/usr/bin/godot",
  "/usr/local/bin/godot",
  "/snap/bin/godot",
  join(process.env.HOME ?? "", ".local/bin/godot"),
  "/opt/godot/godot",
];

const WINDOWS_LOCATIONS = [
  "C:\\Program Files\\Godot\\Godot.exe",
  "C:\\Program Files (x86)\\Godot\\Godot.exe",
  join(process.env.LOCALAPPDATA ?? "", "Godot\\Godot.exe"),
  join(process.env.USERPROFILE ?? "", "scoop\\apps\\godot\\current\\godot.exe"),
];

function getCommonLocations(): string[] {
  switch (process.platform) {
    case "darwin":
      return MACOS_LOCATIONS;
    case "linux":
      return LINUX_LOCATIONS;
    case "win32":
      return WINDOWS_LOCATIONS;
    default:
      return [];
  }
}

function getVersionFromBinary(binaryPath: string): GodotVersion | null {
  try {
    const output = execSync(`"${binaryPath}" --version`, {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return parseGodotVersion(output);
  } catch {
    return null;
  }
}

function findInPath(): string | null {
  try {
    const cmd = process.platform === "win32" ? "where godot" : "which godot";
    return execSync(cmd, {
      timeout: 3000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function getUserConfigPath(): string | null {
  const configPath = join(
    process.env.HOME ?? process.env.USERPROFILE ?? "",
    ".game-builder",
    "config.json",
  );

  if (!existsSync(configPath)) return null;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const godotPath = config?.godot?.path;
    if (typeof godotPath === "string" && existsSync(godotPath)) {
      return godotPath;
    }
  } catch {
    // ignore malformed config
  }
  return null;
}

export function detectGodot(): DetectionResult {
  const notFound: DetectionResult = {
    found: false,
    path: null,
    version: null,
    compatible: false,
    source: "none",
  };

  const userConfigPath = getUserConfigPath();
  if (userConfigPath) {
    const version = getVersionFromBinary(userConfigPath);
    if (version) {
      return {
        found: true,
        path: userConfigPath,
        version,
        compatible: isVersionCompatible(version),
        source: "user-config",
      };
    }
  }

  const pathBinary = findInPath();
  if (pathBinary) {
    const version = getVersionFromBinary(pathBinary);
    if (version) {
      return {
        found: true,
        path: pathBinary,
        version,
        compatible: isVersionCompatible(version),
        source: "path",
      };
    }
  }

  for (const location of getCommonLocations()) {
    if (existsSync(location)) {
      const version = getVersionFromBinary(location);
      if (version) {
        return {
          found: true,
          path: location,
          version,
          compatible: isVersionCompatible(version),
          source: "common-location",
        };
      }
    }
  }

  return notFound;
}

export function getArchitecture(): { platform: NodeJS.Platform; arch: string; archLabel: string } {
  const arch = process.arch;
  return {
    platform: process.platform,
    arch,
    archLabel: arch === "arm64" ? "ARM64" : "x86_64",
  };
}

// macOS Gatekeeper: remove quarantine attribute from downloaded Godot binaries
export function clearQuarantine(appPath: string): boolean {
  if (process.platform !== "darwin") return true;
  try {
    execSync(`xattr -cr "${appPath}"`, { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const result = detectGodot();
  const arch = getArchitecture();

  if (result.found && result.version) {
    console.log(`Godot found: ${result.path}`);
    console.log(`Version: ${formatVersion(result.version)} (${result.version.raw})`);
    console.log(`Compatible: ${result.compatible}`);
    console.log(`Source: ${result.source}`);
  } else {
    console.log("Godot not found");
  }
  console.log(`Platform: ${arch.platform} (${arch.archLabel})`);
}
