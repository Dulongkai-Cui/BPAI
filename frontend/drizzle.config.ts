import { defineConfig } from "drizzle-kit";

const defaultDatabaseUrl = "postgresql://bpai:bpai@localhost:5433/bpai_dev";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
