/**
 * Apply Drizzle migrations to Postgres. Uses drizzle-orm's node-postgres
 * migrator over the generated SQL in ./drizzle. Idempotent — only unapplied
 * migrations run, each in its own transaction, recorded in drizzle's bookkeeping
 * table.
 *
 * Run with: bun run src/server/db/migrate.ts  (or node)
 */
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { poolConfig } from "./client";

function migrationsFolder(): string {
  // This file lives at apps/web/src/server/db; migrations are at apps/web/drizzle.
  return resolve(import.meta.dir ?? __dirname, "../../../drizzle");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }
  // Reuse the same SSL/URL handling as the app client so migrations connect to
  // the self-signed-TLS VPS Postgres (see poolConfig for why sslmode is stripped).
  const pool = new Pool({ ...poolConfig(url), max: 1 });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
    console.info("[migrate] migrations applied");
  } catch (err) {
    console.error(
      "[migrate] FAILED:",
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
    await pool.end();
    process.exit(1);
  }
  await pool.end();
}

main();
