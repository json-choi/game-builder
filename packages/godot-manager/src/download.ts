import { createHash } from "crypto";
import { execSync } from "child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { type GodotVersion, getDownloadFilename, getBinaryName } from "./version.js";

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

function getSha512Url(version: GodotVersion, platform: NodeJS.Platform, arch: string): string {
  return `${getDownloadUrl(version, platform, arch)}.sha512`;
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

async function fetchWithRedirects(url: string, maxRedirects = 10): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i < maxRedirects; i++) {
    const response = await fetch(currentUrl, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect ${response.status} without Location header`);
      }
      currentUrl = location;
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (max ${maxRedirects})`);
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  const response = await fetchWithRedirects(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const fileStream = createWriteStream(destPath);
  const reader = response.body.getReader();
  let downloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(Buffer.from(value));
      downloaded += value.byteLength;

      if (onProgress && total > 0) {
        onProgress(downloaded, total);
      }
    }
  } finally {
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });
  }
}

async function fetchExpectedSha512(
  version: GodotVersion,
  platform: NodeJS.Platform,
  arch: string,
): Promise<string | null> {
  const sha512Url = getSha512Url(version, platform, arch);
  try {
    const response = await fetchWithRedirects(sha512Url);
    if (!response.ok) return null;

    const text = await response.text();
    const hash = text.trim().split(/\s+/)[0];
    if (hash && /^[a-f0-9]{128}$/i.test(hash)) {
      return hash.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

function extractArchive(archivePath: string, destDir: string, platform: NodeJS.Platform): void {
  const ext = archivePath.toLowerCase();

  if (ext.endsWith(".zip")) {
    if (platform === "win32") {
      execSync(
        `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`,
        { timeout: 120_000, stdio: "pipe" },
      );
    } else {
      execSync(`unzip -o "${archivePath}" -d "${destDir}"`, {
        timeout: 120_000,
        stdio: "pipe",
      });
    }
  } else if (ext.endsWith(".tar.gz") || ext.endsWith(".tgz")) {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, {
      timeout: 120_000,
      stdio: "pipe",
    });
  } else {
    throw new Error(`Unsupported archive format: ${basename(archivePath)}`);
  }
}

function clearQuarantineAttribute(path: string): void {
  if (process.platform !== "darwin") return;
  try {
    execSync(`xattr -cr "${path}"`, { timeout: 10_000, stdio: "pipe" });
  } catch {
    // xattr may fail if no quarantine attribute exists — non-fatal
  }
}

async function extractAndFinalize(
  archivePath: string,
  destDir: string,
  binaryPath: string,
  platform: NodeJS.Platform,
): Promise<DownloadResult> {
  try {
    extractArchive(archivePath, destDir, platform);
  } catch (err) {
    return {
      success: false,
      path: null,
      error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (platform === "darwin") {
    clearQuarantineAttribute(join(destDir, "Godot.app"));
  }

  if (!existsSync(binaryPath)) {
    return {
      success: false,
      path: null,
      error: `Extraction succeeded but binary not found at expected path: ${binaryPath}`,
    };
  }

  const sha512 = await computeSha512(archivePath);

  return {
    success: true,
    path: binaryPath,
    sha512,
  };
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
  const binaryName = getBinaryName(options.version, platform, arch);
  const binaryPath = join(options.destDir, binaryName);

  if (existsSync(binaryPath)) {
    return { success: true, path: binaryPath };
  }

  if (existsSync(destPath)) {
    return extractAndFinalize(destPath, options.destDir, binaryPath, platform);
  }

  try {
    await downloadFile(url, destPath, options.onProgress);
  } catch (err) {
    return {
      success: false,
      path: null,
      error: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const expectedHash = await fetchExpectedSha512(options.version, platform, arch);
  if (expectedHash) {
    const valid = await verifySha512(destPath, expectedHash);
    if (!valid) {
      const actualHash = await computeSha512(destPath);
      try { unlinkSync(destPath); } catch { /* ignore cleanup failure */ }
      return {
        success: false,
        path: null,
        error: `SHA-512 verification failed. Expected: ${expectedHash.slice(0, 16)}... Got: ${actualHash.slice(0, 16)}...`,
        sha512: actualHash,
      };
    }
  }

  return extractAndFinalize(destPath, options.destDir, binaryPath, platform);
}

if (import.meta.main) {
  const { parseGodotVersion } = await import("./version.js");
  const version = parseGodotVersion("4.6.stable.official.89cea1439");
  if (version) {
    console.log(`Download URL: ${getDownloadUrl(version, process.platform, process.arch)}`);
    console.log(`Filename: ${getDownloadFilename(version, process.platform, process.arch)}`);
    const result = await downloadGodot({ version, destDir: "/tmp/godot-test" });
    console.log(`Result: ${JSON.stringify(result, null, 2)}`);
  }
}
