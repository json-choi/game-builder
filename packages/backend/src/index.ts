import { createApp } from "./app";
import { auth } from "./auth";
import { env } from "./env";

createApp().listen(env.PORT);

console.log(
  `🦊 Game Builder API running at http://localhost:${env.PORT}`
);

async function seedTestAccount(): Promise<void> {
  try {
    await auth.api.signUpEmail({
      body: {
        name: "Test User",
        email: "a@a.com",
        password: "a",
      },
    });
    console.log("[seed] Test account created: a@a.com / a");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already") || msg.includes("UNIQUE") || msg.includes("duplicate")) {
      console.log("[seed] Test account already exists");
    } else {
      console.warn("[seed] Could not create test account:", msg);
    }
  }
}

seedTestAccount();

export type { App } from "./app";
