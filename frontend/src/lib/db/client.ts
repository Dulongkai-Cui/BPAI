import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const defaultDatabaseUrl = "postgresql://bpai:bpai@localhost:5433/bpai_dev";

declare global {
  var __bpaiPgPool: Pool | undefined;
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? defaultDatabaseUrl;
}

function getPool() {
  if (!globalThis.__bpaiPgPool) {
    globalThis.__bpaiPgPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }

  return globalThis.__bpaiPgPool;
}

export function getDb() {
  return drizzle(getPool());
}

export function getDatabaseConnectionInfo() {
  return {
    url: getDatabaseUrl(),
  };
}
