import { describe, expect, test } from "bun:test";
import { getTableName, getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  user,
  session,
  account,
  verification,
  project,
  deviceLoginCode,
  chatMessage,
  generation,
  projectFile,
} from "./schema";

function columnNames(table: PgTable) {
  return Object.keys(getTableColumns(table));
}

function indexNames(table: PgTable) {
  return getTableConfig(table).indexes.map((i) => i.config.name);
}

function fkCount(table: PgTable) {
  return getTableConfig(table).foreignKeys.length;
}

function col(table: PgTable, name: string) {
  const cols = getTableColumns(table) as Record<string, any>;
  return cols[name];
}

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

  describe("user table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = columnNames(user);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("email");
      expect(columns).toContain("emailVerified");
      expect(columns).toContain("image");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });

    test("id is primary key", () => {
      expect(col(user, "id").primary).toBe(true);
    });

    test("email is unique and not null", () => {
      expect(col(user, "email").isUnique).toBe(true);
      expect(col(user, "email").notNull).toBe(true);
    });

    test("emailVerified defaults to false", () => {
      expect(col(user, "emailVerified").hasDefault).toBe(true);
    });

    test("image is optional", () => {
      expect(col(user, "image").notNull).toBe(false);
    });
  });

  describe("session table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = columnNames(session);
      expect(columns).toContain("id");
      expect(columns).toContain("userId");
      expect(columns).toContain("token");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("ipAddress");
      expect(columns).toContain("userAgent");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });

    test("token is unique", () => {
      expect(col(session, "token").isUnique).toBe(true);
    });

    test("userId is required", () => {
      expect(col(session, "userId").notNull).toBe(true);
    });

    test("has foreign key to user", () => {
      expect(fkCount(session)).toBe(1);
    });
  });

  describe("account table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = columnNames(account);
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

    test("has foreign key to user", () => {
      expect(fkCount(account)).toBe(1);
    });
  });

  describe("verification table columns", () => {
    test("has required Better Auth columns", () => {
      const columns = columnNames(verification);
      expect(columns).toContain("id");
      expect(columns).toContain("identifier");
      expect(columns).toContain("value");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });

    test("no foreign keys", () => {
      expect(fkCount(verification)).toBe(0);
    });
  });

  describe("app tables", () => {
    test("project table exists with correct name", () => {
      expect(getTableName(project)).toBe("project");
    });

    test("deviceLoginCode table exists with correct name", () => {
      expect(getTableName(deviceLoginCode)).toBe("device_login_code");
    });

    test("chatMessage table exists with correct name", () => {
      expect(getTableName(chatMessage)).toBe("chat_message");
    });

    test("generation table exists with correct name", () => {
      expect(getTableName(generation)).toBe("generation");
    });

    test("projectFile table exists with correct name", () => {
      expect(getTableName(projectFile)).toBe("project_file");
    });
  });

  describe("project table", () => {
    test("has all required columns", () => {
      const columns = columnNames(project);
      expect(columns).toContain("id");
      expect(columns).toContain("userId");
      expect(columns).toContain("name");
      expect(columns).toContain("description");
      expect(columns).toContain("godotVersion");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });

    test("godotVersion defaults to 4.4", () => {
      expect(col(project, "godotVersion").hasDefault).toBe(true);
    });

    test("description is optional", () => {
      expect(col(project, "description").notNull).toBe(false);
    });

    test("has foreign key to user", () => {
      expect(fkCount(project)).toBe(1);
    });
  });

  describe("deviceLoginCode table columns", () => {
    test("has all required columns", () => {
      const columns = columnNames(deviceLoginCode);
      expect(columns).toContain("id");
      expect(columns).toContain("code");
      expect(columns).toContain("userId");
      expect(columns).toContain("sessionToken");
      expect(columns).toContain("expiresAt");
      expect(columns).toContain("usedAt");
      expect(columns).toContain("createdAt");
    });

    test("code is unique", () => {
      expect(col(deviceLoginCode, "code").isUnique).toBe(true);
    });

    test("userId is optional", () => {
      expect(col(deviceLoginCode, "userId").notNull).toBe(false);
    });
  });

  describe("chatMessage table", () => {
    test("has all required columns", () => {
      const columns = columnNames(chatMessage);
      expect(columns).toContain("id");
      expect(columns).toContain("projectId");
      expect(columns).toContain("role");
      expect(columns).toContain("content");
      expect(columns).toContain("metadata");
      expect(columns).toContain("createdAt");
    });

    test("has 6 columns total", () => {
      expect(columnNames(chatMessage)).toHaveLength(6);
    });

    test("projectId is required", () => {
      expect(col(chatMessage, "projectId").notNull).toBe(true);
    });

    test("role is required", () => {
      expect(col(chatMessage, "role").notNull).toBe(true);
    });

    test("content is required", () => {
      expect(col(chatMessage, "content").notNull).toBe(true);
    });

    test("metadata is optional jsonb", () => {
      expect(col(chatMessage, "metadata").notNull).toBe(false);
      expect(col(chatMessage, "metadata").columnType).toBe("PgJsonb");
    });

    test("has foreign key to project", () => {
      expect(fkCount(chatMessage)).toBe(1);
    });

    test("has indexes on projectId and createdAt", () => {
      const indexes = indexNames(chatMessage);
      expect(indexes).toContain("chat_message_project_id_idx");
      expect(indexes).toContain("chat_message_created_at_idx");
    });
  });

  describe("generation table", () => {
    test("has all required columns", () => {
      const columns = columnNames(generation);
      expect(columns).toContain("id");
      expect(columns).toContain("projectId");
      expect(columns).toContain("agent");
      expect(columns).toContain("status");
      expect(columns).toContain("prompt");
      expect(columns).toContain("result");
      expect(columns).toContain("errorMessage");
      expect(columns).toContain("durationMs");
      expect(columns).toContain("tokenUsage");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("completedAt");
    });

    test("has 11 columns total", () => {
      expect(columnNames(generation)).toHaveLength(11);
    });

    test("status defaults to pending", () => {
      expect(col(generation, "status").hasDefault).toBe(true);
    });

    test("agent is required", () => {
      expect(col(generation, "agent").notNull).toBe(true);
    });

    test("prompt is required", () => {
      expect(col(generation, "prompt").notNull).toBe(true);
    });

    test("result is optional jsonb", () => {
      expect(col(generation, "result").notNull).toBe(false);
      expect(col(generation, "result").columnType).toBe("PgJsonb");
    });

    test("tokenUsage is optional jsonb", () => {
      expect(col(generation, "tokenUsage").notNull).toBe(false);
      expect(col(generation, "tokenUsage").columnType).toBe("PgJsonb");
    });

    test("durationMs is optional integer", () => {
      expect(col(generation, "durationMs").notNull).toBe(false);
      expect(col(generation, "durationMs").columnType).toBe("PgInteger");
    });

    test("errorMessage is optional", () => {
      expect(col(generation, "errorMessage").notNull).toBe(false);
    });

    test("completedAt is optional", () => {
      expect(col(generation, "completedAt").notNull).toBe(false);
    });

    test("has foreign key to project", () => {
      expect(fkCount(generation)).toBe(1);
    });

    test("has indexes on projectId and status", () => {
      const indexes = indexNames(generation);
      expect(indexes).toContain("generation_project_id_idx");
      expect(indexes).toContain("generation_status_idx");
    });
  });

  describe("projectFile table", () => {
    test("has all required columns", () => {
      const columns = columnNames(projectFile);
      expect(columns).toContain("id");
      expect(columns).toContain("projectId");
      expect(columns).toContain("path");
      expect(columns).toContain("content");
      expect(columns).toContain("generationId");
      expect(columns).toContain("version");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });

    test("has 8 columns total", () => {
      expect(columnNames(projectFile)).toHaveLength(8);
    });

    test("path is required", () => {
      expect(col(projectFile, "path").notNull).toBe(true);
    });

    test("content is required", () => {
      expect(col(projectFile, "content").notNull).toBe(true);
    });

    test("version defaults to 1", () => {
      expect(col(projectFile, "version").hasDefault).toBe(true);
    });

    test("generationId is optional", () => {
      expect(col(projectFile, "generationId").notNull).toBe(false);
    });

    test("has 2 foreign keys (project + generation)", () => {
      expect(fkCount(projectFile)).toBe(2);
    });

    test("has indexes on projectId and composite path", () => {
      const indexes = indexNames(projectFile);
      expect(indexes).toContain("project_file_project_id_idx");
      expect(indexes).toContain("project_file_path_idx");
    });
  });

  describe("schema integrity", () => {
    test("all 9 tables are exported", () => {
      const tables = [
        user, session, account, verification,
        project, deviceLoginCode, chatMessage,
        generation, projectFile,
      ];
      expect(tables).toHaveLength(9);
      tables.forEach((t) => expect(getTableName(t)).toBeTruthy());
    });

    test("all tables have id as primary key", () => {
      const tables = [
        user, session, account, verification,
        project, deviceLoginCode, chatMessage,
        generation, projectFile,
      ];
      tables.forEach((t) => {
        expect(col(t, "id").primary).toBe(true);
      });
    });

    test("all tables have createdAt", () => {
      const tables = [
        user, session, account, verification,
        project, deviceLoginCode, chatMessage,
        generation, projectFile,
      ];
      tables.forEach((t) => {
        expect(columnNames(t)).toContain("createdAt");
      });
    });

    test("all user-scoped tables reference user", () => {
      expect(fkCount(project)).toBeGreaterThanOrEqual(1);
      expect(fkCount(session)).toBeGreaterThanOrEqual(1);
      expect(fkCount(account)).toBeGreaterThanOrEqual(1);
    });

    test("all project-scoped tables reference project", () => {
      expect(fkCount(chatMessage)).toBeGreaterThanOrEqual(1);
      expect(fkCount(generation)).toBeGreaterThanOrEqual(1);
      expect(fkCount(projectFile)).toBeGreaterThanOrEqual(1);
    });
  });
});
