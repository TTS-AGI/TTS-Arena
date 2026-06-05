/**
 * Database client (SQLite + Drizzle). Lazily initialized so importing this
 * module during `next build` doesn't open the file. The DB lives at SQLITE_PATH
 * (the /data persistent bucket on the Space; a local file in dev) — a single
 * file the bucket can store reliably, unlike a Postgres dir.
 *
 * Driver is chosen by runtime:
 *   - Bun (the Space's web server + router, and `bun run`): the built-in
 *     `bun:sqlite`, which needs no native module. better-sqlite3's prebuilt
 *     binary is compiled against Node's V8 ABI and crashes under Bun with
 *     "undefined symbol: _ZN2v8...".
 *   - Node (Next.js `next dev`/`next build`, drizzle-kit): `better-sqlite3`.
 */
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Drizzle's bun-sqlite and better-sqlite3 drivers expose an identical query API
// over our schema, so we type the client as one concrete driver. This keeps
// every call site (db.select/insert/...) correctly typed; the actual driver is
// chosen at runtime below.
type DrizzleDb = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as {
  __ttsaDb?: DrizzleDb;
};

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

function dbPath(): string {
  return resolve(
    process.env.SQLITE_PATH ?? process.env.DATABASE_URL ?? "./tts_arena.db",
  );
}

function init(): DrizzleDb {
  if (globalForDb.__ttsaDb) return globalForDb.__ttsaDb;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });

  let instance: DrizzleDb;
  if (isBun) {
    // `bun:sqlite` + drizzle's bun-sqlite driver. Typed loosely because the Bun
    // module types aren't available in the Node typecheck/build; the runtime
    // query API is identical to better-sqlite3, so we cast to DrizzleDb.
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
    const { Database } = require("bun:sqlite");
    const { drizzle } = require("drizzle-orm/bun-sqlite");
    const sqlite = new Database(path);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    sqlite.exec("PRAGMA busy_timeout = 5000;");
    instance = drizzle(sqlite, { schema }) as any;
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
  } else {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const Database =
      require("better-sqlite3") as typeof import("better-sqlite3");
    const { drizzle } =
      require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    instance = drizzle(sqlite, { schema });
  }

  globalForDb.__ttsaDb = instance;
  return instance;
}

/**
 * Proxy that initializes the real Drizzle client on first property access, so
 * callers use `db` exactly as before.
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = typeof db;

function isLockedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /database is locked|SQLITE_BUSY/i.test(msg);
}

/**
 * Run a DB write, retrying on "database is locked".
 *
 * bun:sqlite does NOT honor `busy_timeout` for write transactions — a second
 * writer fails immediately instead of waiting. So when the periodic cleanup
 * sweep (or a concurrent request) holds the write lock, an un-retried write
 * throws and the request 500s. This wrapper retries with small randomized
 * backoff so contended writes wait their turn instead of failing.
 *
 * The callback should be self-contained (use the driver's transaction for
 * multi-statement writes) so a retry re-runs cleanly.
 */
export async function withWriteRetry<T>(
  fn: () => T | Promise<T>,
  tries = 12,
): Promise<T> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isLockedError(err) || attempt === tries - 1) throw err;
      const backoff = 8 * (attempt + 1) * (1 + Math.random());
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("withWriteRetry: exhausted retries");
}
