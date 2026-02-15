import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join, resolve } from "path";

export interface PluginConfig {
  name: string;
  description: string;
  author: string;
  version: string;
  script: string;
}

export interface GodotPlugin {
  id: string;
  config: PluginConfig;
  path: string;
  enabled: boolean;
}

export interface InstallPluginOptions {
  sourcePath: string;
  overwrite?: boolean;
}

export interface PluginInstallResult {
  success: boolean;
  pluginId: string;
  error?: string;
}

/**
 * Godot plugin.cfg format:
 * ```
 * [plugin]
 * name="My Plugin"
 * description="A useful plugin"
 * author="Author Name"
 * version="1.0.0"
 * script="plugin.gd"
 * ```
 */
export function parsePluginCfg(content: string): PluginConfig | null {
  if (!content.includes("[plugin]")) return null;

  const nameMatch = content.match(/^name="([^"]*)"/m);
  const descMatch = content.match(/^description="([^"]*)"/m);
  const authorMatch = content.match(/^author="([^"]*)"/m);
  const versionMatch = content.match(/^version="([^"]*)"/m);
  const scriptMatch = content.match(/^script="([^"]*)"/m);

  if (!nameMatch || !scriptMatch) return null;

  return {
    name: nameMatch[1],
    description: descMatch?.[1] ?? "",
    author: authorMatch?.[1] ?? "",
    version: versionMatch?.[1] ?? "",
    script: scriptMatch[1],
  };
}

export function readPluginConfig(pluginDir: string): PluginConfig | null {
  const cfgPath = join(pluginDir, "plugin.cfg");
  if (!existsSync(cfgPath)) return null;

  const content = readFileSync(cfgPath, "utf-8");
  return parsePluginCfg(content);
}

/**
 * Reads enabled plugin IDs from project.godot's [editor_plugins] section.
 * Format: `enabled=PackedStringArray("res://addons/plugin_id/plugin.gd", ...)`
 */
