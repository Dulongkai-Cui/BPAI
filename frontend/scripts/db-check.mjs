import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const versionResult = await pool.query(
    "select current_database() as database_name, current_user as database_user, version() as server_version",
  );
  const extensionResult = await pool.query(
    "select extname from pg_extension where extname = 'postgis'",
  );

  console.log(
    JSON.stringify(
      {
        databaseUrl,
        database: versionResult.rows[0]?.database_name ?? null,
        user: versionResult.rows[0]?.database_user ?? null,
        serverVersion: versionResult.rows[0]?.server_version ?? null,
        postgisEnabled: extensionResult.rowCount > 0,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
