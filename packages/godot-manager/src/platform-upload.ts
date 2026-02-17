import { readdirSync, statSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, basename } from "path";
import { exportProject, type ExportOptions, type ExportResult, getExportPresets } from "./export.js";

export interface PlatformUploadOptions {
  projectPath: string;
  apiUrl: string;
  onProgress?: (message: string) => void;
}

export interface PlatformUploadResult {
  success: boolean;
  gameUrl?: string;
  gameId?: string;
  error?: string;
  exportResult?: ExportResult;
}

export function findWebPreset(projectPath: string): { name: string; exportPath: string } | null {
  const presets = getExportPresets(projectPath);
  const webPreset = presets.find(
    (p) => p.platform === "web" || p.name.toLowerCase().includes("web") || p.name.toLowerCase().includes("html5")
  );

  if (!webPreset) return null;

  return {
    name: webPreset.name,
    exportPath: webPreset.exportPath,
  };
}

function collectFiles(dir: string, baseDir: string): { path: string; relativePath: string }[] {
  const files: { path: string; relativePath: string }[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else {
      files.push({
        path: fullPath,
        relativePath: fullPath.slice(baseDir.length + 1),
      });
    }
  }

  return files;
}

function createMultipartBoundary(): string {
  return `----GameBuilder${Date.now()}${Math.random().toString(36).slice(2)}`;
}

export async function uploadToPlatform(options: PlatformUploadOptions): Promise<PlatformUploadResult> {
  const { projectPath, apiUrl, onProgress } = options;

  onProgress?.("Finding Web export preset...");

  const webPreset = findWebPreset(projectPath);
  if (!webPreset) {
    return {
      success: false,
      error: "No Web export preset found. Please add a Web preset in Project > Export.",
    };
  }

  onProgress?.(`Using preset: ${webPreset.name}`);

  const exportDir = join(projectPath, ".platform-export");
  const outputFileName = "game.html";
  const outputPath = join(exportDir, outputFileName);

  if (existsSync(exportDir)) {
    rmSync(exportDir, { recursive: true });
  }
  mkdirSync(exportDir, { recursive: true });

  onProgress?.("Exporting project for Web...");

  const exportOptions: ExportOptions = {
    projectPath,
    preset: webPreset.name,
    outputPath,
    onProgress: (msg) => onProgress?.(`[Export] ${msg}`),
  };

  const exportResult = await exportProject(exportOptions);

  if (!exportResult.success) {
    return {
      success: false,
      error: exportResult.error || "Export failed",
      exportResult,
    };
  }

  onProgress?.("Export completed. Preparing upload...");

  const files = collectFiles(exportDir, exportDir);

  if (files.length === 0) {
    return {
      success: false,
      error: "No files were exported",
      exportResult,
    };
  }

  onProgress?.(`Found ${files.length} files to upload`);

  const boundary = createMultipartBoundary();
  const parts: Buffer[] = [];

  for (const file of files) {
    const fileContent = readFileSync(file.path);
    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files"; filename="${file.relativePath}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    );
    parts.push(header);
    parts.push(fileContent);
    parts.push(Buffer.from("\r\n"));
  }

  const projectName = basename(projectPath);
  const nameField = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="name"\r\n\r\n` +
      `${projectName}\r\n`
  );
  parts.push(nameField);

  const endBoundary = Buffer.from(`--${boundary}--\r\n`);
  parts.push(endBoundary);

  const body = Buffer.concat(parts);

  onProgress?.("Uploading to platform...");

  try {
    const response = await fetch(`${apiUrl}/api/games`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      let errorMsg = `Upload failed (${response.status})`;
      try {
        const errorData = (await response.json()) as { message?: string; error?: string };
        errorMsg = errorData.message || errorData.error || errorMsg;
      } catch {
        // Ignore JSON parse errors
      }
      return {
        success: false,
        error: errorMsg,
        exportResult,
      };
    }

    const result = (await response.json()) as {
      id?: string;
      url?: string;
      gameUrl?: string;
      playUrl?: string;
    };

    const gameUrl = result.url || result.gameUrl || result.playUrl;

    onProgress?.("Upload completed successfully!");

    try {
      rmSync(exportDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: true,
      gameUrl,
      gameId: result.id,
      exportResult,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Upload error: ${errorMsg}`,
      exportResult,
    };
  }
}
