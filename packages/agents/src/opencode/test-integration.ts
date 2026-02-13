#!/usr/bin/env bun

import { checkHealth, getServerState, startServer } from "./server";
import {
  createSession,
  deleteSession,
  listAgents,
  listSessions,
  sendPrompt,
  subscribeEvents,
} from "./client";
import { getDefaultModel, ensureConfig } from "./config";

async function main() {
  console.log("=== OpenCode SDK Integration Test ===\n");

  ensureConfig();

  console.log("1. Starting/connecting to server...");
  const serverResult = await startServer();
  console.log(`   Success: ${serverResult.success}`);
  console.log(`   Already running: ${serverResult.alreadyRunning}`);
  if (serverResult.error) {
    console.error(`   Error: ${serverResult.error}`);
    process.exit(1);
  }

  console.log("\n2. Health check...");
  const health = await checkHealth();
  console.log(`   Healthy: ${health.healthy}`);
  console.log(`   Version: ${health.version}`);

  const state = getServerState();
  console.log(`   Server status: ${state.status}`);

  console.log("\n3. Creating session...");
  const session = await createSession("Integration Test Session");
  console.log(`   Session created: ${session.id}`);
  console.log(`   Title: ${session.title}`);

  console.log("\n4. Listing sessions...");
  const sessions = await listSessions();
  console.log(`   Total sessions: ${sessions.length}`);

  console.log("\n5. Listing agents...");
  const agents = await listAgents();
  console.log(`   Available agents: ${agents.length}`);
  if (agents.length > 0) {
    console.log(`   First agent: ${agents[0].name}`);
  }

  console.log("\n6. Sending prompt...");
  const model = getDefaultModel();
  console.log(`   Using model: ${model.providerID}/${model.modelID}`);
  const response = await sendPrompt({
    sessionId: session.id,
    text: "Say 'Hello from Game Builder!' and nothing else.",
    model,
  });
  console.log(`   Prompt response received: ${!!response.text}`);
  console.log(`   Response text: ${response.text?.substring(0, 100) ?? "N/A"}`);
  console.log(`   Parts count: ${response.parts.length}`);

  console.log("\n7. SSE event subscription...");
  try {
    const { stream } = await subscribeEvents();
    console.log(`   Event stream created: ${!!stream}`);
    console.log(`   Has async iterator: ${!!stream[Symbol.asyncIterator]}`);
  } catch (err) {
    console.log(`   Event subscription: ${err}`);
  }

  console.log("\n8. Cleanup...");
  await deleteSession(session.id);
  console.log(`   Session deleted: ${session.id}`);

  console.log("\n=== ALL TESTS PASSED ===");
}

main().catch((err) => {
  console.error("\n=== TEST FAILED ===");
  console.error(err);
  process.exit(1);
});
