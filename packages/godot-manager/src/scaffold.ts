import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import { readdirSync, statSync } from "fs";

export interface ScaffoldOptions {
  name: string;
  template?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Recursively copy a directory and its contents
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip .godot directory (editor cache)
    if (entry.name === ".godot") {
      continue;
    }

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Customize project.godot with project-specific settings
 */
function customizeProjectGodot(
  projectPath: string,
  options: ScaffoldOptions
): void {
  const projectFile = join(projectPath, "project.godot");

  if (!existsSync(projectFile)) {
    throw new Error(`project.godot not found at ${projectFile}`);
  }

  let content = readFileSync(projectFile, "utf-8");

  // Replace project name
  content = content.replace(
    /config\/name="[^"]*"/,
    `config/name="${options.name}"`
  );

  // Replace viewport dimensions if provided
  if (options.viewportWidth) {
    content = content.replace(
      /window\/size\/viewport_width=\d+/,
      `window/size/viewport_width=${options.viewportWidth}`
    );
  }

  if (options.viewportHeight) {
    content = content.replace(
      /window\/size\/viewport_height=\d+/,
      `window/size/viewport_height=${options.viewportHeight}`
    );
  }

  writeFileSync(projectFile, content, "utf-8");
}

/**
 * Create a new Godot project from a template
 *
 * @param projectPath - Absolute path where the project will be created
 * @param options - Scaffold options (name, template, viewport dimensions)
 * @returns Path to the created project
 *
 * @example
 * ```typescript
 * const projectPath = scaffoldProject("/path/to/my-game", {
 *   name: "My Game",
 *   template: "basic-2d"
 * });
 * ```
 */
export function scaffoldProject(
  projectPath: string,
  options: ScaffoldOptions
): string {
  const absPath = resolve(projectPath);
  const templateName = options.template ?? "basic-2d";

  // Resolve template path relative to this file
  const templatePath = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "templates",
    templateName
  );

  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  // Create project directory
  if (!existsSync(absPath)) {
    mkdirSync(absPath, { recursive: true });
  }

  // Copy template to project directory
  copyDirRecursive(templatePath, absPath);

  // Customize project.godot
  customizeProjectGodot(absPath, options);

  return absPath;
}

/**
 * Get available templates
 */
export function getAvailableTemplates(): string[] {
  const templatesDir = resolve(__dirname, "..", "..", "..", "templates");

  if (!existsSync(templatesDir)) {
    return [];
  }

  return readdirSync(templatesDir)
    .filter((name) => {
      const path = join(templatesDir, name);
      return statSync(path).isDirectory();
    })
    .sort();
}

/**
 * CLI interface for scaffold
 */
if (import.meta.main) {
  const command = process.argv[2];
  const projectPath = process.argv[3];
  const projectName = process.argv[4];

  if (command === "create" && projectPath && projectName) {
    try {
      const result = scaffoldProject(projectPath, { name: projectName });
      console.log(`✓ Created project: ${projectName}`);
      console.log(`  Path: ${result}`);
      console.log(`  Template: basic-2d`);
    } catch (error) {
      console.error(`✗ Failed to create project: ${error}`);
      process.exit(1);
    }
  } else if (command === "list") {
    const templates = getAvailableTemplates();
    console.log("Available templates:");
    templates.forEach((t) => console.log(`  - ${t}`));
  } else {
    console.log("Usage:");
    console.log("  bun run scaffold.ts create <project-path> <project-name>");
    console.log("  bun run scaffold.ts list");
  }
}
