export const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://gamebuilder:gamebuilder_dev@localhost:5432/gamebuilder",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
  PORT: parseInt(process.env.PORT || "3001", 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
} as const;
