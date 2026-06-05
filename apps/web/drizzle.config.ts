import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.SQLITE_PATH ?? process.env.DATABASE_URL ?? "./tts_arena.db",
  },
  strict: true,
  verbose: true,
});
