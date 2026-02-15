import { describe, expect, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import {
  user,
  session,
  account,
  verification,
  project,
  deviceLoginCode,
} from "./schema";

describe("schema", () => {
  describe("Better Auth core tables", () => {
    test("user table exists with correct name", () => {
      expect(getTableName(user)).toBe("user");
    });

    test("session table exists with correct name", () => {
      expect(getTableName(session)).toBe("session");
    });

    test("account table exists with correct name", () => {
      expect(getTableName(account)).toBe("account");
    });

    test("verification table exists with correct name", () => {
      expect(getTableName(verification)).toBe("verification");
    });
  });

  describe("app tables", () => {
    test("project table exists with correct name", () => {
      expect(getTableName(project)).toBe("project");
    });

    test("deviceLoginCode table exists with correct name", () => {
      expect(getTableName(deviceLoginCode)).toBe("device_login_code");
    });
  });

  describe("user table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = Object.keys(user);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("email");
      expect(columns).toContain("emailVerified");
      expect(columns).toContain("image");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("session table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = Object.keys(session);
      expect(columns).toContain("id");
      expect(columns).toContain("userId");
      expect(columns).toContain("token");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("ipAddress");
      expect(columns).toContain("userAgent");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("account table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = Object.keys(account);
      expect(columns).toContain("id");
      expect(columns).toContain("userId");
      expect(columns).toContain("accountId");
      expect(columns).toContain("providerId");
      expect(columns).toContain("accessToken");
      expect(columns).toContain("refreshToken");
      expect(columns).toContain("accessTokenExpiresAt");
      expect(columns).toContain("refreshTokenExpiresAt");
      expect(columns).toContain("scope");
      expect(columns).toContain("idToken");
      expect(columns).toContain("password");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("verification table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = Object.keys(verification);
      expect(columns).toContain("id");
      expect(columns).toContain("identifier");
      expect(columns).toContain("value");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("deviceLoginCode table columns", () => {
    test("has all required columns", () => {
      const columns = Object.keys(deviceLoginCode);
      expect(columns).toContain("id");
      expect(columns).toContain("code");
      expect(columns).toContain("userId");
      expect(columns).toContain("sessionToken");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("usedAt");
      expect(columns).toContain("createdAt");
    });
  });
});
