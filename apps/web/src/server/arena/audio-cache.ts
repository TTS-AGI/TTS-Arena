/**
 * On-disk cache for battle audio. Generated clips are written here (not into
 * Postgres — blobs don't belong in the DB) and served by the audio route. The
 * DB session row stores the file paths; cleanup removes both together.
 *
 * Location: AUDIO_CACHE_DIR (default ./.audio-cache), created on demand.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DIR = resolve(process.env.AUDIO_CACHE_DIR ?? ".audio-cache");

let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(DIR, { recursive: true });
  ensured = true;
}

function fileFor(sessionId: string, side: "a" | "b", ext: string): string {
  // sessionId is a server-generated uuid; safe as a filename.
  return join(DIR, `${sessionId}-${side}.${ext}`);
}

export async function writeAudio(
  sessionId: string,
  side: "a" | "b",
  audio: Buffer,
  ext: string,
): Promise<string> {
  await ensureDir();
  const path = fileFor(sessionId, side, ext);
  await writeFile(path, audio);
  return path;
}

export async function readAudio(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Best-effort delete of a session's cached files. */
export async function deleteAudio(paths: string[]): Promise<void> {
  await Promise.all(
    paths.filter(Boolean).map((p) => rm(p, { force: true }).catch(() => {})),
  );
}
