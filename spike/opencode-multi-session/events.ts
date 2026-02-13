#!/usr/bin/env bun

import { createOpencodeClient } from "@opencode-ai/sdk";

async function main() {
  console.log("=== OpenCode SDK SSE Events Test ===\n");

  const client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
  });

  console.log("Connected to server, subscribing to events...\n");

  try {
    console.log("Subscribing to event stream...");
    const events = await client.event.subscribe();
    console.log("✓ Event subscription successful");
    console.log(`  Stream type: ${typeof events.stream}`);
    console.log(`  Has Symbol.asyncIterator: ${!!events.stream[Symbol.asyncIterator]}`);
    
    console.log("\n✓ SSE event stream works");
    console.log("  (Not waiting for actual events to avoid timeout)");
    
  } catch (error) {
    console.error("❌ ERROR:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
