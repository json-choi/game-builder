import { describe, expect, test } from "bun:test";
import { env } from "./env";

describe("env", () => {
  test("DATABASE_URL has default value", () => {
    expect(env.DATABASE_URL).toBe(
      "postgresql://gamebuilder:gamebuilder_dev@localhost:5432/gamebuilder"
    );
  });

  test("BETTER_AUTH_SECRET has default value", () => {
    expect(env.BETTER_AUTH_SECRET).toBe("dev-secret-change-in-production");
  });

  test("BETTER_AUTH_URL has default value", () => {
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3001");
  });

  test("PORT is a number with default 3001", () => {
    expect(typeof env.PORT).toBe("number");
    expect(env.PORT).toBe(3001);
  });

  test("CORS_ORIGIN has default value", () => {
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
  });

  test("GOOGLE_CLIENT_ID defaults to empty string", () => {
    expect(env.GOOGLE_CLIENT_ID).toBe("");
  });

  test("GOOGLE_CLIENT_SECRET defaults to empty string", () => {
    expect(env.GOOGLE_CLIENT_SECRET).toBe("");
  });

  test("GITHUB_CLIENT_ID defaults to empty string", () => {
    expect(env.GITHUB_CLIENT_ID).toBe("");
  });

  test("GITHUB_CLIENT_SECRET defaults to empty string", () => {
    expect(env.GITHUB_CLIENT_SECRET).toBe("");
  });

  test("all expected keys are present", () => {
    const keys = Object.keys(env);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("BETTER_AUTH_SECRET");
    expect(keys).toContain("BETTER_AUTH_URL");
    expect(keys).toContain("GOOGLE_CLIENT_ID");
    expect(keys).toContain("GOOGLE_CLIENT_SECRET");
    expect(keys).toContain("GITHUB_CLIENT_ID");
    expect(keys).toContain("GITHUB_CLIENT_SECRET");
    expect(keys).toContain("PORT");
    expect(keys).toContain("CORS_ORIGIN");
  });
});
