/**
 * Database client (Postgres via the `postgres` driver + Drizzle). Lazily
 * initialized so importing this module during `next build` (which has no
 * DATABASE_URL) doesn't throw — the connection is only created on first query.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __ttsaSql?: ReturnType<typeof postgres>;
  __ttsaDb?: DrizzleDb;
};

function init(): DrizzleDb {
  if (globalForDb.__ttsaDb) return globalForDb.__ttsaDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = globalForDb.__ttsaSql ?? postgres(url, { max: 10 });
  const instance = drizzle(sql, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__ttsaSql = sql;
    globalForDb.__ttsaDb = instance;
  }
  return instance;
}

/**
 * Proxy that initializes the real Drizzle client on first property access.
 * Callers use `db` exactly as before (`db.query…`, `db.select()…`).
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = init();
    const value = real[prop as keyof DrizzleDb];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = typeof db;
