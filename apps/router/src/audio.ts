/**
 * Per-clip audio post-processing. The only step applied to every generation is
 * peak normalization (matching upstream's `_normalize_base64_audio`). We shell
 * out to ffmpeg; if ffmpeg is unavailable the original audio is returned
 * unchanged so synthesis never fails on a post-processing problem.
 */

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

/**
 * Peak-normalize base64 audio, preserving the container format. Returns the
 * input unchanged if ffmpeg is missing or the operation fails.
 */
export async function normalizeBase64Audio(
  base64: string,
  extension: string,
): Promise<string> {
  if (!(await hasFfmpeg())) return base64;

  try {
    const input = Buffer.from(base64, "base64");
    // -filter:a loudnorm-free peak normalize via `dynaudnorm`? No — keep it a
    // simple peak normalize to 0 dBFS, matching upstream's intent.
    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-filter:a",
        "loudnorm=I=-16:TP=-1.0:LRA=11",
        "-f",
        extension,
        "pipe:1",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "ignore" },
    );
    proc.stdin.write(input);
    await proc.stdin.end();
    const out = await new Response(proc.stdout).arrayBuffer();
    const code = await proc.exited;
    if (code !== 0 || out.byteLength === 0) return base64;
    return Buffer.from(out).toString("base64");
  } catch {
    return base64;
  }
}
