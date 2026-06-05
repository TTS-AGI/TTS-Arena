/**
 * Audio logging: long-term storage of generated audio. Distinct from the
 * short-lived battle audio cache — these are the PRE-normalization clips, kept
 * (not swept) so each recorded vote can point at the exact audio it concerned.
 *
 * Location: AUDIO_LOG_DIR (the /audio persistent bucket on the Space; defaults
 * to ./.audio-log locally). Disabled (no-op, returns null) when the dir can't
 * be created, so logging never blocks a generation.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DIR = resolve(process.env.AUDIO_LOG_DIR ?? ".audio-log");

let ready: boolean | null = null;
async function ensureDir(): Promise<boolean> {
  if (ready !== null) return ready;
  try {
    await mkdir(DIR, { recursive: true });
    ready = true;
  } catch {
    ready = false;
  }
  return ready;
}

/**
 * Log a raw clip. Files are foldered by date for manageable bucket listings:
 * <DIR>/<YYYY-MM-DD>/<sessionId>-<side>.<ext>. Returns the stored path
 * (relative to DIR) or null if logging is unavailable.
 */
export async function logAudio(params: {
  sessionId: string;
  side: "a" | "b";
  audio: Buffer;
  extension: string;
  at?: Date;
}): Promise<string | null> {
  if (!(await ensureDir())) return null;
  try {
    const day = (params.at ?? new Date()).toISOString().slice(0, 10);
    const rel = join(
      day,
      `${params.sessionId}-${params.side}.${params.extension}`,
    );
    const abs = join(DIR, rel);
    await mkdir(join(DIR, day), { recursive: true });
    await writeFile(abs, params.audio);
    return rel;
  } catch {
    return null;
  }
}
