import { createHash } from "crypto";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { type GodotVersion, getDownloadFilename } from "./version.js";
import { clearQuarantine } from "./detect.js";

const GODOT_RELEASES_BASE_URL =
  "https://github.com/godotengine/godot-builds/releases/download";

export interface DownloadOptions {
  version: GodotVersion;
  destDir: string;
  platform?: NodeJS.Platform;
  arch?: string;
  onProgress?: (downloaded: number, total: number) => void;
}

export interface DownloadResult {
  success: boolean;
  path: string | null;
  error?: string;
  sha512?: string;
}

function getDownloadUrl(version: GodotVersion, platform: NodeJS.Platform, arch: string): string {
  const tag = `${version.major}.${version.minor}-${version.label}`;
  const filename = getDownloadFilename(version, platform, arch);
  return `${GODOT_RELEASES_BASE_URL}/${tag}/${filename}`;
}

export async function verifySha512(filePath: string, expectedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha512");
    const stream = createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex") === expectedHash.toLowerCase()));
    stream.on("error", reject);
  });
}

export async function computeSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha512");
    const stream = createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function downloadGodot(options: DownloadOptions): Promise<DownloadResult> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const url = getDownloadUrl(options.version, platform, arch);

  if (!existsSync(options.destDir)) {
    mkdirSync(options.destDir, { recursive: true });
  }

  const filename = getDownloadFilename(options.version, platform, arch);
  const destPath = join(options.destDir, filename);

  if (existsSync(destPath)) {
    return { success: true, path: destPath };
  }

  return {
    success: false,
    path: null,
    error: `Download not yet implemented. Install Godot manually from: ${url}`,
  };
}

if (import.meta.main) {
  const { parseGodotVersion, formatVersion } = await import("./version.js");
  const version = parseGodotVersion("4.6.stable.official.89cea1439");
  if (version) {
    console.log(`Download URL: ${getDownloadUrl(version, process.platform, process.arch)}`);
    console.log(`Filename: ${getDownloadFilename(version, process.platform, process.arch)}`);
    const result = await downloadGodot({ version, destDir: "/tmp/godot-test" });
    console.log(`Result: ${JSON.stringify(result, null, 2)}`);
  }
}
