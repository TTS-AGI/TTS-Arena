/**
 * Apply Drizzle migrations using bun:sqlite — run under Bun on the Space.
 *
 * We don't use `drizzle-kit migrate` at runtime because it loads better-sqlite3
 * (a native module compiled for Node's V8 ABI), which crashes under Bun and was
 * even broken for Node in the Space image. `bun:sqlite` is built into Bun and
 * needs no native module, so it always works in our runtime.
 *
 * Reads the generated SQL files in ./drizzle in journal order, runs the ones
 * not yet recorded in the drizzle migrations table, each in a transaction.
 *
 * Run with: bun run src/server/db/migrate.ts
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type JournalEntry = { idx: number; tag: string };
type Journal = { entries: JournalEntry[] };

function dbPath(): string {
  return resolve(
    process.env.SQLITE_PATH ?? process.env.DATABASE_URL ?? "./tts_arena.db",
  );
}

function migrationsDir(): string {
  // This file lives at apps/web/src/server/db; migrations are at apps/web/drizzle.
  return resolve(import.meta.dir, "../../../drizzle");
}

function main() {
  const dir = migrationsDir();
  const journal = JSON.parse(
    readFileSync(join(dir, "meta", "_journal.json"), "utf8"),
  ) as Journal;

  const path = dbPath();
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Drizzle's bookkeeping table (matches what drizzle-kit/drizzle-orm use).
  db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
  );`);

  const applied = new Set(
    (
      db.query("SELECT hash FROM __drizzle_migrations").all() as {
        hash: string;
      }[]
    ).map((r) => r.hash),
  );

  let count = 0;
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const tag = entry.tag; // e.g. "0000_harsh_master_mold"
    if (applied.has(tag)) continue;
    const sql = readFileSync(join(dir, `${tag}.sql`), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    const tx = db.transaction(() => {
      for (const stmt of statements) db.exec(stmt);
      db.query(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      ).run(tag, Date.now());
    });
    try {
      tx();
    } catch (err) {
      // Surface the real failure (and which migration) — a swallowed migrate is
      // how the DB silently ends up missing columns.
      console.error(
        `[migrate] FAILED on ${tag}:`,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
    count++;
    console.info(`applied migration ${tag}`);
  }

  console.info(
    count === 0 ? "no pending migrations" : `applied ${count} migration(s)`,
  );
  db.close();
}

main();
