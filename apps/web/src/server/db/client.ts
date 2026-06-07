/**
 * Database client (Postgres + Drizzle). Lazily initialized so importing this
 * module during `next build` doesn't open a connection. The DB lives at
 * DATABASE_URL — a Postgres server (on a VPS in production, reached directly
 * over TLS on the public internet; a local container in dev).
 *
 * We moved off SQLite: a single SQLite file on HF's network-backed bucket kept
 * corrupting ("database disk image is malformed") because bun:sqlite's locking
 * is unreliable on a network filesystem. Postgres is a real networked DB with
 * proper concurrency, so the per-write retry / journal-mode workarounds are gone.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "./schema";

// pg returns bigint (int8, OID 20) and numeric (OID 1700) as STRINGS by
// default. Our queries use count(*)/sum() and expect plain numbers, so parse
// them as JS numbers. Counts here are tiny (well within Number.MAX_SAFE_INTEGER).
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

type DrizzleDb = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __ttsaDb?: DrizzleDb;
  __ttsaPool?: Pool;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — a Postgres connection string is required.",
    );
  }
  return url;
}

/**
 * Build the connection options for a pg Pool from DATABASE_URL.
 *
 * The VPS Postgres uses a self-signed cert, so we must encrypt the connection
 * but NOT verify the CA chain. The catch: as of pg 8.21 / pg-connection-string
 * 2.13, a `sslmode=require` in the URL is parsed by pg-connection-string into
 * its OWN ssl config and treated as `verify-full` — which rejects a self-signed
 * cert and OVERRIDES the explicit `ssl` option we pass. (It "CONNECT_FAIL: self
 * signed certificate" even with ssl.rejectUnauthorized=false.)
 *
 * So we strip `sslmode` from the URL ourselves and pass `ssl` purely as an
 * explicit option object — that's the only combination pg honors for a
 * self-signed cert. `sslmode=require`/`prefer`/`no-verify` in the URL (or
 * PGSSL_NO_VERIFY=1) still selects "encrypt without verifying the CA".
 */
export function poolConfig(url: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
} {
  const wantsSsl =
    /sslmode=(require|prefer|no-verify)/.test(url) ||
    process.env.PGSSL_NO_VERIFY === "1";
  // Remove any sslmode param so pg-connection-string doesn't impose verify-full.
  const cleanUrl = url
    .replace(/([?&])sslmode=[^&]*(&|$)/, (_m, p1, p2) => (p2 === "&" ? p1 : ""))
    .replace(/[?&]$/, "");
  return {
    connectionString: cleanUrl,
    ssl: wantsSsl ? { rejectUnauthorized: false } : false,
  };
}

function init(): DrizzleDb {
  if (globalForDb.__ttsaDb) return globalForDb.__ttsaDb;
  const url = connectionString();
  const pool = new Pool({
    ...poolConfig(url),
    // Modest pool — the web server is the only writer and traffic is light.
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Surface pool-level errors instead of crashing the process.
  pool.on("error", (err) => {
    console.error("[db] pool error:", err.message);
  });
  const instance = drizzle(pool, { schema });
  globalForDb.__ttsaPool = pool;
  globalForDb.__ttsaDb = instance;
  return instance;
}

/**
 * Proxy that initializes the real Drizzle client on first property access, so
 * callers use `db` exactly as before (and `next build` doesn't connect).
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = typeof db;

/**
 * Run a DB write. Kept as a thin wrapper for call-site compatibility — under
 * SQLite this retried on "database is locked", which Postgres doesn't need
 * (proper row/table locking + MVCC). It now just runs the callback.
 */
export async function withWriteRetry<T>(fn: () => T | Promise<T>): Promise<T> {
  return await fn();
}
