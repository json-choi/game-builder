import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { join } from "path";
import { eq, and, gt, isNull } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { deviceLoginCode } from "./db/schema";
import { env } from "./env";

const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401);
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

export function createApp() {
  return new Elysia()
    .use(
      cors({
        origin: env.CORS_ORIGIN,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    )
    .use(betterAuthPlugin)
    .get("/api/health", () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }))
    .get(
      "/api/me",
      ({ user }) => ({ user }),
      { auth: true }
    )
    .post(
      "/api/auth/device/create",
      async ({ user, session: userSession }) => {
        const code = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

        await db.insert(deviceLoginCode).values({
          code,
          userId: user.id,
          sessionToken: userSession.token,
          expiresAt,
        });

        return { code };
      },
      { auth: true }
    )
    .post(
      "/api/auth/device/exchange",
      async ({ body, set }) => {
        const { code } = body as { code: string };

        if (!code) {
          set.status = 400;
          return { error: "Missing code" };
        }

        const now = new Date();
        const [record] = await db
          .select()
          .from(deviceLoginCode)
          .where(
            and(
              eq(deviceLoginCode.code, code),
              gt(deviceLoginCode.expiresAt, now),
              isNull(deviceLoginCode.usedAt)
            )
          )
          .limit(1);

        if (!record) {
          set.status = 401;
          return { error: "Invalid or expired code" };
        }

        await db
          .update(deviceLoginCode)
          .set({ usedAt: now })
          .where(eq(deviceLoginCode.id, record.id));

        if (!record.sessionToken) {
          set.status = 401;
          return { error: "No session token associated" };
        }

        const sessionData = await auth.api.getSession({
          headers: new Headers({
            Authorization: `Bearer ${record.sessionToken}`,
          }),
        });

        if (!sessionData) {
          set.status = 401;
          return { error: "Session expired" };
        }

        return {
          token: record.sessionToken,
          user: {
            id: sessionData.user.id,
            name: sessionData.user.name,
            email: sessionData.user.email,
            image: sessionData.user.image,
          },
        };
      }
    )
    .get("/*", async ({ path }) => {
      const webDir = join(import.meta.dir, "../../web/src");
      const filePath = path === "/" ? "index.html" : path.slice(1);
      const fullPath = join(webDir, filePath);

      try {
        const file = Bun.file(fullPath);
        if (await file.exists()) {
          return file;
        }
        return Bun.file(join(webDir, "index.html"));
      } catch {
        return Bun.file(join(webDir, "index.html"));
      }
    });
}

export type App = ReturnType<typeof createApp>;
