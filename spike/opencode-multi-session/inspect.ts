import { createOpencode } from "@opencode-ai/sdk";

const { client, server } = await createOpencode();
console.log("Client keys:", Object.keys(client));
console.log("\nClient structure:");
for (const key of Object.keys(client)) {
  const val = (client as any)[key];
  console.log(`  ${key}: ${typeof val}`);
  if (typeof val === "object" && val !== null) {
    console.log(`    Methods: ${Object.keys(val).join(", ")}`);
  }
}
server.close();
