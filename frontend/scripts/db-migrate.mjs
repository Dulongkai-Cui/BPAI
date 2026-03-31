import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const db = drizzle(pool);

  await migrate(db, {
    migrationsFolder: "./drizzle",
  });

  console.log(`Applied database migrations using ${databaseUrl}`);
} finally {
  await pool.end();
}
