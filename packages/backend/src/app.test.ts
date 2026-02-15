import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockInsert = mock(() => ({ values: mock(() => Promise.resolve()) }));
const mockSelectChain = {
  from: mock(() => ({
    where: mock(() => ({
      limit: mock(() =>
        Promise.resolve([
          {
            id: "device-1",
            code: "valid-code",
            userId: "user-1",
            sessionToken: "session-token-1",
            expiresAt: new Date(Date.now() + 300_000),
            usedAt: null,
            createdAt: new Date(),
          },
        ])
      ),
    })),
  })),
};
const mockSelect = mock(() => mockSelectChain);
const mockUpdate = mock(() => ({
  set: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}));

mock.module("./db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

type SessionResult = {
  user: { id: string; name: string; email: string; image: string | null };
  session: { token: string };
} | null;

const mockGetSession = mock((): Promise<SessionResult> =>
  Promise.resolve({
    user: { id: "user-1", name: "Test User", email: "test@test.com", image: null },
    session: { token: "session-token-1" },
  })
);

mock.module("./auth", () => ({
  auth: {
    handler: () => new Response(JSON.stringify({ ok: true })),
    api: {
      getSession: mockGetSession,
    },
  },
}));

const { createApp } = await import("./app");

describe("app", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-1", name: "Test User", email: "test@test.com", image: null },
        session: { token: "session-token-1" },
      })
    );
  });

  afterEach(() => {
    mock.restore();
  });

  describe("GET /api/health", () => {
    test("returns status ok with timestamp", async () => {
      const res = await app.handle(new Request("http://localhost/api/health"));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });

    test("timestamp is valid ISO string", async () => {
      const before = new Date().toISOString();
      const res = await app.handle(new Request("http://localhost/api/health"));
      const data = await res.json();
      const after = new Date().toISOString();

      expect(data.timestamp >= before).toBe(true);
      expect(data.timestamp <= after).toBe(true);
    });
  });

  describe("GET /api/me", () => {
    test("returns user when authenticated", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/me", {
          headers: { Authorization: "Bearer valid-token" },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe("user-1");
      expect(data.user.email).toBe("test@test.com");
    });

    test("returns 401 when not authenticated", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const res = await app.handle(new Request("http://localhost/api/me"));

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/device/create", () => {
    test("creates device code for authenticated user", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/auth/device/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-token",
          },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.code).toBeDefined();
      expect(typeof data.code).toBe("string");
      expect(data.code.length).toBeGreaterThan(0);
    });

    test("returns 401 when not authenticated", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const res = await app.handle(
        new Request("http://localhost/api/auth/device/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(res.status).toBe(401);
    });

    test("inserts record into database", async () => {
      const valuesFn = mock(() => Promise.resolve());
      mockInsert.mockImplementation(() => ({ values: valuesFn }));

      await app.handle(
        new Request("http://localhost/api/auth/device/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-token",
          },
        })
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(valuesFn).toHaveBeenCalled();
      const calls = valuesFn.mock.calls as unknown as unknown[][];
      const insertArg = calls[0][0] as Record<string, unknown>;
      expect(insertArg.userId).toBe("user-1");
      expect(insertArg.sessionToken).toBe("session-token-1");
      expect(insertArg.code).toBeDefined();
      expect(insertArg.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("POST /api/auth/device/exchange", () => {
    test("exchanges valid code for token and user", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "valid-code" }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.token).toBe("session-token-1");
      expect(data.user.id).toBe("user-1");
      expect(data.user.name).toBe("Test User");
      expect(data.user.email).toBe("test@test.com");
    });

    test("returns 400 when code is missing", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("Missing code");
    });

    test("returns 401 when code is invalid or expired", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      const res = await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "invalid-code" }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Invalid or expired code");
    });

    test("returns 401 when record has no session token", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  id: "device-2",
                  code: "no-session-code",
                  userId: "user-1",
                  sessionToken: null,
                  expiresAt: new Date(Date.now() + 300_000),
                  usedAt: null,
                  createdAt: new Date(),
                },
              ])
            ),
          })),
        })),
      }));

      const res = await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "no-session-code" }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("No session token associated");
    });

    test("returns 401 when session has expired", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  id: "device-1",
                  code: "valid-code",
                  userId: "user-1",
                  sessionToken: "session-token-1",
                  expiresAt: new Date(Date.now() + 300_000),
                  usedAt: null,
                  createdAt: new Date(),
                },
              ])
            ),
          })),
        })),
      }));
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const res = await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "valid-code" }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Session expired");
    });

    test("marks code as used after exchange", async () => {
      const whereFn = mock(() => Promise.resolve());
      const setFn = mock(() => ({ where: whereFn }));
      mockUpdate.mockImplementation(() => ({ set: setFn }));

      await app.handle(
        new Request("http://localhost/api/auth/device/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "valid-code" }),
        })
      );

      expect(mockUpdate).toHaveBeenCalled();
      expect(setFn).toHaveBeenCalled();
      const setCalls = setFn.mock.calls as unknown as unknown[][];
      const setArg = setCalls[0][0] as Record<string, unknown>;
      expect(setArg.usedAt).toBeInstanceOf(Date);
    });
  });
});
