/**
 * GET /api/admin/tests/audio/:name — stream a Test All sample by its stored
 * filename. Admin only. Files are temporary (cleared on restart by design).
 */
import { readFile } from "node:fs/promises";
import { requireAdmin } from "@/server/auth/admin";
import { testAudioAbsPath } from "@/server/admin/test-runner";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  flac: "audio/flac",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return new Response("forbidden", { status: guard.status });
  }
  const { name } = await ctx.params;
  // testAudioAbsPath strips any path separators, so traversal is impossible.
  const path = testAudioAbsPath(decodeURIComponent(name));
  let audio: Buffer;
  try {
    audio = await readFile(path);
  } catch {
    return new Response("audio unavailable", { status: 410 });
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(audio.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