export function getEnabledPlugins(projectPath: string): string[] {
  const projectFile = join(resolve(projectPath), "project.godot");
  if (!existsSync(projectFile)) return [];

  const content = readFileSync(projectFile, "utf-8");

  const sectionMatch = content.match(/\[editor_plugins\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (!sectionMatch) return [];

  const enabledMatch = sectionMatch[1].match(/enabled=PackedStringArray\(([^)]*)\)/);
  if (!enabledMatch) return [];

  const entries = enabledMatch[1].match(/"([^"]+)"/g);
  if (!entries) return [];

  return entries
    .map((e) => e.replace(/"/g, ""))
    .map((path) => {
      const match = path.match(/res:\/\/addons\/([^/]+)\//);
      return match?.[1] ?? null;
    })
    .filter((id): id is string => id !== null);
}

function writeEnabledPlugins(projectPath: string, pluginIds: string[]): void {
  const projectFile = join(resolve(projectPath), "project.godot");
  if (!existsSync(projectFile)) {
    throw new Error(`project.godot not found at ${projectFile}`);
  }

  let content = readFileSync(projectFile, "utf-8");

  const addonsDir = join(resolve(projectPath), "addons");
  const scriptPaths: string[] = [];

  for (const id of pluginIds) {
    const config = readPluginConfig(join(addonsDir, id));
    if (config) {
      scriptPaths.push(`res://addons/${id}/${config.script}`);
    }
  }

  const enabledLine =
    scriptPaths.length > 0
      ? `enabled=PackedStringArray(${scriptPaths.map((p) => `"${p}"`).join(", ")})`
      : "";

  if (content.includes("[editor_plugins]")) {
    content = content.replace(
      /\[editor_plugins\]\s*\n[\s\S]*?(?=\n\[|$)/,
      enabledLine ? `[editor_plugins]\n\n${enabledLine}\n` : "",
    );
  } else if (enabledLine) {
    content = content.trimEnd() + `\n\n[editor_plugins]\n\n${enabledLine}\n`;
  }

  writeFileSync(projectFile, content, "utf-8");
}

export function listPlugins(projectPath: string): GodotPlugin[] {
  const addonsDir = join(resolve(projectPath), "addons");
  if (!existsSync(addonsDir)) return [];

  const enabledIds = getEnabledPlugins(projectPath);
  const plugins: GodotPlugin[] = [];

  const entries = readdirSync(addonsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = join(addonsDir, entry.name);
    const config = readPluginConfig(pluginDir);
    if (!config) continue;

    plugins.push({
      id: entry.name,
      config,
      path: pluginDir,
      enabled: enabledIds.includes(entry.name),
    });
  }

  return plugins.sort((a, b) => a.id.localeCompare(b.id));
}

export function getPlugin(projectPath: string, pluginId: string): GodotPlugin | null {
  const pluginDir = join(resolve(projectPath), "addons", pluginId);
  const config = readPluginConfig(pluginDir);
  if (!config) return null;

  const enabledIds = getEnabledPlugins(projectPath);
  return {
    id: pluginId,
    config,
    path: pluginDir,
    enabled: enabledIds.includes(pluginId),
  };
}

export function installPlugin(
  projectPath: string,
  pluginId: string,
  options: InstallPluginOptions,
): PluginInstallResult {
  const absProject = resolve(projectPath);
  const absSource = resolve(options.sourcePath);

  const config = readPluginConfig(absSource);
  if (!config) {
    return { success: false, pluginId, error: "Source directory does not contain a valid plugin.cfg" };
  }

  const addonsDir = join(absProject, "addons");
  const targetDir = join(addonsDir, pluginId);

  if (existsSync(targetDir) && !options.overwrite) {
    return { success: false, pluginId, error: `Plugin "${pluginId}" is already installed` };
  }

  if (!existsSync(addonsDir)) {
    mkdirSync(addonsDir, { recursive: true });
  }

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  copyDirRecursive(absSource, targetDir);

  return { success: true, pluginId };
}

export function removePlugin(projectPath: string, pluginId: string): boolean {
  const absProject = resolve(projectPath);
  const pluginDir = join(absProject, "addons", pluginId);

  if (!existsSync(pluginDir)) return false;

  const enabledIds = getEnabledPlugins(absProject);
  if (enabledIds.includes(pluginId)) {
    writeEnabledPlugins(
      absProject,
      enabledIds.filter((id) => id !== pluginId),
    );
  }

  rmSync(pluginDir, { recursive: true, force: true });

  return true;
}

export function enablePlugin(projectPath: string, pluginId: string): boolean {
  const absProject = resolve(projectPath);
  const pluginDir = join(absProject, "addons", pluginId);

  const config = readPluginConfig(pluginDir);
  if (!config) return false;

  const enabledIds = getEnabledPlugins(absProject);
  if (enabledIds.includes(pluginId)) return false;

  enabledIds.push(pluginId);
  writeEnabledPlugins(absProject, enabledIds);
  return true;
}

export function disablePlugin(projectPath: string, pluginId: string): boolean {
  const absProject = resolve(projectPath);

  const enabledIds = getEnabledPlugins(absProject);
  if (!enabledIds.includes(pluginId)) return false;

  writeEnabledPlugins(
    absProject,
    enabledIds.filter((id) => id !== pluginId),
  );
  return true;
}

export function validatePluginStructure(pluginDir: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const absDir = resolve(pluginDir);

  if (!existsSync(absDir)) {
    return { valid: false, errors: [`Directory does not exist: ${absDir}`] };
  }

  const cfgPath = join(absDir, "plugin.cfg");
  if (!existsSync(cfgPath)) {
    errors.push("Missing plugin.cfg");
    return { valid: false, errors };
  }

  const config = readPluginConfig(absDir);
  if (!config) {
    errors.push("Invalid plugin.cfg: missing [plugin] section, name, or script field");
    return { valid: false, errors };
  }

  if (!config.name) {
    errors.push("plugin.cfg: name is empty");
  }

  if (!config.script) {
    errors.push("plugin.cfg: script is empty");
  }

  const scriptPath = join(absDir, config.script);
  if (!existsSync(scriptPath)) {
    errors.push(`Referenced script not found: ${config.script}`);
  }

  if (!config.version) {
    errors.push("plugin.cfg: version is empty");
  }

  return { valid: errors.length === 0, errors };
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
