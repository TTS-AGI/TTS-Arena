/**
 * GET /api/tts/audio/:sessionId/:key — stream a battle clip ("a" or "b").
 *
 * Returns audio bytes only; nothing in the response reveals which model
 * produced it. Scoped to the session owner so clips aren't enumerable by
 * others. 410 once the session has expired.
 */
import { currentUser } from "@/server/auth/user";
import { getSession, getSideAudio } from "@/server/arena/session-store";
import { readAudio } from "@/server/arena/audio-cache";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string; key: string }> },
) {
  const { sessionId, key } = await ctx.params;
  if (key !== "a" && key !== "b") {
    return new Response("not found", { status: 404 });
  }

  const user = await currentUser();
  if (!user) return new Response("login required", { status: 401 });

  // Ownership check (also confirms the session is live).
  const session = await getSession(sessionId);
  if (!session) return new Response("session expired", { status: 410 });
  if (session.userId !== user.id) {
    return new Response("forbidden", { status: 403 });
  }

  const ref = await getSideAudio(sessionId, key);
  if (!ref) return new Response("session expired", { status: 410 });
  const audio = await readAudio(ref.path);
  if (!audio) return new Response("audio unavailable", { status: 410 });

  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": MIME[ref.extension] ?? "application/octet-stream",
      "Content-Length": String(audio.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
