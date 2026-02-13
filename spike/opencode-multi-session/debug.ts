import { createOpencodeClient } from "@opencode-ai/sdk";

const client = createOpencodeClient({ baseUrl: "http://localhost:4096" });

const session = await client.session.create({ body: { title: "Debug Test" } });
console.log("Session created:", JSON.stringify(session, null, 2));

const response = await client.session.prompt({
  path: { id: session.data!.id },
  body: {
    model: { providerID: "anthropic", modelID: "claude-3-5-haiku-20241022" },
    parts: [{ type: "text", text: "Say 'test'" }],
  },
});

console.log("\nPrompt response:", JSON.stringify(response, null, 2));

await client.session.delete({ path: { id: session.data!.id } });
