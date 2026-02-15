import { describe, expect, test, mock } from "bun:test";

// Mock db before importing auth
mock.module("./db", () => ({
  db: {},
}));

const { auth } = await import("./auth");

describe("auth", () => {
  describe("configuration", () => {
    test("auth instance is defined", () => {
      expect(auth).toBeDefined();
    });

    test("auth has handler function for Elysia mount", () => {
      expect(auth.handler).toBeDefined();
      expect(typeof auth.handler).toBe("function");
    });

    test("auth has api with getSession", () => {
      expect(auth.api).toBeDefined();
      expect(auth.api.getSession).toBeDefined();
      expect(typeof auth.api.getSession).toBe("function");
    });

    test("auth has api with signUpEmail", () => {
      expect(auth.api.signUpEmail).toBeDefined();
      expect(typeof auth.api.signUpEmail).toBe("function");
    });

    test("auth has api with signInEmail", () => {
      expect(auth.api.signInEmail).toBeDefined();
      expect(typeof auth.api.signInEmail).toBe("function");
    });

    test("auth has api with signOut", () => {
      expect(auth.api.signOut).toBeDefined();
      expect(typeof auth.api.signOut).toBe("function");
    });
  });
});
