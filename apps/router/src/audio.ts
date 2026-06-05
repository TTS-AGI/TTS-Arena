/**
 * Per-clip audio normalization. Every generated clip is run through ffmpeg to
 * a single consistent format and loudness, so no model gets an unfair edge from
 * being louder, quieter, or higher-bitrate than another:
 *
 *   - loudness: EBU R128 `loudnorm` to -16 LUFS (TP -1.5 dBTP)
 *   - format:   MP3, 44.1 kHz, 192 kbps
 *
 * If ffmpeg is unavailable or the pass fails, the original audio is returned
 * unchanged (with its original extension) so synthesis never fails on a
 * post-processing problem.
 */

/** Canonical output for normalized audio. */
export const NORMALIZED_EXTENSION = "mp3";
const TARGET_LUFS = -16;
const TARGET_TP = -1.5;
const SAMPLE_RATE = 44_100;
const BITRATE = "192k";

let ffmpegAvailable: boolean | null = null;

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const proc = Bun.spawn(["ffmpeg", "-version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    ffmpegAvailable = (await proc.exited) === 0;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

export type NormalizedAudio = { base64: string; extension: string };

/**
 * Normalize loudness and transcode to a consistent format. Returns the result
 * with its (possibly new) extension. On any failure, returns the input
 * unchanged with its original extension.
 */
export async function normalizeAudio(
  base64: string,
  extension: string,
): Promise<NormalizedAudio> {
  if (!(await hasFfmpeg())) return { base64, extension };

  try {
    const input = Buffer.from(base64, "base64");
    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        // EBU R128 loudness normalization to a broadcast-standard target.
        "-af",
        `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11`,
        "-ar",
        String(SAMPLE_RATE),
        "-c:a",
        "libmp3lame",
        "-b:a",
        BITRATE,
        "-f",
        "mp3",
        "pipe:1",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "ignore" },
    );
    proc.stdin.write(input);
    await proc.stdin.end();
    const out = await new Response(proc.stdout).arrayBuffer();
    const code = await proc.exited;
    if (code !== 0 || out.byteLength === 0) return { base64, extension };
    return {
      base64: Buffer.from(out).toString("base64"),
      extension: NORMALIZED_EXTENSION,
    };
  } catch {
    return { base64, extension };
  }
}
