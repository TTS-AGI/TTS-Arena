/**
 * Battle session store — persisted in the database, with audio cached on disk.
 *
 * The point: model identity stays server-side until the user votes. The client
 * only ever gets an opaque `sessionId` and two audio URLs ("a"/"b"). Persisting
 * to the DB (rather than process memory) means sessions survive restarts, dev
 * hot-reloads, and multiple instances — fixing the "Session expired" between
 * generate and vote.
 *
 * Audio bytes live on disk (audio-cache); the row stores the paths.
 */
import { eq, lte } from "drizzle-orm";
import type { ModelType } from "@ttsa/shared";
import { SESSION_TTL_SECONDS } from "@ttsa/shared";
import { db, withWriteRetry } from "../db/client";
import { battleSessions } from "../db/schema";
import { deleteAudio, writeAudio } from "./audio-cache";
import { logAudio } from "./audio-log";

export type BattleSide = {
  modelId: string;
  voice: string;
  /** Normalized audio served for playback. */
  audio: Buffer;
  extension: string;
  /** Pre-normalization audio to log to the /audio bucket, if available. */
  rawAudio?: { audio: Buffer; extension: string };
};

export type SessionSide = {
  modelId: string;
  voice: string;
  extension: string;
  logPath: string | null;
};

export type BattleSession = {
  id: string;
  userId: number;
  modelType: ModelType;
  text: string;
  sentenceHash: string;
  a: SessionSide;
  b: SessionSide;
  createdAt: number;
  expiresAt: number;
  voted: boolean;
};

/** Create a session: write audio to disk, persist metadata to the DB. */
export async function createSession(input: {
  userId: number;
  modelType: ModelType;
  text: string;
  sentenceHash: string;
  a: BattleSide;
  b: BattleSide;
}): Promise<BattleSession> {
  const id = crypto.randomUUID();
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_TTL_SECONDS * 1000);

  // Cache the playback audio (short-lived) and log the raw clips (kept) in
  // parallel. Logging is best-effort — a null path just means it's unavailable.
  const logSide = (side: "a" | "b", b: BattleSide) =>
    b.rawAudio
      ? logAudio({
          sessionId: id,
          side,
          audio: b.rawAudio.audio,
          extension: b.rawAudio.extension,
          at: created,
        })
      : Promise.resolve(null);

  const [aPath, bPath, aLogPath, bLogPath] = await Promise.all([
    writeAudio(id, "a", input.a.audio, input.a.extension),
    writeAudio(id, "b", input.b.audio, input.b.extension),
    logSide("a", input.a),
    logSide("b", input.b),
  ]);

  await withWriteRetry(() =>
    db
      .insert(battleSessions)
      .values({
        id,
        userId: input.userId,
        modelType: input.modelType,
        text: input.text,
        sentenceHash: input.sentenceHash,
        aModelId: input.a.modelId,
        aVoice: input.a.voice,
        aPath,
        aExt: input.a.extension,
        aLogPath,
        bModelId: input.b.modelId,
        bVoice: input.b.voice,
        bPath,
        bExt: input.b.extension,
        bLogPath,
        expiresAt: expires,
      })
      .run(),
  );

  return {
    id,
    userId: input.userId,
    modelType: input.modelType,
    text: input.text,
    sentenceHash: input.sentenceHash,
    a: {
      modelId: input.a.modelId,
      voice: input.a.voice,
      extension: input.a.extension,
      logPath: aLogPath,
    },
    b: {
      modelId: input.b.modelId,
      voice: input.b.voice,
      extension: input.b.extension,
      logPath: bLogPath,
    },
    createdAt: created.getTime(),
    expiresAt: expires.getTime(),
    voted: false,
  };
}

/** The on-disk audio path + extension for one side of a live session. */
export type SideAudioRef = { path: string; extension: string };

/** Look up a live (non-expired) session row, evicting it if expired. */
export async function getSession(id: string): Promise<BattleSession | null> {
  const row = await db.query.battleSessions.findFirst({
    where: eq(battleSessions.id, id),
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await purge(id, [row.aPath, row.bPath]);
    return null;
  }
  return {
    id: row.id,
    userId: row.userId,
    modelType: row.modelType as ModelType,
    text: row.text,
    sentenceHash: row.sentenceHash,
    a: {
      modelId: row.aModelId,
      voice: row.aVoice,
      extension: row.aExt,
      logPath: row.aLogPath,
    },
    b: {
      modelId: row.bModelId,
      voice: row.bVoice,
      extension: row.bExt,
      logPath: row.bLogPath,
    },
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    voted: row.voted,
  };
}

/** Audio reference for a side, only if the session is live. */
export async function getSideAudio(
  id: string,
  side: "a" | "b",
): Promise<SideAudioRef | null> {
  const row = await db.query.battleSessions.findFirst({
    where: eq(battleSessions.id, id),
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return side === "a"
    ? { path: row.aPath, extension: row.aExt }
    : { path: row.bPath, extension: row.bExt };
}

/** Delete a session row and its cached audio. */
export async function deleteSession(id: string): Promise<void> {
  const row = await db.query.battleSessions.findFirst({
    where: eq(battleSessions.id, id),
  });
  if (row) await purge(id, [row.aPath, row.bPath]);
}

async function purge(id: string, paths: string[]): Promise<void> {
  await deleteAudio(paths);
  await withWriteRetry(() =>
    db.delete(battleSessions).where(eq(battleSessions.id, id)).run(),
  );
}

/** Sweep expired sessions (DB rows + their disk audio). Returns count removed. */
export async function sweepExpired(): Promise<number> {
  const expired = await db
    .select({
      id: battleSessions.id,
      a: battleSessions.aPath,
      b: battleSessions.bPath,
    })
    .from(battleSessions)
    .where(lte(battleSessions.expiresAt, new Date()));
  for (const s of expired) await purge(s.id, [s.a, s.b]);
  return expired.length;
}
