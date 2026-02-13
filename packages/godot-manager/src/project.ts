import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export interface GodotProject {
  path: string;
  name: string;
  configVersion: number;
  mainScene: string | null;
  features: string[];
  valid: boolean;
}

export interface CreateProjectOptions {
  name: string;
  mainScene?: string;
  features?: string[];
  viewportWidth?: number;
  viewportHeight?: number;
}

const DEFAULT_PROJECT_GODOT = `; Engine configuration file.
config_version=5

[application]

config/name="{NAME}"
config/features=PackedStringArray("{FEATURES}")

[display]

window/size/viewport_width={WIDTH}
window/size/viewport_height={HEIGHT}
`;

export function isGodotProject(dirPath: string): boolean {
  return existsSync(join(dirPath, "project.godot"));
}

export function parseProjectGodot(dirPath: string): GodotProject | null {
  const projectFile = join(dirPath, "project.godot");
  if (!existsSync(projectFile)) return null;

  const content = readFileSync(projectFile, "utf-8");

  const nameMatch = content.match(/config\/name="([^"]+)"/);
  const configVersionMatch = content.match(/config_version=(\d+)/);
  const mainSceneMatch = content.match(/run\/main_scene="([^"]+)"/);
  const featuresMatch = content.match(/config\/features=PackedStringArray\(([^)]+)\)/);

  const features: string[] = [];
  if (featuresMatch) {
    const featureStr = featuresMatch[1];
    const featureItems = featureStr.match(/"([^"]+)"/g);
    if (featureItems) {
      features.push(...featureItems.map((f) => f.replace(/"/g, "")));
    }
  }

  return {
    path: resolve(dirPath),
    name: nameMatch?.[1] ?? "Unknown",
    configVersion: configVersionMatch ? parseInt(configVersionMatch[1], 10) : 0,
    mainScene: mainSceneMatch?.[1] ?? null,
    features,
    valid: (configVersionMatch?.[1] ?? "0") === "5",
  };
}

export function createProject(dirPath: string, options: CreateProjectOptions): GodotProject {
  const absPath = resolve(dirPath);

  if (!existsSync(absPath)) {
    mkdirSync(absPath, { recursive: true });
  }

  const subdirs = ["scenes", "scripts", "assets"];
  for (const sub of subdirs) {
    const subPath = join(absPath, sub);
    if (!existsSync(subPath)) {
      mkdirSync(subPath, { recursive: true });
    }
  }

  const features = options.features ?? ["4.4", "Forward Plus"];
  const width = options.viewportWidth ?? 1152;
  const height = options.viewportHeight ?? 648;

  const content = DEFAULT_PROJECT_GODOT
    .replace("{NAME}", options.name)
    .replace("{FEATURES}", features.join('", "'))
    .replace("{WIDTH}", String(width))
    .replace("{HEIGHT}", String(height));

  writeFileSync(join(absPath, "project.godot"), content, "utf-8");

  return {
    path: absPath,
    name: options.name,
    configVersion: 5,
    mainScene: options.mainScene ?? null,
    features,
    valid: true,
  };
}

export function validateProjectStructure(dirPath: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const absPath = resolve(dirPath);

  if (!existsSync(absPath)) {
    return { valid: false, errors: [`Directory does not exist: ${absPath}`] };
  }

  if (!existsSync(join(absPath, "project.godot"))) {
    errors.push("Missing project.godot");
  }

  const project = parseProjectGodot(absPath);
  if (project && project.configVersion !== 5) {
    errors.push(`Unsupported config_version: ${project.configVersion} (expected 5)`);
  }

  return { valid: errors.length === 0, errors };
}

if (import.meta.main) {
  const command = process.argv[2];
  const dirPath = process.argv[3];

  if (command === "validate" && dirPath) {
    const result = validateProjectStructure(dirPath);
    console.log(`Valid: ${result.valid}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join(", ")}`);
    }
    const project = parseProjectGodot(dirPath);
    if (project) {
      console.log(`Name: ${project.name}`);
      console.log(`Config version: ${project.configVersion}`);
      console.log(`Features: ${project.features.join(", ")}`);
    }
  } else if (command === "create" && dirPath) {
    const name = process.argv[4] ?? "New Project";
    const project = createProject(dirPath, { name });
    console.log(`Created project: ${project.name} at ${project.path}`);
  } else {
    console.log("Usage:");
    console.log("  bun run project.ts validate <project-path>");
    console.log('  bun run project.ts create <dir-path> [name]');
  }
}
