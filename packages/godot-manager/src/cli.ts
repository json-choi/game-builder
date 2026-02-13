import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { detectGodot } from "./detect.js";

export interface GodotCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface GodotCliOptions {
  godotPath?: string;
  timeout?: number;
  cwd?: string;
}

const DEFAULT_TIMEOUT = 30_000;

function resolveGodotPath(options?: GodotCliOptions): string {
  if (options?.godotPath) return options.godotPath;

  const detection = detectGodot();
  if (!detection.found || !detection.path) {
    throw new Error("Godot not found. Install Godot or set godotPath in options.");
  }
  return detection.path;
}

function runGodot(args: string[], options?: GodotCliOptions): Promise<GodotCliResult> {
  const godotPath = resolveGodotPath(options);
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child: ChildProcess;

    try {
      child = spawn(godotPath, args, {
        cwd: options?.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (err) {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: `Failed to spawn Godot: ${err}`,
        timedOut: false,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);

    child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: stderr + `\n${err.message}`, timedOut });
    });
  });
}

// --check-only requires --script; validates a single GDScript file within a project
export async function checkOnly(projectPath: string, scriptPath?: string, options?: GodotCliOptions): Promise<GodotCliResult> {
  const absProject = resolve(projectPath);
  if (scriptPath) {
    return runGodot(["--headless", "--path", absProject, "--check-only", "--script", scriptPath], options);
  }
  // Without a specific script, use --import to validate the project loads correctly
  return runGodot(["--headless", "--import", "--path", absProject], {
    ...options,
    timeout: options?.timeout ?? 60_000,
  });
}

export async function runHeadless(projectPath: string, extraArgs: string[] = [], options?: GodotCliOptions): Promise<GodotCliResult> {
  return runGodot(["--headless", "--path", resolve(projectPath), ...extraArgs], options);
}

export async function exportProject(
  projectPath: string,
  preset: string,
  outputPath: string,
  options?: GodotCliOptions,
): Promise<GodotCliResult> {
  return runGodot(
    ["--headless", "--path", resolve(projectPath), "--export-release", preset, resolve(outputPath)],
    options,
  );
}

export async function getVersion(options?: GodotCliOptions): Promise<GodotCliResult> {
  return runGodot(["--version"], options);
}

export function spawnGodotEditor(projectPath: string, options?: GodotCliOptions): ChildProcess {
  const godotPath = resolveGodotPath(options);
  return spawn(godotPath, ["--path", resolve(projectPath)], {
    detached: true,
    stdio: "ignore",
  });
}

export function spawnGodotPreview(
  projectPath: string,
  position?: { x: number; y: number },
  options?: GodotCliOptions,
): ChildProcess {
  const godotPath = resolveGodotPath(options);
  const args = ["--path", resolve(projectPath)];
  if (position) {
    args.push("--position", `${position.x},${position.y}`);
  }
  return spawn(godotPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

if (import.meta.main) {
  const command = process.argv[2];
  const projectPath = process.argv[3];

  if (command === "check-only" && projectPath) {
    const result = await checkOnly(projectPath, undefined, { timeout: 60_000 });
    console.log(`Exit code: ${result.exitCode}`);
    if (result.stdout) console.log(`stdout: ${result.stdout}`);
    if (result.stderr) console.log(`stderr: ${result.stderr}`);
    if (result.timedOut) console.log("TIMED OUT");
    process.exit(result.exitCode);
  } else if (command === "version") {
    const result = await getVersion();
    console.log(result.stdout.trim());
    process.exit(result.exitCode);
  } else {
    console.log("Usage:");
    console.log("  bun run cli.ts check-only <project-path>");
    console.log("  bun run cli.ts version");
    process.exit(1);
  }
}
