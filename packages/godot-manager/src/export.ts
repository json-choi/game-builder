import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { spawnSync } from "child_process";
import { exportProject as cliExportProject, type GodotCliOptions } from "./cli.js";
import { detectGodot } from "./detect.js";

export interface ExportPreset {
  name: string;
  platform: "windows" | "macos" | "linux" | "web" | "android" | "ios";
  runnable: boolean;
  exportPath: string;
}

export interface ExportOptions {
  projectPath: string;
  preset: string;
  outputPath: string;
  debug?: boolean;
  onProgress?: (message: string) => void;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  error?: string;
  duration: number;
}

const PLATFORM_MAP: Record<string, ExportPreset["platform"]> = {
  "Windows Desktop": "windows",
  "Linux/X11": "linux",
  "Linux": "linux",
  "macOS": "macos",
  "Mac OSX": "macos",
  "Web": "web",
  "HTML5": "web",
  "Android": "android",
  "iOS": "ios",
};

function parsePlatform(raw: string): ExportPreset["platform"] {
  for (const [key, value] of Object.entries(PLATFORM_MAP)) {
    if (raw.includes(key)) return value;
  }
  return "linux";
}

export function getExportPresets(projectPath: string): ExportPreset[] {
  const cfgPath = join(resolve(projectPath), "export_presets.cfg");
  if (!existsSync(cfgPath)) return [];

  const content = readFileSync(cfgPath, "utf-8");
  const presets: ExportPreset[] = [];
  let current: Partial<ExportPreset> | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[preset.")) {
      if (current?.name) {
        presets.push({
          name: current.name,
          platform: current.platform ?? "linux",
          runnable: current.runnable ?? false,
          exportPath: current.exportPath ?? "",
        });
      }
      current = {};
      continue;
    }

    if (!current) continue;

    const match = trimmed.match(/^(\w+)\s*=\s*"?([^"]*)"?$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key === "name") {
      current.name = value;
    } else if (key === "platform") {
      current.platform = parsePlatform(value);
    } else if (key === "runnable") {
      current.runnable = value === "true";
    } else if (key === "export_path") {
      current.exportPath = value;
    }
  }

  if (current?.name) {
    presets.push({
      name: current.name,
      platform: current.platform ?? "linux",
      runnable: current.runnable ?? false,
      exportPath: current.exportPath ?? "",
    });
  }

  return presets;
}

const DEFAULT_PRESETS: Record<string, { platform: string; extension: string }> = {
  "Windows Desktop": { platform: "Windows Desktop", extension: ".exe" },
  "Linux": { platform: "Linux/X11", extension: "" },
  "macOS": { platform: "macOS", extension: ".dmg" },
  "Web": { platform: "Web", extension: ".html" },
};

export function createDefaultPresets(projectPath: string, platform?: string): void {
  const absProject = resolve(projectPath);
  const cfgPath = join(absProject, "export_presets.cfg");

  const entries = platform
    ? { [platform]: DEFAULT_PRESETS[platform] ?? DEFAULT_PRESETS["Linux"] }
    : DEFAULT_PRESETS;

  let cfg = "";
  let index = 0;

  for (const [name, info] of Object.entries(entries)) {
    const exportDir = join("exports", name.toLowerCase().replace(/\s+/g, "-"));
    const exportFile = `game${info.extension}`;
    cfg += `[preset.${index}]\n\n`;
    cfg += `name="${name}"\n`;
    cfg += `platform="${info.platform}"\n`;
    cfg += `runnable=true\n`;
    cfg += `export_path="${exportDir}/${exportFile}"\n\n`;
    index++;
  }

  writeFileSync(cfgPath, cfg, "utf-8");
}

export async function exportProject(options: ExportOptions): Promise<ExportResult> {
  const start = Date.now();
  const absOutput = resolve(options.outputPath);

  const outputDir = dirname(absOutput);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  options.onProgress?.(`Starting export with preset "${options.preset}"...`);

  const cliOptions: GodotCliOptions = {
    timeout: 120_000,
  };

  try {
    const result = await cliExportProject(
      options.projectPath,
      options.preset,
      absOutput,
      cliOptions,
    );

    const duration = Date.now() - start;

    if (result.timedOut) {
      options.onProgress?.("Export timed out");
      return { success: false, outputPath: absOutput, error: "Export timed out", duration };
    }

    if (result.exitCode !== 0) {
      const errorMsg = result.stderr.trim() || `Export failed with exit code ${result.exitCode}`;
      options.onProgress?.(`Export failed: ${errorMsg}`);
      return { success: false, outputPath: absOutput, error: errorMsg, duration };
    }

    options.onProgress?.("Export completed successfully");
    return { success: true, outputPath: absOutput, duration };
  } catch (err) {
    const duration = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    options.onProgress?.(`Export error: ${errorMsg}`);
    return { success: false, outputPath: absOutput, error: errorMsg, duration };
  }
}

export function checkExportTemplates(godotPath: string): { installed: boolean; version?: string } {
  try {
    const result = spawnSync(godotPath, ["--version"], {
      timeout: 10_000,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      return { installed: false };
    }

    const version = result.stdout.trim().split("\n")[0];

    const detection = detectGodot();
    if (!detection.found) {
      return { installed: false, version };
    }

    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const templatePaths = [
      join(homeDir, ".local", "share", "godot", "export_templates"),
      join(homeDir, "Library", "Application Support", "Godot", "export_templates"),
      join(homeDir, "AppData", "Roaming", "Godot", "export_templates"),
    ];

    for (const templatePath of templatePaths) {
      if (existsSync(templatePath)) {
        return { installed: true, version };
      }
    }

    return { installed: false, version };
  } catch {
    return { installed: false };
  }
}

export function getExportTemplateUrl(version: string): string {
  const cleanVersion = version.replace(/[.\-]stable$/, "").trim();
  return `https://github.com/godotengine/godot/releases/download/${cleanVersion}-stable/Godot_v${cleanVersion}-stable_export_templates.tpz`;
}
