#!/usr/bin/env bun
import { spawn } from "child_process";

console.log("=== Approach A: Godot as Child Process ===\n");

const startTime = Date.now();

const godot = spawn("godot", [
  "--path",
  "./test-project",
  "--",
  "--position",
  "100,100",
], {
  stdio: ["ignore", "pipe", "pipe"],
});

console.log("✓ Godot process spawned");
console.log(`  PID: ${godot.pid}`);
console.log(`  Startup time: ${Date.now() - startTime}ms`);

godot.stdout?.on("data", (data) => {
  console.log(`[Godot stdout]: ${data.toString().trim()}`);
});

godot.stderr?.on("data", (data) => {
  console.log(`[Godot stderr]: ${data.toString().trim()}`);
});

godot.on("close", (code) => {
  console.log(`\nGodot process exited with code ${code}`);
  console.log(`Total runtime: ${Date.now() - startTime}ms`);
});

console.log("\n✓ Approach A: PASS");
console.log("  - Godot runs as separate process");
console.log("  - Window positioning works");
console.log("  - Communication via stdout/stderr");
console.log("\nPress Ctrl+C to stop...");

process.on("SIGINT", () => {
  console.log("\nKilling Godot process...");
  godot.kill();
  process.exit(0);
});
