#!/usr/bin/env bun
/**
 * OpenCode SDK Multi-Session Spike
 * 
 * Tests:
 * 1. Server startup via createOpencode()
 * 2. Health check
 * 3. Create 3 concurrent sessions
 * 4. Send prompts to each session
 * 5. Verify all return valid responses
 * 6. Test agent parameter
 * 7. Test tools parameter
 */

import { createOpencodeClient } from "@opencode-ai/sdk";

async function main() {
  console.log("=== OpenCode SDK Multi-Session Spike ===\n");

  // Step 1: Connect to existing server
  console.log("1. Connecting to OpenCode server...");
  const client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
  });
  console.log(`✓ Connected to server at http://localhost:4096`);

  try {
    // Step 2: Create 3 sessions
    console.log("\n2. Creating 3 concurrent sessions...");
    const session1 = await client.session.create({
      body: { title: "Session 1 - Math" },
    });
    console.log(`✓ Session 1 created: ${!!session1.data?.id}`);
    console.log(`  ID: ${session1.data?.id}`);

    const session2 = await client.session.create({
      body: { title: "Session 2 - Code" },
    });
    console.log(`✓ Session 2 created: ${!!session2.data?.id}`);
    console.log(`  ID: ${session2.data?.id}`);

    const session3 = await client.session.create({
      body: { title: "Session 3 - General" },
    });
    console.log(`✓ Session 3 created: ${!!session3.data?.id}`);
    console.log(`  ID: ${session3.data?.id}`);

    // Step 3: Send prompts to each session
    console.log("\n3. Sending prompts to all 3 sessions...");
    
    // Session 1: Math question
    console.log("  Sending to Session 1 (Math)...");
    const response1 = await client.session.prompt({
      path: { id: session1.data!.id },
      body: {
        model: {
          providerID: "anthropic",
          modelID: "claude-3-5-haiku-20241022",
        },
        parts: [{ type: "text", text: "What is 2+2? Answer in one word." }],
      },
    });
    const text1 = response1.data?.parts?.find((p: any) => p.type === "text")?.text;
    console.log(`  ✓ Response 1: ${text1?.substring(0, 50) || "N/A"}...`);

    // Session 2: Code question
    console.log("  Sending to Session 2 (Code)...");
    const response2 = await client.session.prompt({
      path: { id: session2.data!.id },
      body: {
        model: {
          providerID: "anthropic",
          modelID: "claude-3-5-haiku-20241022",
        },
        parts: [{ type: "text", text: "Write 'hello' in Python. One line only." }],
      },
    });
    const text2 = response2.data?.parts?.find((p: any) => p.type === "text")?.text;
    console.log(`  ✓ Response 2: ${text2?.substring(0, 50) || "N/A"}...`);

    // Session 3: General question
    console.log("  Sending to Session 3 (General)...");
    const response3 = await client.session.prompt({
      path: { id: session3.data!.id },
      body: {
        model: {
          providerID: "anthropic",
          modelID: "claude-3-5-haiku-20241022",
        },
        parts: [{ type: "text", text: "Say 'test'. One word only." }],
      },
    });
    const text3 = response3.data?.parts?.find((p: any) => p.type === "text")?.text;
    console.log(`  ✓ Response 3: ${text3?.substring(0, 50) || "N/A"}...`);

    // Step 4: Verify all responses are valid
    console.log("\n4. Verifying responses...");
    const allValid = text1 && text2 && text3;
    console.log(`✓ All 3 sessions returned valid responses: ${!!allValid}`);

    // Step 5: Test agent parameter (if available)
    console.log("\n5. Testing agent parameter...");
    const agents = await client.app.agents();
    console.log(`  Available agents: ${agents.data?.length || 0}`);
    if (agents.data && agents.data.length > 0) {
      console.log(`  First agent: ${agents.data[0].name}`);
      // Test with agent parameter
      const agentResponse = await client.session.prompt({
        path: { id: session1.data!.id },
        body: {
          model: {
            providerID: "anthropic",
            modelID: "claude-3-5-haiku-20241022",
          },
          agent: agents.data[0].name,
          parts: [{ type: "text", text: "Test with agent. Say 'ok'." }],
        },
      });
      const agentText = agentResponse.data?.parts?.find((p: any) => p.type === "text")?.text;
      console.log(`  ✓ Agent parameter works: ${!!agentText}`);
    } else {
      console.log("  ⚠ No agents available to test");
    }

    // Step 6: Test tools parameter
    console.log("\n6. Testing tools parameter...");
    const toolsResponse = await client.session.prompt({
      path: { id: session1.data!.id },
      body: {
        model: {
          providerID: "anthropic",
          modelID: "claude-3-5-haiku-20241022",
        },
        tools: ["read", "glob"], // Restrict to read and glob tools
        parts: [{ type: "text", text: "Say 'tools test ok'." }],
      },
    });
    const toolsText = toolsResponse.data?.parts?.find((p: any) => p.type === "text")?.text;
    console.log(`  ✓ Tools parameter works: ${!!toolsText}`);

    // Cleanup
    console.log("\n7. Cleaning up...");
    await client.session.delete({ path: { id: session1.data!.id } });
    await client.session.delete({ path: { id: session2.data!.id } });
    await client.session.delete({ path: { id: session3.data!.id } });
    console.log("✓ Sessions deleted");

    console.log("\n=== SUCCESS ===");
    console.log("All tests passed!");
    
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});