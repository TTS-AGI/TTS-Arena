/**
 * GET /api/tts/audio/:sessionId/:key — stream a battle clip ("a" or "b").
 *
 * Returns audio bytes only; nothing in the response reveals which model
 * produced it. Scoped to the session owner so clips aren't enumerable by
 * others. 410 once the session has expired.
 */
import { currentUser } from "@/server/auth/user";
import { getSession } from "@/server/arena/session-store";

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

  const session = getSession(sessionId);
  if (!session) return new Response("session expired", { status: 410 });
  if (session.userId !== user.id) {
    return new Response("forbidden", { status: 403 });
  }

  const side = session[key];
  const body = new Uint8Array(side.audio);
  return new Response(body, {
    headers: {
      "Content-Type": MIME[side.extension] ?? "application/octet-stream",
      "Content-Length": String(side.audio.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
